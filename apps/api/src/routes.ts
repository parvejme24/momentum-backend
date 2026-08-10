import { Router } from 'express';
import { healthRouter } from './modules/health/health.route.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);
