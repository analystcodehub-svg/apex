const crypto = require('crypto');

/**
 * Returns active PayU gateway configuration and endpoints from environment variables.
 */
function getPayuConfig() {
  const env = (process.env.PAYU_ENV || 'uat').toLowerCase() === 'prod' ? 'prod' : 'uat';
  const key = (process.env.PAYU_KEY || '').trim();
  const salt = (process.env.PAYU_SALT || '').trim();
  const clientId = (process.env.PAYU_CLIENT_ID || '').trim();
  const clientSecret = (process.env.PAYU_CLIENT_SECRET || '').trim();
  const merchantId = (process.env.PAYU_MERCHANT_ID || '').trim();

  const checkoutUrl =
    env === 'prod' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment';
  const infoUrl =
    env === 'prod'
      ? 'https://info.payu.in/merchant/postservice.php?form=2'
      : 'https://test.payu.in/merchant/postservice.php?form=2';
  const accountsBase = env === 'prod' ? 'https://accounts.payu.in' : 'https://uat-accounts.payu.in';
  const apiBase = env === 'prod' ? 'https://oneapi.payu.in' : 'https://uatoneapi.payu.in';

  const hasHostedCredentials = Boolean(key && salt);
  const hasOAuthCredentials = Boolean(clientId && clientSecret);

  return {
    env,
    key,
    salt,
    clientId,
    clientSecret,
    merchantId,
    checkoutUrl,
    infoUrl,
    accountsBase,
    apiBase,
    hasHostedCredentials,
    hasOAuthCredentials,
    hasCredentials: hasHostedCredentials || hasOAuthCredentials,
    isFullyConfigured: hasHostedCredentials || Boolean(hasOAuthCredentials && merchantId),
  };
}

/**
 * Computes lowercase SHA-512 hex digest for PayU signatures.
 */
function sha512(input) {
  return crypto.createHash('sha512').update(String(input)).digest('hex');
}

/**
 * Strips pipe characters and unsafe punctuation so user inputs cannot alter PayU hash fields.
 */
