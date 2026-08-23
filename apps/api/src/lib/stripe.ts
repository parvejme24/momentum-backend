import Stripe from 'stripe';
import { env } from './env.js';
import { AppError } from './errors.js';

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function stripeSecretKey(): string | undefined {
  return present(env.STRIPE_SECRET_KEY) ?? present(env.SECRET_KEY);
}

export function stripePublishableKey(): string {
  return present(env.STRIPE_PUBLISHABLE_KEY) ?? present(env.PUBLISHABLE_KEY) ?? '';
}

export function stripeWebhookSecret(): string | undefined {
  return present(env.STRIPE_WEBHOOK_SECRET);
}

export function isStripeConfigured(): boolean {
  return Boolean(stripeSecretKey() && stripePublishableKey());
}

let client: Stripe | undefined;

export function requireStripe(): Stripe {
  if (env.NODE_ENV === 'test') {
    throw new AppError('Stripe is not available in tests', 503, 'STRIPE_NOT_CONFIGURED');
  }

  const key = stripeSecretKey();
  if (!key) {
    throw new AppError('Stripe is not configured', 503, 'STRIPE_NOT_CONFIGURED');
  }

  client ??= new Stripe(key);
  return client;
}
