import type { Extractor } from '../shared/Extractor.js';
import type { OCRService } from '../shared/OCRService.js';
import type { VisaExtractionResult } from './VisaData.js';
import { extractVisaData } from '../shared/lib/visa-extract.js';
import { extractVisaFromOcr } from './VisaOcrExtractor.js';
import { mapMrzToVisaData, mapOcrToVisaData, mergeVisaData, toLegacyMrzFields } from './VisaFieldMapper.js';
import { computeVisaConfidence, computeMetrics } from './VisaConfidence.js';
import { validateVisaData } from './VisaValidators.js';
import {
  detectAsVisa,
  isVisaLikeContext,
  shouldRunLabelExtraction,
  NON_VISA_CONFIDENCE_CAP,
} from './visaDetection.js';

export class VisaExtractor implements Extractor {
  readonly type = 'visa';

  constructor(private readonly ocrService: OCRService) {}

  async extract(file: Buffer): Promise<VisaExtractionResult> {
    const [mrzText, pageOcr] = await Promise.all([
      this.ocrService.mrzStrip(file),
      this.ocrService.visaPageOcr(file),
    ]);

    const rawText = [mrzText, pageOcr.text].filter(Boolean).join('\n');

    const legacy = extractVisaData(rawText, mrzText);
    const mrzValid = Boolean(legacy.mrzData?.mrzValid);
    const visaLike = isVisaLikeContext(rawText, mrzValid);
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
      success: true,
      type: 'visa',
      detectedAsVisa,
      mrzValid,
      mrzInvalidReason: legacy.mrzData?.mrzInvalidReason ?? null,
      visa,
      metrics,
      mrzData: legacy.mrzData
        ? {
            documentType: 'V',
            documentCode: 'V',
            mrzValid,
            mrzInvalidReason: legacy.mrzData.mrzInvalidReason ?? null,
            format: legacy.mrzData.format ?? (mrzValid ? 'TD3' : null),
            fields: toLegacyMrzFields(visa),
          }
        : null,
      visaParsed: (legacy.visaParsed as Record<string, unknown>) ?? null,
      visaOcrFields: ocrMerged,
      rawText,
    };
  }
}
