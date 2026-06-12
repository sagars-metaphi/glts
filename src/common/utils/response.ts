import type { Response } from 'express';

export function sendSuccess(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data });
}

export function sendError(res: Response, message: string, status = 500, code = 'ERROR') {
  res.status(status).json({ success: false, error: message, code });
}
