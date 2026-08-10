import type { RequestHandler, Request, Response, NextFunction } from 'express';

type MaybeAsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

export function asyncHandler(fn: MaybeAsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
