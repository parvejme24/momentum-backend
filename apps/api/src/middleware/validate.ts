import type { Request, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors.js';

type RequestTarget = 'body' | 'query' | 'params';

function zodDetails(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): Array<{ field: string; issue: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map(String).join('.') : '_root',
    issue: issue.message,
  }));
}

function replaceRequestProperty(req: Request, key: 'query' | 'params', value: unknown): void {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

export function validate(schema: ZodType, target: RequestTarget = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(AppError.validation('Check the highlighted fields', zodDetails(result.error)));
      return;
    }

    switch (target) {
      case 'body':
        req.body = result.data;
        break;
      case 'query':
        replaceRequestProperty(req, 'query', result.data);
        break;
      case 'params':
        replaceRequestProperty(req, 'params', result.data);
        break;
    }

    next();
  };
}
