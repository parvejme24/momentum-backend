import { AppError } from './errors.js';
import {
  isSslCommerzConfigured,
  sslCommerzInitUrl,
  sslCommerzStoreId,
  sslCommerzStorePassword,
  sslCommerzValidationUrl,
} from './sslcommerz.js';

type SslCommerzInitResponse = {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
};

export type SslCommerzValidationResponse = {
  status?: string;
  APIConnect?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  store_amount?: string;
  currency?: string;
  currency_type?: string;
  currency_amount?: string;
  currency_rate?: string;
  card_type?: string;
  bank_tran_id?: string;
  risk_level?: string | number;
  risk_title?: string;
};

function storeCredentials() {
  const storeId = sslCommerzStoreId();
  const storePassword = sslCommerzStorePassword();
  if (!storeId || !storePassword) {
    throw new AppError('SSLCommerz is not configured', 503, 'SSLCOMMERZ_NOT_CONFIGURED');
  }
  return { storeId, storePassword };
}

export function requireSslCommerzConfigured(): void {
  if (!isSslCommerzConfigured()) {
    throw new AppError('SSLCommerz is not configured', 503, 'SSLCOMMERZ_NOT_CONFIGURED');
  }
}

export function createSslCommerzTranId(userId: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const compactUser = userId.replace(/-/g, '').slice(0, 8);
  return `mom${Date.now().toString(36)}${compactUser}${suffix}`.slice(0, 30);
}

export async function initSslCommerzSession(input: {
  tranId: string;
  amount: number;
  currency: string;
  productName: string;
  productCategory: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  userId: string;
  planId: string;
  seats: number;
}): Promise<{ gatewayUrl: string; sessionKey?: string }> {
  const { storeId, storePassword } = storeCredentials();

  if (input.amount < 10) {
    throw AppError.validation('Check the highlighted fields', [
      {
        field: 'planId',
        issue: 'SSLCommerz requires a minimum amount of 10.00',
      },
    ]);
  }

  const body = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: input.amount.toFixed(2),
    currency: input.currency.toUpperCase(),
    tran_id: input.tranId,
    success_url: input.successUrl,
    fail_url: input.failUrl,
    cancel_url: input.cancelUrl,
    ipn_url: input.ipnUrl,
    cus_name: input.customerName.slice(0, 50) || 'Customer',
    cus_email: input.customerEmail.slice(0, 50),
    cus_add1: 'Dhaka',
    cus_city: 'Dhaka',
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    cus_phone: input.customerPhone.slice(0, 20) || '01700000000',
    shipping_method: 'NO',
    product_name: input.productName.slice(0, 255),
    product_category: input.productCategory.slice(0, 50),
    product_profile: 'non-physical-goods',
    value_a: input.userId,
    value_b: input.planId,
    value_c: String(input.seats),
  });

  const response = await fetch(sslCommerzInitUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new AppError('Could not start SSLCommerz checkout', 502, 'SSLCOMMERZ_INIT_FAILED');
  }

  const payload = (await response.json()) as SslCommerzInitResponse;
  if (payload.status !== 'SUCCESS' || !payload.GatewayPageURL) {
    throw new AppError(
      payload.failedreason ?? 'SSLCommerz rejected the checkout session',
      502,
      'SSLCOMMERZ_INIT_FAILED',
    );
  }

  return {
    gatewayUrl: payload.GatewayPageURL,
    ...(payload.sessionkey ? { sessionKey: payload.sessionkey } : {}),
  };
}

export async function validateSslCommerzPayment(
  valId: string,
): Promise<SslCommerzValidationResponse> {
  const { storeId, storePassword } = storeCredentials();
  const url = new URL(sslCommerzValidationUrl());
  url.searchParams.set('val_id', valId);
  url.searchParams.set('store_id', storeId);
  url.searchParams.set('store_passwd', storePassword);
  url.searchParams.set('v', '1');
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError('SSLCommerz validation failed', 502, 'SSLCOMMERZ_VALIDATION_FAILED');
  }

  const payload = (await response.json()) as SslCommerzValidationResponse;
  if (payload.APIConnect && payload.APIConnect !== 'DONE') {
    throw new AppError(
      `SSLCommerz validation API connection failed (${payload.APIConnect})`,
      502,
      'SSLCOMMERZ_VALIDATION_FAILED',
    );
  }

  return payload;
}

/** IPN / success callbacks use VALID. After Order Validation API, status becomes VALIDATED. */
export function isSslCommerzPaidStatus(status: string | undefined): boolean {
  return status === 'VALID' || status === 'VALIDATED';
}

export function amountCentsFromSslCommerz(amount: string | undefined): number {
  const parsed = Number.parseFloat(amount ?? '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Validate paid amount against what we stored at checkout.
 * SSLCommerz settles in BDT: when you send USD, `amount` is BDT converted,
 * while `currency_amount` + `currency_type` are the original charge.
 */
export function assertSslCommerzAmountMatches(input: {
  expectedAmountCents: number;
  expectedCurrency: string;
  validation: SslCommerzValidationResponse;
}): number {
  const expectedCurrency = input.expectedCurrency.toUpperCase();
  const currencyType = (input.validation.currency_type ?? expectedCurrency).toUpperCase();
  const currencyAmountCents = amountCentsFromSslCommerz(input.validation.currency_amount);
  const settledAmountCents = amountCentsFromSslCommerz(input.validation.amount);

  const paidInExpectedCurrency =
    currencyType === expectedCurrency && currencyAmountCents > 0
      ? currencyAmountCents
      : expectedCurrency === 'BDT'
        ? settledAmountCents
        : 0;

  if (paidInExpectedCurrency <= 0) {
    throw AppError.conflict('Could not verify SSLCommerz paid amount');
  }

  // Allow 1 cent rounding tolerance
  if (paidInExpectedCurrency + 1 < input.expectedAmountCents) {
    throw AppError.conflict('Paid amount is lower than the plan price');
  }

  return paidInExpectedCurrency;
}

export function isSslCommerzHighRisk(validation: SslCommerzValidationResponse): boolean {
  return String(validation.risk_level ?? '0') === '1';
}
