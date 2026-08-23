import { env } from './env.js';

const SANDBOX_BASE = 'https://sandbox.sslcommerz.com';
const LIVE_BASE = 'https://securepay.sslcommerz.com';

function apiBaseUrl(): string {
  return (env.API_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, '');
}

export function sslCommerzApiBase(): string {
  return env.SSLCOMMERZ_IS_SANDBOX ? SANDBOX_BASE : LIVE_BASE;
}

export function isSslCommerzConfigured(): boolean {
  return Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);
}

export function sslCommerzStoreId(): string | undefined {
  return env.SSLCOMMERZ_STORE_ID;
}

export function sslCommerzStorePassword(): string | undefined {
  return env.SSLCOMMERZ_STORE_PASSWORD;
}

export function sslCommerzCallbackUrls() {
  const base = env.APP_URL.replace(/\/$/, '');

  return {
    successUrl: env.SSLCOMMERZ_SUCCESS_URL ?? `${base}/payment/return?sslcommerz=success`,
    failUrl: env.SSLCOMMERZ_FAIL_URL ?? `${base}/payment/return?sslcommerz=fail`,
    cancelUrl: env.SSLCOMMERZ_CANCEL_URL ?? `${base}/payment/return?sslcommerz=cancel`,
    ipnUrl: env.SSLCOMMERZ_IPN_URL ?? `${apiBaseUrl()}/v1/billing/sslcommerz/ipn`,
  };
}

export function getSslCommerzPublicConfig() {
  return {
    configured: isSslCommerzConfigured(),
    sandbox: env.SSLCOMMERZ_IS_SANDBOX,
    apiBase: sslCommerzApiBase(),
    ...sslCommerzCallbackUrls(),
  };
}

/** SSLCommerz session init endpoint (v4 API). */
export function sslCommerzInitUrl(): string {
  return `${sslCommerzApiBase()}/gwprocess/v4/api.php`;
}

/** SSLCommerz payment validation endpoint. */
export function sslCommerzValidationUrl(): string {
  return `${sslCommerzApiBase()}/validator/api/validationserverAPI.php`;
}
