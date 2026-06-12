import {
  ocrMrzStrip,
  ocrFullPage,
  ocrMultiRegionMerge,
  ocrChinesePage,
  resolveUploadToImages,
  getFileBuffer,
} from './lib/ocr.js';
import { ocrChineseBusinessLicensePage } from '../chinese-business-license/ocr/chineseBusinessLicenseOcr.js';
import type { VisaPageOcrResult } from './OcrTypes.js';

export interface ChinesePageOcrResult {
  text: string;
  confidence: number;
}

export interface ChineseBusinessLicenseOcrResult {
  text: string;
  confidence: number;
  detectionConfidence: number;
  ocrDebug: {
    ocrPasses: unknown[];
    bestPass: string;
    bestConfidence: number;
    orientation: number;
    deskewAngle?: number;
    engine?: string;
    keywordHits?: string[];
    rawChineseText: string;
  };
  ocrWarning: {
    type: string;
    message: string;
    confidence: number;
    recommendation?: string;
  } | null;
  savedOcrPath: string | null;
}

export class OCRService {
  mrzStrip(buffer: Buffer): Promise<string> {
    return ocrMrzStrip(buffer);
  }

  fullPage(buffer: Buffer): Promise<string> {
    return ocrFullPage(buffer);
  }

  /** Visa extraction: 4-pass blur recovery + multi-region OCR */
  visaPageOcr(buffer: Buffer): Promise<VisaPageOcrResult> {
    return ocrMultiRegionMerge(buffer);
  }

  /** Chinese document OCR (营业执照, ID card, etc.) */
  chinesePageOcr(buffer: Buffer): Promise<ChinesePageOcrResult> {
    return ocrChinesePage(buffer);
  }

  /** Enhanced OCR pipeline for Chinese business license (PaddleOCR + orientation + preprocessing). */
  chineseBusinessLicenseOcr(
    buffer: Buffer,
    options?: { saveDebugOnFailure?: boolean; pageIndex?: number },
  ): Promise<ChineseBusinessLicenseOcrResult> {
    return ocrChineseBusinessLicensePage(buffer, options);
  }

  resolveUploadToImages(
    buffer: Buffer,
    mimeType?: string,
    filename?: string,
    viewportScale = 2.0,
  ): Promise<Buffer[]> {
    return resolveUploadToImages(buffer, mimeType, filename, viewportScale);
  }

  async fileToBuffer(filePath: string): Promise<Buffer> {
    const buf = await getFileBuffer(filePath);
    if (!buf) throw new Error(`Cannot read file: ${filePath}`);
    return buf;
  }
}
