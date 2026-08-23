import { OAuth2Client } from 'google-auth-library';
import { env } from './env.js';
import { AppError } from './errors.js';

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
};

function parseTestGoogleToken(idToken: string): GoogleProfile {
  if (!idToken.startsWith('test:')) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'idToken', issue: 'is invalid' },
    ]);
  }

  try {
    const payload = JSON.parse(
      Buffer.from(idToken.slice('test:'.length), 'base64url').toString('utf8'),
    ) as Partial<GoogleProfile>;

    if (!payload.sub || !payload.email) {
      throw new Error('missing sub or email');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name?.trim() || payload.email.split('@')[0] || 'User',
      picture: payload.picture ?? null,
      emailVerified: payload.emailVerified === true,
    };
  } catch {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'idToken', issue: 'is invalid' },
    ]);
  }
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (env.NODE_ENV === 'test') {
    return parseTestGoogleToken(idToken);
  }

  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new AppError('Google sign-in is not configured', 503, 'SERVICE_UNAVAILABLE');
  }

  const client = new OAuth2Client(clientId);

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw AppError.validation('Check the highlighted fields', [
        { field: 'idToken', issue: 'is invalid' },
      ]);
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name?.trim() || payload.email.split('@')[0] || 'User',
      picture: payload.picture ?? null,
      emailVerified: payload.email_verified === true,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.validation('Check the highlighted fields', [
      { field: 'idToken', issue: 'is invalid or expired' },
    ]);
  }
}
