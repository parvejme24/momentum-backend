import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors.js';

type RequestTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodType, target: RequestTarget = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(new AppError('Invalid request', 400, 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }

    switch (target) {
      case 'body':
        req.body = result.data;
        break;
      case 'query':
        req.query = result.data as typeof req.query;
        break;
      case 'params':
        req.params = result.data as typeof req.params;
        break;
    }

    next();
  };
}
