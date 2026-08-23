import type { Request, Response } from 'express';
import { getCloudinaryPublicConfig } from '../../lib/cloudinary.js';
import type { MediaConfig } from '@momentum/types';

export function getMediaConfig(): MediaConfig {
  return {
    cloudinary: getCloudinaryPublicConfig(),
  };
}

export function config(_req: Request, res: Response): void {
  res.status(200).json(getMediaConfig());
}
