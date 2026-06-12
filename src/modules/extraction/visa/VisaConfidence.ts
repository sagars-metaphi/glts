import type { VisaData, VisaExtractionMetrics } from './VisaData.js';
import { VISA_CORE_FIELDS } from './VisaData.js';

export interface ConfidenceInput {
  mrzValid: boolean;
  mrzFieldCount: number;
  ocrFieldCount: number;
  merged: VisaData;
}

export function scoreFieldSource(
  value: unknown,
  mrzHad: boolean,
  ocrHad: boolean,
): number {
  if (value == null || value === '') return 0;
  if (mrzHad && ocrHad) return 0.98;
  if (mrzHad) return 0.92;
  if (ocrHad) return 0.72;
  return 0.55;
}

export function computeVisaConfidence(input: ConfidenceInput): number {
  const { mrzValid, merged } = input;
  let score = 0;
  let weight = 0;

  const weights: Partial<Record<keyof VisaData, number>> = {
    visaNumber: 1.2,
    surname: 1.1,
    givenNames: 1.1,
    passportNumber: 1.1,
    nationality: 1,
    dateOfBirth: 1,
    expiryDate: 1,
    issuingCountry: 0.9,
    sex: 0.7,
    entries: 0.6,
  };

  for (const [key, w] of Object.entries(weights)) {
    const k = key as keyof VisaData;
    const val = merged[k];
    if (val != null && val !== '' && val !== false) {
      score += w;
    }
    weight += w;
  }

  const base = weight > 0 ? score / weight : 0;
  const mrzBoost = mrzValid ? 0.12 : 0;
  return Math.min(1, Math.round((base + mrzBoost) * 1000) / 1000);
}

export function computeMetrics(
  merged: VisaData,
  mrzValid: boolean,
  ocrConfidence: number,
): VisaExtractionMetrics {
  const populated: string[] = [];
  const missing: string[] = [];

  for (const key of VISA_CORE_FIELDS) {
    if (key === 'mrzValid') continue;
    const val = merged[key];
    if (val != null && val !== '') populated.push(key);
    else missing.push(key);
  }

  const total = VISA_CORE_FIELDS.length - 1;
  const fieldExtractionRate = total > 0 ? populated.length / total : 0;

  return {
    fieldExtractionRate: Math.round(fieldExtractionRate * 1000) / 1000,
    ocrConfidence: Math.round(ocrConfidence * 1000) / 1000,
    mrzConfidence: mrzValid ? 0.95 : 0.35,
    populatedFields: populated,
    missingFields: missing,
    totalFields: total,
  };
}
