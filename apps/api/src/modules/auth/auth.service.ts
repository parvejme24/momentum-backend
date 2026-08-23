import type {
  AuthResponse,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  PublicUser,
  RegisterInput,
  ResetPasswordInput,
  UpdateMeInput,
  VerifyEmailInput,
} from '@momentum/types';
import { Prisma } from '../../generated/prisma/client.js';
import type { EmailTokenType } from '../../generated/prisma/client.js';
import { invalidateAuthStatus } from '../../lib/auth-cache.js';
import { env } from '../../lib/env.js';
import { AppError } from '../../lib/errors.js';
import { verifyGoogleIdToken, type GoogleProfile } from '../../lib/google.js';
import { signAccessToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../../lib/mailer.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateRefreshToken, hashRefreshToken } from '../../lib/tokens.js';
import {
  notifyAdminsNewUser,
  notifyEmailVerified,
  notifyWelcome,
} from '../notification/notification.events.js';

const LOGIN_UNAUTHORIZED_MESSAGE = 'Invalid email or password';

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  weekStartsOn: number;
  role: 'CUSTOMER' | 'ADMIN';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string | null;
  deletedAt?: Date | null;
  bannedAt?: Date | null;
};

type RefreshMeta = {
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    weekStartsOn: user.weekStartsOn,
    role: user.role === 'ADMIN' ? 'admin' : 'customer',
    emailVerified: user.emailVerifiedAt !== null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function refreshExpiresAt(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.REFRESH_TOKEN_DAYS);
  return expires;
}

async function issueTokenPair(user: UserRow, meta: RefreshMeta = {}): Promise<AuthResponse> {
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt(),
      ...(meta.deviceId !== undefined && meta.deviceId !== null ? { deviceId: meta.deviceId } : {}),
      ...(meta.userAgent !== undefined && meta.userAgent !== null
        ? { userAgent: meta.userAgent }
        : {}),
      ...(meta.ipAddress !== undefined && meta.ipAddress !== null
        ? { ipAddress: meta.ipAddress }
        : {}),
    },
  });

  return {
    accessToken: signAccessToken(user.id),
    refreshToken,
    user: toPublicUser(user),
  };
}

async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function touchLastActive(userId: string): void {
  void prisma.user
    .update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    })
    .catch((err: unknown) => {
      logger.warn({ err, userId }, 'Failed to update lastActiveAt');
    });
}

function deferPostRegister(userId: string, email: string, name: string): void {
  void (async () => {
    try {
      const verifyToken = await issueEmailToken(userId, 'VERIFY_EMAIL', VERIFY_EMAIL_TTL_MS);
      sendVerificationEmail(email, name, verifyToken);
      notifyWelcome(userId, name);
      notifyAdminsNewUser({ userId, name, email });
    } catch (err) {
      logger.error({ err, userId }, 'Post-register side effects failed');
    }
  })();
}

function deferGoogleRegisterSideEffects(userId: string, name: string, email: string): void {
  notifyWelcome(userId, name);
  notifyAdminsNewUser({ userId, name, email });
}

async function syncGoogleProfile(user: UserRow, profile: GoogleProfile): Promise<UserRow> {
  const data: Prisma.UserUpdateInput = {};

  if (profile.picture && profile.picture !== user.avatarUrl) {
    data.avatarUrl = profile.picture.slice(0, 500);
  }

  const nextName = profile.name.trim().slice(0, 60);
  if (nextName && nextName !== user.name) {
    data.name = nextName;
  }

  if (profile.emailVerified && !user.emailVerifiedAt) {
    data.emailVerifiedAt = new Date();
  }

  if (Object.keys(data).length === 0) return user;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  await invalidateAuthStatus(user.id);
  return updated;
}

async function findUserForGoogle(profile: GoogleProfile) {
  return prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: profile.sub,
      },
    },
    include: { user: true },
  });
}

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

async function issueEmailToken(
  userId: string,
  type: EmailTokenType,
  ttlMs: number,
): Promise<string> {
  const raw = generateRefreshToken();
  await prisma.$transaction([
    prisma.emailToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: hashRefreshToken(raw),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    }),
  ]);
  return raw;
}

async function consumeEmailToken(rawToken: string, type: EmailTokenType) {
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    include: { user: true },
  });

  if (
    !row ||
    row.type !== type ||
    row.usedAt ||
    row.user.deletedAt ||
    row.user.bannedAt ||
    row.expiresAt.getTime() <= Date.now()
  ) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'token', issue: 'is invalid or expired' },
    ]);
  }

  await prisma.emailToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return row.user;
}

