import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  PublicUser,
  RegisterInput,
  UpdateMeInput,
} from '@momentum/types';
import { Prisma } from '../../generated/prisma/client.js';
import { env } from '../../lib/env.js';
import { AppError } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateRefreshToken, hashRefreshToken } from '../../lib/tokens.js';

const LOGIN_UNAUTHORIZED_MESSAGE = 'Invalid email or password';

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  weekStartsOn: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string | null;
  deletedAt?: Date | null;
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

    return issueTokenPair(user, meta);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Email already registered', 409, 'CONFLICT');
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

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: new Date() },
  });

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
}
