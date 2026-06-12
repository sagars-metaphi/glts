/**
 * Main extraction suite — exercises every extractor registered in AppContainer.
 *
 * Text/fixture-based by default (fast, no OCR workers).
 * Set EXTRACT_IMAGE_TESTS=1 to also run visa image OCR when fixtures exist.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createContainer } from '../src/config/container.js';
import { FUTURE_EXTRACTOR_TYPES } from '../src/modules/extraction/shared/PlaceholderExtractor.js';
import { ValidationError } from '../src/common/exceptions/AppError.js';
import { parseMrzFromText } from '../src/modules/extraction/shared/lib/mrz-parser.js';
import { sanitizeMrzFields } from '../src/modules/extraction/shared/lib/field-sanitizer.js';
import { extractVisaData } from '../src/modules/extraction/shared/lib/visa-extract.js';
import { extractVisaFromOcr } from '../src/modules/extraction/visa/VisaOcrExtractor.js';
import { mapMrzToVisaData, mapOcrToVisaData, mergeVisaData } from '../src/modules/extraction/visa/VisaFieldMapper.js';
import { extractChineseBusinessLicenseFields } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js';
import { runDocumentExtraction } from '../src/modules/extraction/document/lib/run-extraction.js';
import { DocumentExtractor } from '../src/modules/extraction/document/DocumentExtractor.js';
import { buildValidVisaMrz, VALID_VISA_SAMPLES } from './fixtures/visa-mrz-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const container = createContainer();

const IMPLEMENTED_EXTRACTORS = [
  'passport',
  'visa',
  'document',
  'chinese-business-license',
] as const;

const PASSPORT_MRZ =
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
  'L898902C<3UTO7408122F1204159ZE184226B<<<<<<<<<6';

const VISA_OCR_TEXT = `VISA
SURNAME: DOE
GIVEN NAMES: JOHN
NATIONALITY: IND
PASSPORT NO: Z1234567
DATE OF BIRTH: 15/05/1990`;

const CBL_FIXTURE = path.join(ROOT, 'tests/fixtures/chinese-business-license-ocr-sample.txt');
const DOC_TEMPLATE = path.join(ROOT, 'src/templates/employment-form.json');
const DOC_SAMPLE = path.join(ROOT, 'tests/fixtures/sample.docx');
const VISA_MANIFEST = path.join(ROOT, 'tests/fixtures/visa-groundtruth/manifest.json');

function createStaticTemplateRepo(templates: Record<string, unknown>) {
  return {
    async findById(id: string) {
      const template = templates[id];
      if (!template) throw new Error(`template not found: ${id}`);
      return template as Record<string, unknown>;
    },
    async exists(id: string) {
      return id in templates;
    },
    async listIds() {
      return Object.keys(templates);
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('extractor registry includes all implemented and placeholder types', () => {
  const types = container.extractorFactory.types().sort();

  for (const type of IMPLEMENTED_EXTRACTORS) {
    assert.ok(types.includes(type), `missing implemented extractor: ${type}`);
  }
  for (const type of FUTURE_EXTRACTOR_TYPES) {
    assert.ok(types.includes(type), `missing placeholder extractor: ${type}`);
  }

  assert.equal(
    types.length,
    IMPLEMENTED_EXTRACTORS.length + FUTURE_EXTRACTOR_TYPES.length,
    `unexpected extractor count: ${types.join(', ')}`,
  );
});

test('implemented extractors expose correct type identifiers', () => {
  for (const type of IMPLEMENTED_EXTRACTORS) {
    assert.equal(container.extractorFactory.get(type).type, type);
  }
});

test('placeholder extractors return not-implemented response', async () => {
  for (const type of FUTURE_EXTRACTOR_TYPES) {
    const result = await container.extractorFactory.get(type).extract(Buffer.from('test')) as {
      success: boolean;
      type: string;
      message?: string;
    };
    assert.equal(result.success, false);
    assert.equal(result.type, type);
    assert.match(result.message || '', /not implemented/i);
  }
});

test('document extractor requires templateId', async () => {
  const template = JSON.parse(await fs.readFile(DOC_TEMPLATE, 'utf8'));
  const extractor = new DocumentExtractor(
    createStaticTemplateRepo({ [template.id]: template }) as never,
  );

  await assert.rejects(
    () => extractor.extract(Buffer.from(''), { filename: 'sample.docx' }),
    ValidationError,
  );
});

test('passport extraction pipeline parses valid TD3 MRZ', () => {
  const parsed = parseMrzFromText(PASSPORT_MRZ);
  assert.ok(parsed);
  assert.equal(parsed?.format, 'TD3');
  assert.equal(parsed?.mrzValid, true);
  assert.equal(parsed?.surname, 'ERIKSSON');
  assert.equal(parsed?.givenName, 'ANNA MARIA');

  const sanitized = sanitizeMrzFields({
    passportNumber: parsed!.passportNumber,
    surname: parsed!.surname,
    givenName: parsed!.givenName,
    nationality: parsed!.nationality,
    birthDate: parsed!.birthDate,
    sex: parsed!.sex,
    expiryDate: parsed!.expiryDate,
  });

  assert.equal(sanitized.passportNumber, 'L898902C');
  assert.equal(sanitized.nationality, 'UTO');
});

test('visa extraction parses MRZ and labelled OCR fields', () => {
  const sample = VALID_VISA_SAMPLES[0];
  const { mrz } = buildValidVisaMrz(sample);

  const legacy = extractVisaData(VISA_OCR_TEXT, mrz);
  assert.equal(legacy.mrzData?.mrzValid, true);

  const ocr = extractVisaFromOcr(VISA_OCR_TEXT);
  assert.equal(ocr.surname, 'DOE');
  assert.equal(ocr.givenNames, 'JOHN');

  const fromMrz = mapMrzToVisaData(
    (legacy.mrzData?.fields || {}) as Record<string, unknown>,
    true,
    mrz,
  );
  const fromOcr = mapOcrToVisaData(ocr);
  const visa = mergeVisaData(fromMrz, fromOcr, VISA_OCR_TEXT, 0.9);

  assert.ok(visa.surname);
  assert.ok(visa.passportNumber || visa.nationality);
  assert.equal(visa.mrzValid, true);
});

test('chinese business license extraction returns dual-value fields', async () => {
  const ocrText = await fs.readFile(CBL_FIXTURE, 'utf8');
  const result = await extractChineseBusinessLicenseFields(ocrText, 78);

  assert.equal(result.fields.companyName.rawValue, '广东省创述家具有限公司');
  assert.equal(result.fields.companyName.normalizedValue, '广东省创述家具有限公司');
  assert.equal(result.fields.creditCode.checksumValid, true);
  assert.equal(result.fields.creditCode.normalizedValue, '914406067778330440');
  assert.ok(result.fields.companyName.confidence > 0);
  assert.ok(Array.isArray(result.extractionDebug));
  assert.equal(result.extractionDebug.length, 10);
});

test('document extraction with employment template', async (t) => {
  if (!(await fileExists(DOC_SAMPLE))) {
    t.skip('tests/fixtures/sample.docx not found');
    return;
  }

  const template = JSON.parse(await fs.readFile(DOC_TEMPLATE, 'utf8'));
  const buffer = await fs.readFile(DOC_SAMPLE);
  const result = await runDocumentExtraction({
    buffer,
    filename: 'sample.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    template,
    outputDir: path.join(ROOT, 'output/document-extraction'),
    saveOutput: false,
  }) as { fields?: Record<string, { value?: string }> };

  assert.ok(result);
  assert.ok(typeof result === 'object');
});

test('optional image OCR extractions', async (t) => {
  if (process.env.EXTRACT_IMAGE_TESTS !== '1') {
    t.skip('set EXTRACT_IMAGE_TESTS=1 to run image-based extractor tests');
    return;
  }

  const manifestRaw = await fs.readFile(VISA_MANIFEST, 'utf8');
  const manifest = JSON.parse(manifestRaw) as { fixtures: Array<{ imagePath: string; id: string }> };
  const fixture = manifest.fixtures.find((f) => f.id === 'usa_01_clean');
  if (!fixture) {
    t.skip('usa_01_clean fixture not found in manifest');
    return;
  }

  const imagePath = path.join(ROOT, fixture.imagePath);
  if (!(await fileExists(imagePath))) {
    t.skip(`visa image not found: ${fixture.imagePath}`);
    return;
  }

  const { OCRService } = await import('../src/modules/extraction/shared/OCRService.js');
  const { VisaExtractor } = await import('../src/modules/extraction/visa/VisaExtractor.js');
  const { terminateOcrWorkers } = await import('../src/modules/extraction/shared/lib/ocr.js');

  try {
    const ocr = new OCRService();
    const extractor = new VisaExtractor(ocr);
    const buffer = await fs.readFile(imagePath);
    const result = await extractor.extract(buffer) as { success: boolean; type: string };

    assert.equal(result.success, true);
    assert.equal(result.type, 'visa');
  } finally {
    await terminateOcrWorkers();
  }
});
