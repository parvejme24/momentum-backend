import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from './env.js';
import { logger } from './logger.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

let transporter: Transporter | undefined;
let warnedMissingConfig = false;

function getTransporter(): Transporter | null {
  if (env.NODE_ENV === 'test') return null;
  if (!isMailConfigured()) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      logger.warn('SMTP is not fully configured; transactional email is disabled');
    }
    return null;
  }

  if (!transporter) {
    const port = env.SMTP_PORT ?? 587;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const client = getTransporter();
  if (!client) return;

  await client.sendMail({
    from: env.MAIL_FROM ?? 'Momentum <noreply@momentum.app>',
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

function dispatch(task: Promise<void>, label: string): void {
  void task.catch((err: unknown) => {
    logger.error({ err }, label);
  });
}

export function sendVerificationEmail(to: string, name: string, token: string): void {
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(name);
  dispatch(
    sendMail({
      to,
      subject: 'Verify your Momentum email',
      text: `Hi ${name},\n\nConfirm your email by opening this link:\n${url}\n\nIf you did not create a Momentum account, you can ignore this message.`,
      html: `<p>Hi ${safeName},</p><p>Confirm your email by clicking <a href="${url}">this link</a>.</p><p>If you did not create a Momentum account, you can ignore this message.</p>`,
    }),
    'Failed to send verification email',
  );
}

export function sendPasswordResetEmail(to: string, name: string, token: string): void {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(name);
  dispatch(
    sendMail({
      to,
      subject: 'Reset your Momentum password',
      text: `Hi ${name},\n\nReset your password by opening this link (it expires in 1 hour):\n${url}\n\nIf you did not ask for this, you can ignore this message.`,
      html: `<p>Hi ${safeName},</p><p>Reset your password by clicking <a href="${url}">this link</a>. It expires in 1 hour.</p><p>If you did not ask for this, you can ignore this message.</p>`,
    }),
    'Failed to send password reset email',
  );
}

export function sendPasswordChangedEmail(to: string, name: string): void {
  const safeName = escapeHtml(name);
  dispatch(
    sendMail({
      to,
      subject: 'Your Momentum password was changed',
      text: `Hi ${name},\n\nYour Momentum password was just changed. If this was not you, reset it immediately.`,
      html: `<p>Hi ${safeName},</p><p>Your Momentum password was just changed. If this was not you, reset it immediately.</p>`,
    }),
    'Failed to send password-changed email',
  );
}
