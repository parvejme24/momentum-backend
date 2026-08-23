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
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return cloudinary;
}

export { cloudinary };
