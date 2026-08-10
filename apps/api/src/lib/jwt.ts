import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from './env.js';
import { AppError } from './errors.js';

export type AccessTokenPayload = {
  sub: string;
};

export function signAccessToken(userId: string): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] & string,
  };

  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });

    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new AppError('Invalid access token', 401, 'UNAUTHORIZED');
    }

    return { sub: payload.sub };
  } catch (err) {
    if (err instanceof AppError) throw err;

    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
    }

    throw new AppError('Invalid access token', 401, 'UNAUTHORIZED');
  }
}
