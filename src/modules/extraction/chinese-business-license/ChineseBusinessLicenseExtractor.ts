import type { Extractor, ExtractorContext } from '../shared/Extractor.js';
import type { OCRService } from '../shared/OCRService.js';
import { detectChineseBusinessLicense } from './chineseBusinessLicenseDetection.js';
import { extractChineseBusinessLicenseFields } from './chineseBusinessLicenseExtract.js';
import { compareChineseNames } from './ChineseBusinessLicenseValidators.js';
import {
  extractChineseIdCardName,
  isChineseIdCardText,
} from './chineseIdCardExtract.js';
import type { ChineseBusinessLicenseResult } from './ChineseBusinessLicenseData.js';

export class ChineseBusinessLicenseExtractor implements Extractor {
  readonly type = 'chinese-business-license';

  constructor(private readonly ocrService: OCRService) {}

  async extract(file: Buffer, context?: ExtractorContext): Promise<ChineseBusinessLicenseResult> {
    const pages = await this.ocrService.resolveUploadToImages(
      file,
      context?.mimeType,
      context?.filename,
      2.75,
    );

    const licenseOcr = await this.ocrService.chineseBusinessLicenseOcr(pages[0], {
      pageIndex: 0,
      saveDebugOnFailure: context?.saveOutput !== false,
    });

    const idPageOcrs = await Promise.all(pages.slice(1).map((page) => this.ocrService.chinesePageOcr(page)));

    const pageTexts = [licenseOcr.text, ...idPageOcrs.map((r) => r.text)];
    const licenseText = pageTexts[0] || '';
    const avgOcrConfidence = licenseOcr.confidence;

    const detection = detectChineseBusinessLicense(licenseText);
    const extracted = await extractChineseBusinessLicenseFields(licenseText, avgOcrConfidence);

    let idCardPresent = false;
    let idCardName: string | null = null;
    for (let i = 1; i < pageTexts.length; i += 1) {
      const text = pageTexts[i];
      if (!text || !isChineseIdCardText(text)) continue;
      idCardPresent = true;
      idCardName = extractChineseIdCardName(text);
      if (idCardName) break;
    }

    const legalRep = extracted.fields.legalRepresentative?.normalizedCandidate
      ?? extracted.fields.legalRepresentative?.normalizedValue;
    const legalRepresentativeVerified =
      idCardPresent && idCardName && legalRep
        ? compareChineseNames(legalRep, idCardName)
        : idCardPresent
          ? false
          : null;

    const apiFields = Object.fromEntries(
      Object.entries(extracted.fields).map(([key, field]) => [
        key,
        {
          rawValue: field.rawValue,
          normalizedValue: field.normalizedValue,
          ...(field.normalizedCandidate != null ? { normalizedCandidate: field.normalizedCandidate } : {}),
          value: field.normalizedValue,
          raw: field.rawValue,
          confidence: field.confidence,
          requiresReview: field.requiresReview,
          ...(field.checksumValid !== undefined ? { checksumValid: field.checksumValid } : {}),
        },
      ]),
    ) as ChineseBusinessLicenseResult['fields'];

    return {
      success: true,
      type: 'chinese-business-license',
      detected: detection.detected,
      detectionConfidence: detection.confidence,
      matchedSignals: detection.matchedSignals,
      ocrUsed: true,
      ocrConfidence: avgOcrConfidence,
      ocrWarning: licenseOcr.ocrWarning,
      ocrDebug: licenseOcr.ocrDebug,
      extractionDebug: extracted.extractionDebug,
      savedOcrPath: licenseOcr.savedOcrPath,
      pageCount: pages.length,
      validation: {
        valid: extracted.validation.valid,
        requiredPresent: extracted.validation.requiredPresent,
        creditValid: extracted.validation.creditValid,
        fieldValidation: extracted.fieldValidation,
      },
      fields: apiFields,
      requiresManualReview: extracted.requiresManualReview,
      reviewReasons: extracted.reviewReasons,
      legalRepresentativeVerified,
      idCardPresent,
      idCardName,
      rawTextLength: extracted.normalizedText.length,
    };
  }
}
