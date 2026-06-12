import type { ExtractedFieldResult } from './chineseFieldProcessor.js';

export interface ManualReviewResult {
  requiresManualReview: boolean;
  reviewReasons: string[];
}

const KEY_FIELDS = ['companyName', 'creditCode', 'legalRepresentative'] as const;

export function computeManualReview(
  fields: Record<string, ExtractedFieldResult>,
  ocrConfidence: number,
  totalConfusionCorrections: number,
): ManualReviewResult {
  const reviewReasons: string[] = [];

  if (ocrConfidence < 75) {
    reviewReasons.push(`ocr_confidence_below_75:${ocrConfidence}`);
  }

  const credit = fields.creditCode;
  if (credit?.checksumValid === false) {
    reviewReasons.push('credit_checksum_failed');
  }

  if (totalConfusionCorrections > 3) {
    reviewReasons.push(`ocr_corrections_exceeded:${totalConfusionCorrections}`);
  }

  for (const key of KEY_FIELDS) {
    if (!fields[key]?.value) {
      reviewReasons.push(`missing_key_field:${key}`);
    }
  }

  const scope = fields.businessScope;
  if (scope && scope.confidence < 0.7) {
    reviewReasons.push('business_scope_low_confidence');
  }

  const anyFieldReview = Object.values(fields).some((f) => f?.requiresReview);
  if (anyFieldReview) {
    reviewReasons.push('field_requires_review');
  }

  return {
    requiresManualReview: reviewReasons.length > 0,
    reviewReasons,
  };
}
