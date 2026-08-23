import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import * as mediaController from './media.controller.js';

export const mediaRouter = Router();

mediaRouter.get('/config', asyncHandler(mediaController.config));
