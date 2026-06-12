import type { VisaData, VisaExtractionMetrics } from './VisaData.js';
import type { OCRService } from '../shared/OCRService.js';
import type { OcrBlurMeta } from '../shared/OcrTypes.js';
import { extractVisaData } from '../shared/lib/visa-extract.js';
import { extractVisaFromOcr } from './VisaOcrExtractor.js';
import { mapMrzToVisaData, mapOcrToVisaData, mergeVisaData } from './VisaFieldMapper.js';
import { computeVisaConfidence, computeMetrics } from './VisaConfidence.js';
import { VISA_CORE_FIELDS } from './VisaData.js';
import { validateVisaData } from './VisaValidators.js';
import {
  detectAsVisa,
  isVisaLikeContext,
  shouldRunLabelExtraction,
  NON_VISA_CONFIDENCE_CAP,
} from './visaDetection.js';

export interface VisaTextEvaluation {
  detectedAsVisa: boolean;
  visa: VisaData;
  metrics: VisaExtractionMetrics;
  populatedFieldCount: number;
}

function countPopulatedFields(visa: VisaData): number {
  return VISA_CORE_FIELDS.filter((key) => {
    if (key === 'mrzValid') return false;
    const val = visa[key];
    return val != null && val !== '';
  }).length;
}

/**
 * Text-only visa evaluation (mirrors VisaExtractor OCR merge path).
 */
export function evaluateVisaFromText(rawText: string, mrzText = rawText): VisaTextEvaluation {
  const legacy = extractVisaData(rawText, mrzText);
  const mrzValid = Boolean(legacy.mrzData?.mrzValid);
  const visaLike = isVisaLikeContext(rawText, mrzValid);
  // visaParsed = MRZ/lib only; mrzData.fields also merges legacy OCR (causes invoice FP)
  const mrzFields = (visaLike
    ? legacy.mrzData?.fields
    : legacy.visaParsed) as Record<string, unknown> | undefined;
  const mrzFieldSource = (mrzFields || {}) as Record<string, unknown>;

  const runLabelExtraction = shouldRunLabelExtraction(rawText, mrzValid);
  const enhancedOcr = runLabelExtraction ? extractVisaFromOcr(rawText, { mrzValid }) : {};
  const legacyOcr = runLabelExtraction ? ((legacy.visaOcrFields || {}) as Record<string, unknown>) : {};

  const ocrMerged: Record<string, string | null> = {};
  for (const [k, v] of Object.entries({ ...legacyOcr, ...enhancedOcr })) {
    if (v != null && v !== '') ocrMerged[k] = String(v);
  }

  const fromMrz = mapMrzToVisaData(mrzFieldSource, mrzValid, rawText);
  const fromOcr = mapOcrToVisaData(ocrMerged);

  const mrzFieldCount = Object.values(fromMrz).filter((v) => v != null && v !== '').length;
  const ocrFieldCount = Object.values(fromOcr).filter((v) => v != null && v !== '').length;

  let confidence = computeVisaConfidence({
    mrzValid,
    mrzFieldCount,
    ocrFieldCount,
    merged: mergeVisaData(fromMrz, fromOcr, rawText, 0),
  });

  const visa = mergeVisaData(fromMrz, fromOcr, rawText, confidence);
  visa.mrzValid = mrzValid;

  const detectedAsVisa = detectAsVisa({ rawText, mrzValid });

  if (!detectedAsVisa) {
    confidence = Math.min(confidence, NON_VISA_CONFIDENCE_CAP);
    visa.confidence = confidence;
  }

  let ocrConfidence = ocrFieldCount > 0 ? Math.min(0.95, 0.5 + ocrFieldCount * 0.05) : 0.2;
  if (!detectedAsVisa) {
    ocrConfidence = Math.min(ocrConfidence, NON_VISA_CONFIDENCE_CAP);
  }

  const metrics = computeMetrics(visa, mrzValid, ocrConfidence);

  validateVisaData(visa);

  return {
    detectedAsVisa,
    visa,
    metrics,
    populatedFieldCount: countPopulatedFields(visa),
  };
}

/** Image → OCR (real pipeline) → visa evaluation */
export async function evaluateVisaFromImage(
  file: Buffer,
  ocrService: OCRService,
): Promise<VisaTextEvaluation & { rawText: string; ocrMeta: OcrBlurMeta }> {
  const [mrzText, pageOcr] = await Promise.all([
    ocrService.mrzStrip(file),
    ocrService.visaPageOcr(file),
  ]);
  const rawText = [mrzText, pageOcr.text].filter(Boolean).join('\n');
  const result = evaluateVisaFromText(rawText, mrzText);
  return { ...result, rawText, ocrMeta: pageOcr.meta };
}