function sanitizeHashField(value, maxLen = 80, fallback = '') {
  const cleaned = String(value || '')
    .replace(/[|<>]/g, ' ')
    .replace(/[^\w\s.,@+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

/**
 * Builds signed PayU Hosted Checkout parameters and requests a live checkout session URL.
 */
async function createHostedPaymentSession({
  amount,
  txnid,
  productinfo,
  firstname,
  email,
  phone,
  surl,
  furl,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
}) {
  const cfg = getPayuConfig();
  if (!cfg.hasHostedCredentials) {
    return {
      ok: false,
      missing: 'credentials',
      error: 'PAYU_KEY and PAYU_SALT must be configured in environment variables.',
    };
  }

  const amtStr = Number(amount).toFixed(2);
  const cleanProduct = sanitizeHashField(productinfo, 100, 'Course Enrollment');
  const cleanName = sanitizeHashField(firstname, 50, 'Student');
  const cleanEmail = sanitizeHashField(email, 80, `${phone}@student.apexstudy.in`);
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(0, 15);
  const u1 = sanitizeHashField(udf1, 50);
  const u2 = sanitizeHashField(udf2, 50);
  const u3 = sanitizeHashField(udf3, 50);
  const u4 = sanitizeHashField(udf4, 50);
  const u5 = sanitizeHashField(udf5, 50);

  // PayU forward hash sequence: key|txnid|amount|productinfo|firstname|email|udf1..5||||||salt
  const hashString = [
    cfg.key,
    txnid,
    amtStr,
    cleanProduct,
    cleanName,
    cleanEmail,
    u1,
    u2,
    u3,
    u4,
    u5,
    '',
    '',
    '',
    '',
    '',
    cfg.salt,
  ].join('|');
  const hash = sha512(hashString);

  const params = {
    key: cfg.key,
    txnid,
    amount: amtStr,
    productinfo: cleanProduct,
    firstname: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    surl,
    furl,
    udf1: u1,
    udf2: u2,
    udf3: u3,
    udf4: u4,
    udf5: u5,
    hash,
  };

  const res = await fetch(cfg.checkoutUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  const redirectLocation = res.headers.get('location') || '';
  if (res.status >= 300 && res.status < 400 && redirectLocation.startsWith('https://')) {
    return {
      ok: true,
      mode: 'hosted',
      paymentUrl: redirectLocation,
      checkoutUrl: cfg.checkoutUrl,
      params,
      txnid,
      env: cfg.env,
    };
  }

  if (res.ok) {
    return {
      ok: true,
      mode: 'form',
      paymentUrl: '',
      checkoutUrl: cfg.checkoutUrl,
      params,
      txnid,
      env: cfg.env,
    };
  }

  return {
    ok: false,
    error: `PayU checkout initialization failed (HTTP ${res.status}).`,
  };
}

/**
 * Verifies the reverse SHA-512 signature sent by PayU in surl/furl callback payloads.
 */
function verifyReverseHash(payload) {
  const cfg = getPayuConfig();
  if (!cfg.hasHostedCredentials || !payload || !payload.hash) return false;
  if (String(payload.key || '') !== cfg.key) return false;

  const baseFields = [
    cfg.salt,
    String(payload.status || ''),
    '',
    '',
    '',
    '',
    '',
    String(payload.udf5 || ''),
    String(payload.udf4 || ''),
    String(payload.udf3 || ''),
    String(payload.udf2 || ''),
    String(payload.udf1 || ''),
    String(payload.email || ''),
    String(payload.firstname || ''),
    String(payload.productinfo || ''),
    String(payload.amount || ''),
    String(payload.txnid || ''),
    String(payload.key || ''),
  ];

  if (payload.additionalCharges) {
    baseFields.unshift(String(payload.additionalCharges));
  }

  const expected = sha512(baseFields.join('|'));
  const received = String(payload.hash || '').toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Queries PayU Merchant Web Service verify_payment API to confirm final transaction status.
 */
async function verifyHostedTransaction(txnid) {
  const cfg = getPayuConfig();
  if (!cfg.hasHostedCredentials) {
    return { ok: false, paid: false, error: 'PayU Key / Salt not configured.' };
  }

  const hash = sha512(`${cfg.key}|verify_payment|${txnid}|${cfg.salt}`);
  const res = await fetch(cfg.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      key: cfg.key,
      command: 'verify_payment',
      var1: txnid,
      hash,
    }),
  });

  const data = await res.json();
  const details = data?.transaction_details || {};
  const txn = details[txnid] || details[String(txnid).toLowerCase()] || null;
  const txnStatus = String(txn?.status || '').toLowerCase();
  const paid = data?.status === 1 && txnStatus === 'success';

  return {
    ok: res.ok,
    paid,
    status: txn?.status ? String(txn.status).toUpperCase() : 'PENDING',
    mihpayid: txn?.mihpayid && txn.mihpayid !== 'Not Found' ? String(txn.mihpayid) : '',
    amount: Number(txn?.amt || 0),
    raw: txn || data,
  };
}

let cachedToken = null;
let cachedTokenExp = 0;

/**
 * Obtains an OAuth access token for PayU OneAPI Payment Links if merchantId is configured.
 */
async function getAccessToken(cfg) {
  if (cachedToken && Date.now() < cachedTokenExp - 30000) {
    return cachedToken;
  }

  const res = await fetch(`${cfg.accountsBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: 'create_payment_links read_payment_links',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'PayU OAuth authentication failed');
  }

  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

/**
 * Fallback OneAPI Payment Link creator when PAYU_MERCHANT_ID is used without Key/Salt.
 */
async function createPaymentLink({ amount, invoiceNumber, description, customerName, customerPhone }) {
  const cfg = getPayuConfig();
  if (!cfg.hasOAuthCredentials) {
    return { ok: false, missing: 'credentials', error: 'PayU credentials not configured.' };
  }
  if (!cfg.merchantId) {
    return {
      ok: false,
      missing: 'merchantId',
      error: 'PAYU_MERCHANT_ID is required for Payment Links (or configure PAYU_KEY + PAYU_SALT).',
    };
  }

  const token = await getAccessToken(cfg);
  const res = await fetch(`${cfg.apiBase}/payment-links/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      merchantId: cfg.merchantId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subAmount: Number(amount),
      invoiceNumber,
      description,
      customerName: customerName || 'Student',
      customerPhone,
      isPartialPaymentAllowed: false,
      source: 'API',
    }),
  });

  const data = await res.json();
  const paymentUrl =
    data?.result?.paymentLink ||
    data?.result?.url ||
    data?.paymentLink ||
    data?.url;

  if (!res.ok || !paymentUrl) {
    return {
      ok: false,
      error: data?.message || 'Could not generate PayU payment link.',
      details: data,
    };
  }

  return {
    ok: true,
    mode: 'hosted',
    paymentUrl,
    txnid: invoiceNumber,
    invoiceNumber,
    env: cfg.env,
    raw: data?.result || data,
  };
}

/**
 * Fallback OneAPI Payment Link status lookup when using PAYU_MERCHANT_ID.
 */
async function getPaymentLinkStatus(invoiceNumber) {
  const cfg = getPayuConfig();
  if (!cfg.hasOAuthCredentials || !cfg.merchantId) {
    return { ok: false, paid: false, error: 'PayU Payment Links is not configured.' };
  }

  const token = await getAccessToken(cfg);
  const res = await fetch(`${cfg.apiBase}/payment-links/${encodeURIComponent(invoiceNumber)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      merchantId: cfg.merchantId,
    },
  });

  const data = await res.json();
  const status = String(data?.result?.status || data?.status || '').toUpperCase();
  const paid = ['PAID', 'SUCCESS', 'CAPTURED', 'COMPLETED'].includes(status);

  return {
    ok: res.ok,
    paid,
    status: status || 'PENDING',
    amount: Number(data?.result?.subAmount || 0),
    raw: data?.result || data,
  };
}

module.exports = {
  getPayuConfig,
  getAccessToken,
  createHostedPaymentSession,
  verifyReverseHash,
  verifyHostedTransaction,
  createPaymentLink,
  getPaymentLinkStatus,
};
