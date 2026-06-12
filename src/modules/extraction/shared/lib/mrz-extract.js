import { parse as parseMrzLib } from 'mrz';
import { ocrMrzStrip, ocrFullPage } from './ocr.js';
import { parseMrzFromText } from './mrz-parser.js';
import { extractVisaData } from './visa-extract.js';

function normalizeDocumentType(code) {
  if (!code) return null;
  return String(code).replace(/</g, '').charAt(0).toUpperCase() || null;
}

function inferDocumentTypeFromText(text) {
  const blob = (text || '').toUpperCase().replace(/\s/g, '');
  if (blob.includes('P<')) return 'P';
  if (/\bI</.test(blob) || /^I</.test(blob)) return 'I';
  if (blob.includes('V<')) return 'V';
  return null;
}

function detectPrefixType(text) {
  const lines = String(text || '')
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/\s/g, ''))
    .filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('P<')) return 'P';
    if (line.startsWith('V<')) return 'V';
  }
  return null;
}

function getPassportMrzInvalidReason({ parsed, libParse, mrzText, rawText }) {
  const isValid = Boolean(parsed?.mrzValid ?? libParse?.valid ?? false);
  if (isValid) return null;
  if (!parsed && !libParse) return 'MRZ could not be parsed from OCR text.';
  if (parsed?.checkDigits) {
    const failed = Object.entries(parsed.checkDigits)
      .filter(([, ok]) => ok === false)
      .map(([k]) => k);
    if (failed.length) return `Check digit validation failed for: ${failed.join(', ')}.`;
  }
  const prefix = detectPrefixType(mrzText) || detectPrefixType(rawText);
  if (prefix && prefix !== 'P') return `Detected MRZ prefix ${prefix}<, not passport P<.`;
  return 'Passport MRZ failed validation due to OCR noise or incomplete MRZ lines.';
}

/**
 * MRZ extraction for classification (uses existing OCR + parser modules only).
 */
export async function extractMRZ(buffer) {
  const mrzText = await ocrMrzStrip(buffer);
  const fullText = await ocrFullPage(buffer);
  const rawText = [mrzText, fullText].filter(Boolean).join('\n');

  const detectedByPrefix = detectPrefixType(mrzText) || detectPrefixType(rawText);
  if (detectedByPrefix === 'V') {
    const visa = extractVisaData(rawText, mrzText);
    return {
      mrzData: visa.mrzData,
      rawText,
      mrzText,
      fullText,
      visaParsed: visa.visaParsed,
      visaOcrFields: visa.visaOcrFields,
    };
  }

  // Existing passport behavior remains unchanged.
  const parsed = parseMrzFromText(rawText) || parseMrzFromText(mrzText);

  let libParse = null;
  if (parsed?.mrzLines?.length >= 2) {
    try {
      libParse = parseMrzLib(parsed.mrzLines);
    } catch {
      libParse = null;
    }
  }

  const documentType =
    normalizeDocumentType(libParse?.fields?.documentCode) ||
    normalizeDocumentType(parsed?.documentCode) ||
    inferDocumentTypeFromText(rawText);

  const mrzData = documentType
    ? {
        documentType,
        documentCode: parsed?.documentCode ?? libParse?.fields?.documentCode ?? null,
        mrzValid: parsed?.mrzValid ?? libParse?.valid ?? false,
        mrzInvalidReason: getPassportMrzInvalidReason({ parsed, libParse, mrzText, rawText }),
        format: parsed?.format ?? libParse?.format ?? null,
        fields: parsed ?? libParse?.fields ?? null,
      }
    : null;

  return {
    mrzData,
    rawText,
    mrzText,
    fullText,
    parsed,
  };
}
