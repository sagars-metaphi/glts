import { ValidationError } from '../exceptions/AppError.js';

const TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function validateTemplateId(id: string): string {
  const trimmed = id?.trim();
  if (!trimmed) {
    throw new ValidationError('Invalid template id: id is required');
  }
  if (!TEMPLATE_ID_PATTERN.test(trimmed)) {
    throw new ValidationError(
      'Invalid template id: use letters, numbers, hyphens, and underscores only',
    );
  }
  return trimmed;
}

export function validateTemplateUpdateBody(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Validation failed: request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

export function validateTemplateCreateBody(body: unknown): { id: string; data: Record<string, unknown> } {
  const record = validateTemplateUpdateBody(body);
  const id = validateTemplateId(String(record.id || ''));
  return { id, data: record };
}

export function validateRenderData(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationError('Validation failed: "data" must be a JSON object');
  }
  return data as Record<string, unknown>;
}

export function resolveInlineTemplate(body: Record<string, unknown>): string {
  const template = body.template ?? body.body;
  if (typeof template !== 'string' || !template.trim()) {
    throw new ValidationError('Validation failed: "template" (or "body") string is required');
  }
  return template;
}

export function resolveRenderData(body: Record<string, unknown>): Record<string, unknown> {
  if (body.data !== undefined) {
    return validateRenderData(body.data);
  }
  const { template: _t, body: _b, ...rest } = body;
  return validateRenderData(rest);
}
