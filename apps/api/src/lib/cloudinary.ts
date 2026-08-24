import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

export function getCloudinaryPublicConfig() {
  return {
    configured: isCloudinaryConfigured(),
    cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
  };
}

export function requireCloudinary() {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

export { cloudinary };
