import { normalizeChineseOcrText } from './chineseOcrNormalize.js';
import { extractByLabelSegments } from './chineseLabelSegmentExtract.js';
import {
  getDefaultFieldProcessor,
  processExtractedSegments,
  type ExtractedFieldResult,
} from './chineseFieldProcessor.js';
import { computeManualReview } from './chineseManualReview.js';
import {
  validateCreditCode,
  validateExtractedFields,
  type FieldValidation,
} from './ChineseBusinessLicenseValidators.js';

const FIELD_KEYS = [
  'companyName',
  'creditCode',
  'legalRepresentative',
  'companyType',
  'registeredCapital',
  'establishmentDate',
  'businessTerm',
  'address',
  'businessScope',
  'registrationAuthority',
] as const;

export interface ExtractionDebugEntry {
  field: string;
  startLabel: string;
  nextLabel: string | null;
  rawSegment: string;
  raw: string | null;
  finalValue: string | null;
  confidence: number;
  requiresReview: boolean;
  checksumValid?: boolean;
  confusionCorrections: Array<{ index: number; from: string; to: string }>;
  validationSignals: string[];
  boundaryExtracted: boolean;
  labelFound: boolean;
}

export interface ChineseBusinessLicenseExtractionResult {
  fields: Record<string, ExtractedFieldResult>;
  extractionDebug: ExtractionDebugEntry[];
  fieldValidation: Record<string, FieldValidation>;
  normalizedText: string;
  validation: ReturnType<typeof validateExtractedFields>;
  requiresManualReview: boolean;
  reviewReasons: string[];
}

export async function extractChineseBusinessLicenseFields(
  rawText: string,
  ocrConfidence = 60,
): Promise<ChineseBusinessLicenseExtractionResult> {
  const text = normalizeChineseOcrText(rawText);
  const { segments, fullText } = extractByLabelSegments(text);

  const segmentInput: Record<string, {
    rawSegment: string;
    boundaryExtracted: boolean;
    labelFound: boolean;
    fuzzyLabelUsed?: boolean;
    matchedLabelText?: string | null;
    scopeFallbackUsed?: boolean;
  }> = {};
  for (const [field, entry] of Object.entries(segments)) {
    segmentInput[field] = {
      rawSegment: entry.rawSegment,
      boundaryExtracted: entry.boundaryExtracted,
      labelFound: entry.labelFound,
      fuzzyLabelUsed: entry.fuzzyLabelUsed,
      matchedLabelText: entry.matchedLabelText,
      scopeFallbackUsed: entry.scopeFallbackUsed,
    };
  }

  const { fields, totalConfusionCorrections } = processExtractedSegments(
    segmentInput,
    fullText,
    ocrConfidence,
    getDefaultFieldProcessor(),
  );

  if (fields.creditCode?.value) {
    const validation = validateCreditCode(fields.creditCode.value);
    fields.creditCode = {
      ...fields.creditCode,
      value: validation.normalized || fields.creditCode.value,
      checksumValid: validation.valid,
      requiresReview: !validation.valid || fields.creditCode.requiresReview,
    };
  }

  const flatValues: Record<string, { value: string | null }> = {};
  for (const key of FIELD_KEYS) {
    flatValues[key] = { value: fields[key]?.value ?? null };
  }

  const validationResult = validateExtractedFields(flatValues);
  const manualReview = computeManualReview(fields, ocrConfidence, totalConfusionCorrections);

  const extractionDebug: ExtractionDebugEntry[] = FIELD_KEYS.map((field) => {
    const segment = segments[field];
    const processed = fields[field];
    return {
      field,
      startLabel: segment?.startLabel || '',
      nextLabel: segment?.nextLabel ?? null,
      rawSegment: segment?.rawSegment || '',
      raw: processed?.raw ?? null,
      finalValue: processed?.value ?? null,
      confidence: processed?.confidence ?? 0,
      requiresReview: processed?.requiresReview ?? true,
      checksumValid: processed?.checksumValid,
      confusionCorrections: processed?.confusionCorrections || [],
      validationSignals: processed?.validationSignals || [],
      boundaryExtracted: segment?.boundaryExtracted ?? false,
      labelFound: segment?.labelFound ?? false,
    };
  });

  return {
    fields,
    extractionDebug,
    fieldValidation: validationResult.fieldValidation,
    normalizedText: text,
    validation: validationResult,
    requiresManualReview: manualReview.requiresManualReview,
    reviewReasons: manualReview.reviewReasons,
  };
}
