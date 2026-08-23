import { z } from 'zod';

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

/** Supports correct CLOUDINARY_* keys and legacy CLAUDINARY_* typo in .env */
function cloudinaryFromProcessEnv() {
  return {
    CLOUDINARY_CLOUD_NAME: readEnv('CLOUDINARY_CLOUD_NAME') ?? readEnv('CLAUDINARY_CLOUD_NAME'),
    CLOUDINARY_API_KEY: readEnv('CLOUDINARY_API_KEY') ?? readEnv('CLAUDINARY_API_KEY'),
    CLOUDINARY_API_SECRET: readEnv('CLOUDINARY_API_SECRET') ?? readEnv('CLAUDINARY_API_SECRET'),
  };
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  REDIS_URL: z.string().min(1),
  REDIS_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_IS_SANDBOX: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SSLCOMMERZ_SUCCESS_URL: z.string().url().optional(),
  SSLCOMMERZ_FAIL_URL: z.string().url().optional(),
  SSLCOMMERZ_CANCEL_URL: z.string().url().optional(),
  SSLCOMMERZ_IPN_URL: z.string().url().optional(),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Public backend base URL — used for SSLCommerz IPN webhooks. */
  API_URL: z.string().url().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  SECRET_KEY: z.string().optional(),
  PUBLISHABLE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  ...process.env,
  ...cloudinaryFromProcessEnv(),
});
