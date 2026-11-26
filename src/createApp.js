const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const COURSE_FILE = path.join(DATA_DIR, 'course.json');
const IS_SERVERLESS = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ENROLLMENTS_FILE = IS_SERVERLESS
  ? '/tmp/enrollments.json'
  : path.join(DATA_DIR, 'enrollments.json');
const CONTACTS_FILE = IS_SERVERLESS
  ? '/tmp/contacts.json'
  : path.join(DATA_DIR, 'contacts.json');

const OTP_SECRET = process.env.OTP_SECRET || 'apex-study-academy-otp-secret';
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

function signPayload(payloadObj) {
  const b64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', OTP_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifySignedPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', OTP_SECRET).update(b64).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function createApp({ serveStatic = true } = {}) {
  const app = express();
  app.use(express.json());

  if (serveStatic) {
    app.use(
      express.static(path.join(ROOT_DIR, 'public'), {
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        },
      })
    );
  }

  const router = express.Router();

  router.get('/course', (_req, res) => {
    const config = readJson(COURSE_FILE, null);
    if (!config) {
      return res.status(500).json({ ok: false, error: 'Course configuration missing' });
    }
    const enrollments = readJson(ENROLLMENTS_FILE, []);
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

  router.post('/send-otp', (req, res) => {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        ok: false,
        error: 'Please enter a valid 10-digit Indian mobile number.',
      });
    }

    const code = String(Math.floor(1000 + Math.random() * 9000));
    const exp = Date.now() + 5 * 60 * 1000;
    otpStore.set(phone, { code, expiresAt: exp, verifiedToken: null });

    const challenge = signPayload({ phone, code, exp });
    res.setHeader(
      'Set-Cookie',
      `otp_challenge=${encodeURIComponent(challenge)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`
    );

    res.json({
      ok: true,
      message: `OTP sent to +91 ${phone}`,
      demoOtp: code,
    });
  });

  router.post('/verify-otp', (req, res) => {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const otp = String(req.body.otp || '').trim();

    const entry = otpStore.get(phone);
    const cookies = parseCookies(req.headers.cookie);
    const cookieData = verifySignedPayload(cookies.otp_challenge);

    const memValid = entry && Date.now() <= entry.expiresAt && entry.code === otp;
    const cookieValid = cookieData && cookieData.phone === phone && cookieData.code === otp;

    if (!memValid && !cookieValid) {
      if (!entry && !cookieData) {
        return res.status(400).json({ ok: false, error: 'Please request an OTP first.' });
      }
      return res.status(400).json({ ok: false, error: 'Incorrect or expired OTP. Please try again.' });
    }

    const token = signPayload({ phone, verified: true, exp: Date.now() + 15 * 60 * 1000 });
    if (entry) {
      entry.verifiedToken = token;
      otpStore.set(phone, entry);
    }

    res.json({ ok: true, token, phone });
  });

  router.post('/enroll', (req, res) => {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const token = String(req.body.token || '');
    const classGrade = Number(req.body.classGrade);
    const studentName = String(req.body.studentName || '').trim().slice(0, 60);

    const tokenPayload = verifySignedPayload(token);
    if (!tokenPayload || !tokenPayload.verified || tokenPayload.phone !== phone) {
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

    const enrollments = readJson(ENROLLMENTS_FILE, []);
    enrollments.push(record);
    writeJson(ENROLLMENTS_FILE, enrollments);
    otpStore.delete(phone);

    res.json({
      ok: true,
      order: record,
      beStudents: config.course.beStudents + enrollments.length,
    });
  });

  router.get('/enrollments', (_req, res) => {
    const enrollments = readJson(ENROLLMENTS_FILE, []);
    res.json({ ok: true, count: enrollments.length, enrollments });
  });

  router.post('/contact', (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const classGrade = String(req.body.classGrade || '').trim().slice(0, 20);
    const message = String(req.body.message || '').trim().slice(0, 500);

    if (!name || !/^[6-9]\d{9}$/.test(phone) || !message) {
      return res.status(400).json({
        ok: false,
        error: 'Please enter your name, a valid 10-digit mobile number, and a message.',
      });
    }

    const contacts = readJson(CONTACTS_FILE, []);
    const inquiry = {
      id: `INQ-${Date.now().toString().slice(-6)}`,
      name,
      phone,
      classGrade,
      message,
      createdAt: new Date().toISOString(),
    };
    contacts.push(inquiry);
    writeJson(CONTACTS_FILE, contacts);

    res.json({ ok: true, inquiry });
  });

  app.use('/api', router);
  app.use('/.netlify/functions/api', router);

  return app;
}

module.exports = { createApp };
