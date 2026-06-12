import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getFileBuffer, ocrMrzStrip, ocrFullPage } from './ocr.js';
import { parseMrzFromText } from './mrz-parser.js';
import { extractFieldsFromOcrText } from './field-extractor.js';
import { sanitizeMrzFields, mergeOcrWithMrz } from './field-sanitizer.js';

const criticalFields = ['passportNumber', 'surname', 'givenName', 'nationality', 'birthDate', 'sex', 'expiryDate'];

export async function processPassportFile(filePath) {
  let fileBuffer;
  try {
    fileBuffer = await getFileBuffer(filePath);
  } catch (err) {
    throw new Error(`Failed to read file or convert PDF: ${err.message}`);
  }

  const mrzText = await ocrMrzStrip(fileBuffer);
  let mrzParsed = parseMrzFromText(mrzText);

  let isMrzComplete = false;
  if (mrzParsed?.mrzValid) {
    isMrzComplete = criticalFields.every(
      (field) => mrzParsed[field] !== null && mrzParsed[field] !== undefined && mrzParsed[field] !== '',
    );
  }

  const fullText = await ocrFullPage(fileBuffer);
  const fullOcrRun = true;

  if (!mrzParsed) {
    mrzParsed = parseMrzFromText(`${mrzText}\n${fullText}`);
  }

  const visualExtracted = extractFieldsFromOcrText(fullText);

  const rawMrzFields = sanitizeMrzFields(
    mrzParsed
      ? {
          passportNumber: mrzParsed.passportNumber,
          surname: mrzParsed.surname,
          givenName: mrzParsed.givenName,
          nationality: mrzParsed.nationality,
          birthDate: mrzParsed.birthDate,
          sex: mrzParsed.sex,
          expiryDate: mrzParsed.expiryDate,
        }
      : {},
  );

  const ocrfields = mergeOcrWithMrz(visualExtracted, rawMrzFields, {
    mrzValid: mrzParsed?.mrzValid ?? false,
    fullText,
  });

  const mrzfields = { ...rawMrzFields };
  if (ocrfields.surname) mrzfields.surname = ocrfields.surname;
  if (ocrfields.givenName) mrzfields.givenName = ocrfields.givenName;

  const hasMrzData = criticalFields.some((f) => mrzfields[f] != null && mrzfields[f] !== '');

  let extractionPath = 'mrz_only';
  if (mrzParsed?.mrzValid && isMrzComplete) {
    extractionPath = 'mrz_only';
  } else if (hasMrzData) {
    extractionPath = 'mrz_partial';
  } else if (!hasMrzData && !criticalFields.some((f) => ocrfields[f] != null)) {
    extractionPath = 'ocr_only';
  } else {
    extractionPath = 'mrz_with_ocr_fallback';
  }

  return {
    success: true,
    type: 'passport',
    mrzValid: mrzParsed ? mrzParsed.mrzValid : false,
    extractionPath,
    fullOcrRun,
    mrzfields,
    ocrfields,
  };
}

export async function processPassportBuffer(buffer, filename = 'upload.jpg') {
  const tmpDir = path.join(os.tmpdir(), 'passport-extract');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${Date.now()}-${filename}`);
  await fs.writeFile(tmpPath, buffer);
  try {
    return await processPassportFile(tmpPath);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}