export async function register(
  input: RegisterInput,
  meta: RefreshMeta = {},
): Promise<AuthResponse> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        timezone: input.timezone,
        weekStartsOn: input.weekStartsOn,
      },
    });

    deferPostRegister(user.id, user.email, user.name);

    return issueTokenPair(user, meta);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Email already registered', 409, 'CONFLICT', [
        { field: 'email', issue: 'already registered', message: 'Email already registered' },
      ]);
    }
    throw err;
  }
}

export async function login(input: LoginInput, meta: RefreshMeta = {}): Promise<AuthResponse> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });

  const valid = await verifyPassword(input.password, user?.passwordHash);

  if (!user || !valid) {
    throw new AppError(LOGIN_UNAUTHORIZED_MESSAGE, 401, 'UNAUTHORIZED');
  }

  if (user.bannedAt) {
    throw new AppError('This account has been banned', 403, 'ACCOUNT_BANNED');
  }

  touchLastActive(user.id);

  return issueTokenPair(user, meta);
}

export async function googleLogin(idToken: string, meta: RefreshMeta = {}): Promise<AuthResponse> {
  const profile = await verifyGoogleIdToken(idToken);
  const linked = await findUserForGoogle(profile);

  if (linked) {
    const existing = linked.user;
    if (existing.deletedAt) {
      throw new AppError(LOGIN_UNAUTHORIZED_MESSAGE, 401, 'UNAUTHORIZED');
    }
    if (existing.bannedAt) {
      throw new AppError('This account has been banned', 403, 'ACCOUNT_BANNED');
    }

    const user = await syncGoogleProfile(existing, profile);
    touchLastActive(user.id);
    return issueTokenPair(user, meta);
  }

  const byEmail = await prisma.user.findFirst({
    where: { email: profile.email, deletedAt: null },
  });

  if (byEmail) {
    if (byEmail.bannedAt) {
      throw new AppError('This account has been banned', 403, 'ACCOUNT_BANNED');
    }

    await prisma.oAuthAccount.create({
      data: {
        userId: byEmail.id,
        provider: 'google',
        providerAccountId: profile.sub,
      },
    });

    const user = await syncGoogleProfile(byEmail, profile);
    touchLastActive(user.id);
    return issueTokenPair(user, meta);
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name.trim().slice(0, 60),
      avatarUrl: profile.picture?.slice(0, 500) ?? null,
      passwordHash: null,
      ...(profile.emailVerified ? { emailVerifiedAt: new Date() } : {}),
      accounts: {
        create: {
          provider: 'google',
          providerAccountId: profile.sub,
        },
      },
    },
  });

  deferGoogleRegisterSideEffects(user.id, user.name, user.email);

  return issueTokenPair(user, meta);
}

export async function refresh(
  rawRefreshToken: string,
  meta: RefreshMeta = {},
): Promise<AuthResponse> {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing || existing.user.deletedAt) {
    throw new AppError('Invalid refresh token', 401, 'UNAUTHORIZED');
  }

  if (existing.user.bannedAt) {
    throw new AppError('This account has been banned', 403, 'ACCOUNT_BANNED');
  }

  if (existing.revokedAt) {
    await revokeAllRefreshTokens(existing.userId);
    throw new AppError('Refresh token reuse detected', 401, 'UNAUTHORIZED');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    throw new AppError('Refresh token expired', 401, 'UNAUTHORIZED');
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(existing.user, meta);
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await revokeAllRefreshTokens(userId);
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  return toPublicUser(user);
}

export async function updateMe(userId: string, input: UpdateMeInput): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.weekStartsOn !== undefined ? { weekStartsOn: input.weekStartsOn } : {}),
    },
  });

  return toPublicUser(updated);
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  const valid = await verifyPassword(input.oldPassword, user.passwordHash);
  if (!valid) {
    throw new AppError('Current password is incorrect', 401, 'UNAUTHORIZED');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  sendPasswordChangedEmail(user.email, user.name);
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });
  if (!user || user.bannedAt) return;

  const token = await issueEmailToken(user.id, 'RESET_PASSWORD', RESET_PASSWORD_TTL_MS);
  sendPasswordResetEmail(user.email, user.name, token);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const user = await consumeEmailToken(input.token, 'RESET_PASSWORD');
  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  sendPasswordChangedEmail(user.email, user.name);
}

export async function verifyEmail(input: VerifyEmailInput): Promise<void> {
  const user = await consumeEmailToken(input.token, 'VERIFY_EMAIL');
  if (user.emailVerifiedAt) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });
  notifyEmailVerified(user.id);
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  if (!user) {
    throw AppError.unauthorized('User not found');
  }
  if (user.emailVerifiedAt) return;

  const token = await issueEmailToken(user.id, 'VERIFY_EMAIL', VERIFY_EMAIL_TTL_MS);
  sendVerificationEmail(user.email, user.name, token);
}
