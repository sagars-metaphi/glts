import { fixOcrCodeSubstitutions } from './chineseOcrNormalize.js';
import { normalizeRegisteredCapitalValue } from './chineseNumberParse.js';

const CREDIT_CHARSET = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const CREDIT_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

const COMPANY_SUFFIXES = ['股份有限公司', '集团有限公司', '有限公司', '有限责任公司'];

export interface FieldValidation {
  valid: boolean;
  message?: string;
  normalized?: string;
  parsed?: Record<string, unknown>;
}

export function validateCreditCode(raw: string | null | undefined): FieldValidation {
  const normalized = fixOcrCodeSubstitutions(raw || '');
  if (!normalized) return { valid: false, message: 'missing' };
  if (normalized.length !== 18) return { valid: false, message: 'length must be 18', normalized };
  if (!/^[0-9A-HJ-NP-RT-UW-Y]{18}$/.test(normalized)) {
    return { valid: false, message: 'invalid characters', normalized };
  }

  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const idx = CREDIT_CHARSET.indexOf(normalized[i]);
    if (idx < 0) return { valid: false, message: 'invalid charset', normalized };
    sum += idx * CREDIT_WEIGHTS[i];
  }
  const checkIdx = (31 - (sum % 31)) % 31;
  const valid = CREDIT_CHARSET[checkIdx] === normalized[17];
  return { valid, message: valid ? undefined : 'checksum failed', normalized };
}

export function validateCompanyName(raw: string | null | undefined): FieldValidation {
  const value = String(raw || '').trim();
  if (!value) return { valid: false, message: 'empty' };
  const hasSuffix = COMPANY_SUFFIXES.some((s) => value.endsWith(s));
  return {
    valid: true,
    normalized: value,
    parsed: { hasCompanySuffix: hasSuffix },
  };
}

export function normalizeChineseDate(raw: string | null | undefined): FieldValidation {
  const value = String(raw || '').trim();
  if (!value) return { valid: false, message: 'empty' };
  if (/长期/.test(value)) {
    return { valid: true, normalized: 'long-term', parsed: { type: 'long-term' } };
  }

  const cn = value.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (cn) {
    const iso = `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`;
    return { valid: true, normalized: iso, parsed: { iso } };
  }

  const slash = value.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (slash) {
    const iso = `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
    return { valid: true, normalized: iso, parsed: { iso } };
  }

  return { valid: false, message: 'unrecognized date format', normalized: value };
}

export function parseRegisteredCapital(raw: string | null | undefined): FieldValidation {
  const value = String(raw || '').trim();
  if (!value) return { valid: false, message: 'empty' };

  if (/^\d{4}\s*年/.test(value) && !/[万亿萬元圆圓]/.test(value)) {
    return { valid: false, message: 'looks like a year, not capital', normalized: value };
  }

  const normalized = normalizeRegisteredCapitalValue(value) || value;
  const m = normalized.match(/^([\d,.]+)\s*(万|亿)?\s*元人民币?/);
  if (!m) return { valid: false, message: 'no numeric amount', normalized };

  const amount = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return { valid: false, message: 'invalid amount', normalized };

  const unit = m[2] || null;
  const currency = 'CNY';

  return {
    valid: true,
    normalized,
    parsed: { amount, unit, currency, display: normalized },
  };
}

export function compareChineseNames(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string) =>
    String(s || '')
      .replace(/\s/g, '')
      .replace(/[·•．.]/g, '')
      .trim();
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return false;
}

export function validateExtractedFields(fields: Record<string, { value: string | null }>) {
  const fieldValidation: Record<string, FieldValidation> = {};

  fieldValidation.creditCode = validateCreditCode(fields.creditCode?.value);
  fieldValidation.companyName = validateCompanyName(fields.companyName?.value);
  fieldValidation.establishmentDate = normalizeChineseDate(fields.establishmentDate?.value);
  fieldValidation.registeredCapital = parseRegisteredCapital(fields.registeredCapital?.value);

  const requiredPresent = ['companyName', 'creditCode', 'legalRepresentative'].every(
    (k) => fields[k]?.value != null && String(fields[k].value).trim() !== '',
  );

  const creditValid = fieldValidation.creditCode.valid;
  const valid = requiredPresent && creditValid;

  return { valid, requiredPresent, creditValid, fieldValidation };
}
