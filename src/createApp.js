const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  getPayuConfig,
  createHostedPaymentSession,
  verifyReverseHash,
  verifyHostedTransaction,
  createPaymentLink,
  getPaymentLinkStatus,
} = require('./payu');
const bundledCourseConfig = require('../data/course.json');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const COURSE_FILE = fs.existsSync(path.join(DATA_DIR, 'course.json'))
  ? path.join(DATA_DIR, 'course.json')
  : path.join(process.cwd(), 'data', 'course.json');
const IS_SERVERLESS = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ENROLLMENTS_FILE = IS_SERVERLESS
  ? '/tmp/enrollments.json'
  : path.join(DATA_DIR, 'enrollments.json');
const CONTACTS_FILE = IS_SERVERLESS
  ? '/tmp/contacts.json'
  : path.join(DATA_DIR, 'contacts.json');

function readCourseConfig() {
  return readJson(COURSE_FILE, bundledCourseConfig);
}

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

/**
 * Escapes HTML special characters before interpolating strings into callback markup.
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Computes external request origin behind localhost or Netlify reverse proxies.
 */
function getRequestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

/**
 * Persists an enrollment idempotently by orderId and returns the updated student count.
 */
function saveEnrollment({
  orderId,
  mihpayid,
  classGrade,
  studentName,
  phone,
  config,
  amountPaid,
  status,
  paymentGateway,
}) {
  const enrollments = readJson(ENROLLMENTS_FILE, []);
  const existing = enrollments.find((item) => item.orderId === orderId);
  if (existing) {
    return {
      order: existing,
      beStudents: config.course.beStudents + enrollments.length,
    };
  }

  const { id, title, schedule, price } = config.course;
  const record = {
    orderId,
    ...(mihpayid ? { mihpayid } : {}),
    courseId: id,
    courseTitle: title,
    schedule,
    classGrade,
    studentName: studentName || 'Young Scholar',
    phone,
    amountPaid: amountPaid ?? price,
    ...(paymentGateway ? { paymentGateway } : {}),
    status,
    createdAt: new Date().toISOString(),
  };

  enrollments.push(record);
  writeJson(ENROLLMENTS_FILE, enrollments);
  if (phone) otpStore.delete(phone);

  return {
    order: record,
    beStudents: config.course.beStudents + enrollments.length,
  };
}

/**
 * Renders the PayU surl/furl callback page and notifies the parent/opener window cleanly.
 */
