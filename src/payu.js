function getPayuConfig() {
  const env = (process.env.PAYU_ENV || 'uat').toLowerCase() === 'prod' ? 'prod' : 'uat';
  const clientId = (process.env.PAYU_CLIENT_ID || '').trim();
  const clientSecret = (process.env.PAYU_CLIENT_SECRET || '').trim();
  const merchantId = (process.env.PAYU_MERCHANT_ID || '').trim();

  const accountsBase = env === 'prod' ? 'https://accounts.payu.in' : 'https://uat-accounts.payu.in';
  const apiBase = env === 'prod' ? 'https://oneapi.payu.in' : 'https://uatoneapi.payu.in';

  return {
    env,
    clientId,
    clientSecret,
    merchantId,
    accountsBase,
    apiBase,
    hasCredentials: Boolean(clientId && clientSecret),
    isFullyConfigured: Boolean(clientId && clientSecret && merchantId),
  };
}

let cachedToken = null;
let cachedTokenExp = 0;

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
  cachedTokenExp = Date.now() + (Number(data.expires_in || 3600) * 1000);
  return cachedToken;
}

async function createPaymentLink({ amount, invoiceNumber, description, customerName, customerPhone }) {
  const cfg = getPayuConfig();
  if (!cfg.hasCredentials) {
    return { ok: false, missing: 'credentials', error: 'PayU Client ID / Secret not configured.' };
  }
  if (!cfg.merchantId) {
    return {
      ok: false,
      missing: 'merchantId',
      error: 'PAYU_MERCHANT_ID is required in .env (or Netlify Environment Variables) to create PayU payment links.',
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
    paymentUrl,
    invoiceNumber,
    env: cfg.env,
    raw: data?.result || data,
  };
}

async function getPaymentLinkStatus(invoiceNumber) {
  const cfg = getPayuConfig();
  if (!cfg.isFullyConfigured) {
    return { ok: false, error: 'PayU is not fully configured.' };
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
    raw: data?.result || data,
  };
}

module.exports = {
  getPayuConfig,
  getAccessToken,
  createPaymentLink,
  getPaymentLinkStatus,
};
