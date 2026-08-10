import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/** Precomputed bcrypt hash used to equalize login timing when no user/hash exists. */
const DUMMY_PASSWORD_HASH = '$2b$12$v7LWIcujl3w8u544rkDH9.qPmTCc148dwtA.RqnZi0n4dCy8qaVYC';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}
