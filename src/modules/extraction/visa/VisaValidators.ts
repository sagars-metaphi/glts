import type { VisaData } from './VisaData.js';

export interface VisaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export function validateVisaData(data: VisaData): VisaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.mrzValid && !data.machineReadableZone) {
    warnings.push('MRZ marked valid but machineReadableZone is empty');
  }

  if (data.dateOfBirth && !DATE_RE.test(data.dateOfBirth)) {
    warnings.push(`dateOfBirth format unexpected: ${data.dateOfBirth}`);
  }
  if (data.expiryDate && !DATE_RE.test(data.expiryDate)) {
    warnings.push(`expiryDate format unexpected: ${data.expiryDate}`);
  }

  if (data.nationality && !/^[A-Z]{3}$/.test(data.nationality)) {
    warnings.push(`nationality should be ISO alpha-3: ${data.nationality}`);
  }

  if (data.sex && !['M', 'F', 'U'].includes(data.sex)) {
    errors.push(`invalid sex: ${data.sex}`);
  }

  const hasIdentity = Boolean(data.surname || data.givenNames || data.passportNumber);
  if (!hasIdentity && !data.visaNumber) {
    warnings.push('no identity fields extracted');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate || !DATE_RE.test(expiryDate)) return false;
  const [dd, mm, yyyy] = expiryDate.split('/').map(Number);
  const exp = new Date(yyyy, mm - 1, dd);
  return exp < new Date();
}
