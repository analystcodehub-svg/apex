const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const COURSE_FILE = path.join(DATA_DIR, 'course.json');
const ENROLLMENTS_FILE = path.join(DATA_DIR, 'enrollments.json');

app.use(express.json());
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);

// In-memory OTP store: phone -> { code, expiresAt, verifiedToken }
const otpStore = new Map();

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getEnrollments() {
  return readJson(ENROLLMENTS_FILE, []);
}

app.get('/api/course', (_req, res) => {
  const config = readJson(COURSE_FILE, null);
  if (!config) {
    return res.status(500).json({ ok: false, error: 'Course configuration missing' });
  }
  const enrollments = getEnrollments();
  const dynamicStudents = config.course.beStudents + enrollments.length;
  const remainingSeats = Math.max(2, config.course.remainingSeats - (enrollments.length % 6));

  const recentBubbles = enrollments
    .slice(-5)
    .reverse()
    .map((item, idx) => ({
      name: item.studentName || `Student ${item.phone.slice(-4)}`,
      city: 'India',
      classNum: item.classGrade,
      avatar: `/images/avatar-${(idx % 4) + 1}.svg`,
    }));

  res.json({
    ok: true,
    brandName: config.brandName,
    course: {
      ...config.course,
      beStudents: dynamicStudents,
      remainingSeats,
    },
    images: config.images,
    facultyStats: config.facultyStats || [],
    faculty: config.faculty || [],
    toppers: config.toppers || [],
    reviews: config.reviews || [],
    orderBubbles: [...recentBubbles, ...config.orderBubbles].slice(0, 8),
  });
});

app.post('/api/send-otp', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      ok: false,
      error: 'Please enter a valid 10-digit Indian mobile number.',
    });
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
    verifiedToken: null,
  });

  // Return demoOtp so local testing works without an external SMS gateway
  res.json({
    ok: true,
    message: `OTP sent to +91 ${phone}`,
    demoOtp: code,
  });
});

app.post('/api/verify-otp', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const otp = String(req.body.otp || '').trim();
  const entry = otpStore.get(phone);

  if (!entry) {
    return res.status(400).json({ ok: false, error: 'Please request an OTP first.' });
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ ok: false, error: 'OTP expired. Please resend OTP.' });
  }
  if (entry.code !== otp) {
    return res.status(400).json({ ok: false, error: 'Incorrect OTP. Please try again.' });
  }

  const token = crypto.randomBytes(16).toString('hex');
  entry.verifiedToken = token;
  otpStore.set(phone, entry);

  res.json({
    ok: true,
    token,
    phone,
  });
});

app.post('/api/enroll', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const token = String(req.body.token || '');
  const classGrade = Number(req.body.classGrade);
  const studentName = String(req.body.studentName || '').trim().slice(0, 60);

  const entry = otpStore.get(phone);
  if (!entry || !entry.verifiedToken || entry.verifiedToken !== token) {
    return res.status(401).json({ ok: false, error: 'Phone verification required.' });
  }

  const config = readJson(COURSE_FILE, null);
  if (!config) {
    return res.status(500).json({ ok: false, error: 'Course config unavailable.' });
  }

  const { classes, soldOutClasses, price, id, title, schedule } = config.course;
  if (!classes.includes(classGrade) || soldOutClasses.includes(classGrade)) {
    return res.status(400).json({ ok: false, error: 'Selected class is not available.' });
  }

  const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const record = {
    orderId,
    courseId: id,
    courseTitle: title,
    schedule,
    classGrade,
    studentName: studentName || 'Young Scholar',
    phone,
    amountPaid: price,
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
  };

  const enrollments = getEnrollments();
  enrollments.push(record);
  writeJson(ENROLLMENTS_FILE, enrollments);

  otpStore.delete(phone);

  res.json({
    ok: true,
    order: record,
    beStudents: config.course.beStudents + enrollments.length,
  });
});

app.get('/api/enrollments', (_req, res) => {
  const enrollments = getEnrollments();
  res.json({ ok: true, count: enrollments.length, enrollments });
});

app.listen(PORT, () => {
  console.log(`Coaching Class server running at http://localhost:${PORT}`);
});
