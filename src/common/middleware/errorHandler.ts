import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../exceptions/AppError.js';
import { logger } from '../logger/logger.js';
import { sendError } from '../utils/response.js';

function isJsonParseError(err: unknown): err is SyntaxError & { status: number; body?: unknown } {
  return (
    err instanceof SyntaxError &&
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 400
  );
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isJsonParseError(err)) {
    const hint =
      typeof err.body === 'string' && err.body.startsWith('@')
        ? ' Hint: on Windows use curl --data-binary "@path\\to\\file.json" or PowerShell Get-Content -Raw.'
        : '';
    return sendError(
      res,
      `Validation failed: invalid JSON request body.${hint}`,
      400,
      'VALIDATION_ERROR',
    );
  }

  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.code);
  }
  logger.error('Unhandled error', err);
  return sendError(res, 'Internal server error', 500, 'INTERNAL_ERROR');
}