function renderPayuCallbackPage(payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const title = payload.ok ? 'Payment Confirmed!' : 'Payment Not Completed';
  const subtitle = payload.ok
    ? `Order ${escapeHtml(payload.txnid)} verified. Issuing your seat pass now...`
    : escapeHtml(payload.error || 'Payment was cancelled or declined.');
  const badge = payload.ok ? '✓' : '!';
  const badgeColor = payload.ok ? '#16a34a' : '#dc2626';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Apex Study Academy</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f5f3ff; color: #1e1b4b; display: grid; place-items: center; min-height: 100vh; padding: 20px; }
    .card { max-width: 420px; width: 100%; background: #fff; border: 1px solid #ddd6fe; border-radius: 16px; padding: 28px 24px; text-align: center; box-shadow: 0 12px 30px rgba(67,56,202,0.12); }
    .badge { width: 52px; height: 52px; border-radius: 999px; background: ${badgeColor}; color: #fff; font-size: 26px; font-weight: 800; display: inline-grid; place-items: center; margin-bottom: 14px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 1.5; }
    a.btn { display: inline-block; background: linear-gradient(135deg, #4338ca, #7c3aed); color: #fff; text-decoration: none; font-weight: 700; padding: 10px 20px; border-radius: 999px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${badge}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <a href="/" class="btn" id="return-btn">Return to Apex Study Academy</a>
  </div>
  <script>
    (function () {
      var data = ${safeJson};
      var msg = Object.assign({ type: 'APEX_PAYU_CALLBACK' }, data);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, window.location.origin);
        }
      } catch (e) {}
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(msg, window.location.origin);
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

function createApp({ serveStatic = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

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
    const config = readCourseConfig();
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

    const config = readCourseConfig();

    const { classes, soldOutClasses, price, id, title, schedule } = config.course;
    if (!classes.includes(classGrade) || soldOutClasses.includes(classGrade)) {
      return res.status(400).json({ ok: false, error: 'Selected class is not available.' });
    }

    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const result = saveEnrollment({
      orderId,
      classGrade,
      studentName,
      phone,
      config,
      amountPaid: price,
      status: 'CONFIRMED',
    });

    res.json({
      ok: true,
      order: result.order,
      beStudents: result.beStudents,
    });
  });

  router.get('/enrollments', (_req, res) => {
    const enrollments = readJson(ENROLLMENTS_FILE, []);
    res.json({ ok: true, count: enrollments.length, enrollments });
  });

  router.get('/payu/config', (_req, res) => {
    const cfg = getPayuConfig();
    res.json({
      ok: true,
      env: cfg.env,
      mode: cfg.hasHostedCredentials ? 'hosted' : 'payment_links',
      hasCredentials: cfg.hasCredentials,
      isFullyConfigured: cfg.isFullyConfigured,
    });
  });

  router.post('/payu/create-order', async (req, res) => {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const token = String(req.body.token || '');
    const classGrade = Number(req.body.classGrade);
    const studentName = String(req.body.studentName || '').trim().slice(0, 60);

    const tokenPayload = verifySignedPayload(token);
    if (!tokenPayload || !tokenPayload.verified || tokenPayload.phone !== phone) {
      return res.status(401).json({ ok: false, error: 'Phone verification required.' });
    }

    const config = readCourseConfig();
    const { classes, soldOutClasses, price, title, schedule } = config.course;
    if (!classes.includes(classGrade) || soldOutClasses.includes(classGrade)) {
      return res.status(400).json({ ok: false, error: 'Selected class is not available.' });
    }

    const txnid = `APEX${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
    const cfg = getPayuConfig();

    try {
      if (cfg.hasHostedCredentials) {
        const origin = getRequestOrigin(req);
        const callbackUrl = `${origin}/api/payu/callback`;
        const result = await createHostedPaymentSession({
          amount: price,
          txnid,
          productinfo: `${title} - Class ${classGrade}`,
          firstname: studentName || 'Young Scholar',
          email: `${phone}@student.apexstudy.in`,
          phone,
          surl: callbackUrl,
          furl: callbackUrl,
          udf1: String(classGrade),
          udf2: schedule,
        });

        if (!result.ok) {
          return res.status(502).json(result);
        }

        return res.json({
          ok: true,
          mode: result.mode,
          paymentUrl: result.paymentUrl,
          checkoutUrl: result.checkoutUrl,
          params: result.params,
          txnid,
          invoiceNumber: txnid,
          amount: price,
          env: result.env,
        });
      }

      const result = await createPaymentLink({
        amount: price,
        invoiceNumber: txnid,
        description: `${title} - Class ${classGrade}`,
        customerName: studentName || 'Young Scholar',
        customerPhone: phone,
      });

      if (!result.ok) {
        return res.status(result.missing === 'merchantId' ? 400 : 502).json(result);
      }

      res.json({
        ok: true,
        mode: 'hosted',
        paymentUrl: result.paymentUrl,
        txnid,
        invoiceNumber: txnid,
        amount: price,
        env: result.env,
      });
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message || 'PayU gateway error.' });
    }
  });

  router.post('/payu/verify-payment', async (req, res) => {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const token = String(req.body.token || '');
    const classGrade = Number(req.body.classGrade);
    const studentName = String(req.body.studentName || '').trim().slice(0, 60);
    const txnid = String(req.body.txnid || req.body.invoiceNumber || '').trim();

    const tokenPayload = verifySignedPayload(token);
    if (!tokenPayload || !tokenPayload.verified || tokenPayload.phone !== phone) {
      return res.status(401).json({ ok: false, error: 'Phone verification required.' });
    }
    if (!txnid) {
      return res.status(400).json({ ok: false, error: 'Missing transaction ID.' });
    }

    try {
      const cfg = getPayuConfig();
      const statusRes = cfg.hasHostedCredentials
        ? await verifyHostedTransaction(txnid)
        : await getPaymentLinkStatus(txnid);

      const config = readCourseConfig();
      const expectedPrice = Number(config.course.price);
      if (!statusRes.paid || (statusRes.amount > 0 && statusRes.amount < expectedPrice)) {
        return res.status(402).json({
          ok: false,
          paid: false,
          status: statusRes.status,
          error: `Payment status is ${statusRes.status}. Complete payment in PayU and verify again.`,
        });
      }

      const saved = saveEnrollment({
        orderId: txnid,
        mihpayid: statusRes.mihpayid,
        classGrade,
        studentName,
        phone,
        config,
        amountPaid: expectedPrice,
        paymentGateway: 'PayU',
        status: 'PAID',
      });

      res.json({
        ok: true,
        paid: true,
        order: saved.order,
        beStudents: saved.beStudents,
      });
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message || 'Could not verify PayU payment.' });
    }
  });

  router.all('/payu/callback', async (req, res) => {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const txnid = String(payload.txnid || '').trim();
    const status = String(payload.status || '').toLowerCase();
    const config = readCourseConfig();

    if (!txnid || !verifyReverseHash(payload)) {
      return res
        .status(400)
        .type('html')
        .send(
          renderPayuCallbackPage({
            ok: false,
            txnid,
            status: status || 'invalid',
            error: 'Could not validate PayU payment signature. Please verify manually below.',
          })
        );
    }

    if (status !== 'success') {
      const reason = payload.error_Message || payload.field9 || `Payment status: ${status || 'failed'}`;
      return res.type('html').send(
        renderPayuCallbackPage({
          ok: false,
          txnid,
          status,
          error: reason,
        })
      );
    }

    try {
      const verified = await verifyHostedTransaction(txnid);
      const expectedPrice = Number(config.course.price);
      if (!verified.paid || (verified.amount > 0 && verified.amount < expectedPrice)) {
        return res.type('html').send(
          renderPayuCallbackPage({
            ok: false,
            txnid,
            status: verified.status,
            error: `PayU verification status: ${verified.status}. Please retry or click Verify.`,
          })
        );
      }

      const parsedClass = Number(payload.udf1);
      const classGrade = config.course.classes.includes(parsedClass) ? parsedClass : 5;
      const phone = String(payload.phone || '').replace(/\D/g, '').slice(-10);
      const saved = saveEnrollment({
        orderId: txnid,
        mihpayid: verified.mihpayid || String(payload.mihpayid || ''),
        classGrade,
        studentName: String(payload.firstname || 'Young Scholar').trim().slice(0, 60),
        phone,
        config,
        amountPaid: expectedPrice,
        paymentGateway: 'PayU',
        status: 'PAID',
      });

      return res.type('html').send(
        renderPayuCallbackPage({
          ok: true,
          txnid,
          mihpayid: verified.mihpayid || payload.mihpayid || '',
          status: 'success',
          order: saved.order,
          beStudents: saved.beStudents,
        })
      );
    } catch (err) {
      return res.status(502).type('html').send(
        renderPayuCallbackPage({
          ok: false,
          txnid,
          status: 'error',
          error: err.message || 'Verification failed. Click Verify & Get Ticket to confirm.',
        })
      );
    }
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
