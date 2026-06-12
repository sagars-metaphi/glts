/**
 * False-positive regression tests (FP-02..FP-05 and related).
 * Asserts non-visa documents are not classified or scored as visas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVisaData } from '../src/modules/extraction/shared/lib/visa-extract.js';
import { extractVisaFromOcr } from '../src/modules/extraction/visa/VisaOcrExtractor.js';
import {
  mapMrzToVisaData,
  mapOcrToVisaData,
  mergeVisaData,
} from '../src/modules/extraction/visa/VisaFieldMapper.js';
import { computeVisaConfidence, computeMetrics } from '../src/modules/extraction/visa/VisaConfidence.js';
import { VISA_CORE_FIELDS, type VisaData } from '../src/modules/extraction/visa/VisaData.js';
import { evaluateVisaFromText } from '../src/modules/extraction/visa/visaFromText.js';

/** Max confidence for documents that must not be treated as visas */
const MAX_NON_VISA_CONFIDENCE = 0.4;

export interface FalsePositiveFixture {
  id: string;
  edgeCaseId: string;
  description: string;
  text: string;
  /** Document must not be classified as a visa */
  expectDetectedAsVisa: false;
  expectVisaNumber: null;
  expectControlNumber: null;
  expectVisaCategory: null;
  maxConfidence: number;
  maxPopulatedFields: number;
}

export const FALSE_POSITIVE_FIXTURES: FalsePositiveFixture[] = [
  {
    id: 'fp-passport-td3',
    edgeCaseId: 'FP-01',
    description: 'Passport TD3 (P< MRZ) uploaded to visa endpoint',
    text: [
      'PASSPORT',
      'SURNAME: SMITH',
      'GIVEN NAMES: JOHN',
      'NATIONALITY: GBR',
      'PASSPORT NO: 123456789',
      'DATE OF BIRTH: 01/01/1990',
      'P<GBRSMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<',
      '1234567890GBR9001011M3001011<<<<<<<<<<<<<<08',
    ].join('\n'),
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 6,
  },
  {
    id: 'fp-national-id',
    edgeCaseId: 'FP-01',
    description: 'National identity card',
    text: [
      'IDENTITY CARD',
      'NAME: RAHUL PATEL',
      'NATIONALITY: IND',
      'DATE OF BIRTH: 01/01/1990',
      'ID NUMBER: ABCD1234EF',
    ].join('\n'),
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 3,
  },
  {
    id: 'fp-work-permit',
    edgeCaseId: 'FP-04',
    description: 'Work permit (not a visa foil)',
    text: [
      'WORK PERMIT',
      'EMPLOYER: ACME CORP',
      'PURPOSE: WORK',
      'NATIONALITY: CAN',
      'VALID UNTIL: 31/12/2026',
    ].join('\n'),
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 4,
  },
  {
    id: 'fp-travel-insurance',
    edgeCaseId: 'FP-04',
    description: 'Travel insurance with Schengen-like duration/purpose wording',
    text: [
      'TRAVEL INSURANCE CERTIFICATE',
      'DURATION OF STAY: 90 DAYS',
      'PURPOSE OF TRAVEL: TOURISM',
      'POLICY NO: INS-998877',
    ].join('\n'),
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 2,
  },
  {
    id: 'fp-invoice-10digit',
    edgeCaseId: 'FP-03',
    description: 'Invoice with bare 10-digit number (must not become control/visa number)',
    text: ['INVOICE', 'INVOICE NO 1234567890', 'TOTAL AMOUNT: 500.00 USD'].join('\n'),
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 0,
  },
  {
    id: 'fp-generic-visa-word',
    edgeCaseId: 'FP-02',
    description: 'Generic form mentioning the word VISA (not a visa document)',
    text: 'APPLICATION FORM\nPlease state if you have a valid VISA for transit.',
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 0,
  },
  {
    id: 'fp-employment-letter',
    edgeCaseId: 'FP-05',
    description: 'Employment letter with CATEGORY label (must not set visaCategory)',
    text: [
      'EMPLOYMENT LETTER',
      'SPONSOR: GLOBAL TECH LTD',
      'HOST: LONDON OFFICE',
      'CATEGORY: A',
      'PURPOSE: WORK',
    ].join('\n'),
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 3,
  },
  {
    id: 'fp-random-ocr-noise',
    edgeCaseId: 'FP-08',
    description: 'Random OCR noise / lorem ipsum',
    text: 'Lorem ipsum dolor sit amet 12345 @@@ ### WORK TOURISM VISA CLASS',
    expectDetectedAsVisa: false,
    expectVisaNumber: null,
    expectControlNumber: null,
    expectVisaCategory: null,
    maxConfidence: MAX_NON_VISA_CONFIDENCE,
    maxPopulatedFields: 1,
  },
];

/** Positive control — real visa-shaped OCR text must still detect as visa */
const TRUE_VISA_FIXTURE = {
  id: 'fp-control-real-visa',
  text: [
    'VISA',
    'SURNAME: DOE',
    'GIVEN NAMES: JOHN',
    'NATIONALITY: USA',
    'PASSPORT NO: X12345678',
    'CONTROL NO: 9102392482',
  ].join('\n'),
};

function countPopulatedFields(visa: VisaData): number {
  return VISA_CORE_FIELDS.filter((key) => {
    if (key === 'mrzValid') return false;
    const val = visa[key];
    return val != null && val !== '';
  }).length;
}

/**
 * Legacy inline pipeline (pre-refactor) — documents broken detection:
 * extractVisaData always returns documentType 'V', so detectedAsVisa was always true.
 */
function evaluateVisaFromTextLegacy(rawText: string) {
  const mrzText = rawText;
  const legacy = extractVisaData(rawText, mrzText);
  const mrzFields = (legacy.mrzData?.fields || {}) as Record<string, unknown>;
  const mrzValid = Boolean(legacy.mrzData?.mrzValid);

  const enhancedOcr = extractVisaFromOcr(rawText);
  const legacyOcr = (legacy.visaOcrFields || {}) as Record<string, unknown>;

  const ocrMerged: Record<string, string | null> = {};
  for (const [k, v] of Object.entries({ ...legacyOcr, ...enhancedOcr })) {
    if (v != null && v !== '') ocrMerged[k] = String(v);
  }

  const fromMrz = mapMrzToVisaData(mrzFields, mrzValid, rawText);
  const fromOcr = mapOcrToVisaData(ocrMerged);

  const ocrFieldCount = Object.values(fromOcr).filter((v) => v != null && v !== '').length;

  const confidence = computeVisaConfidence({
    mrzValid,
    mrzFieldCount: Object.values(fromMrz).filter((v) => v != null && v !== '').length,
    ocrFieldCount,
    merged: mergeVisaData(fromMrz, fromOcr, rawText, 0),
  });

  const visa = mergeVisaData(fromMrz, fromOcr, rawText, confidence);
  visa.mrzValid = mrzValid;

  const ocrConfidence = ocrFieldCount > 0 ? Math.min(0.95, 0.5 + ocrFieldCount * 0.05) : 0.2;
  const metrics = computeMetrics(visa, mrzValid, ocrConfidence);

  const docType = legacy.mrzData?.documentType ?? 'V';
  const detectedAsVisa =
    docType === 'V' || String(rawText).includes('V<') || /VISA/i.test(rawText);

  return { detectedAsVisa, visa, metrics, populatedFieldCount: countPopulatedFields(visa) };
}

function falsePositiveRate(
  fixtures: FalsePositiveFixture[],
  evaluate: (text: string) => { detectedAsVisa: boolean },
): number {
  const positives = fixtures.filter((f) => evaluate(f.text).detectedAsVisa).length;
  return positives / fixtures.length;
}

// --- Baseline documentation (legacy broken detection) ---
test('baseline: legacy pipeline false-positive rate (documented)', () => {
  const rate = falsePositiveRate(FALSE_POSITIVE_FIXTURES, (t) => evaluateVisaFromTextLegacy(t));
  console.log(`\n[BASELINE] legacy detectedAsVisa false-positive rate: ${(rate * 100).toFixed(1)}% (${FALSE_POSITIVE_FIXTURES.filter((f) => evaluateVisaFromTextLegacy(f.text).detectedAsVisa).length}/${FALSE_POSITIVE_FIXTURES.length})`);
  // Legacy always sets documentType V → 100% FP rate expected before fix
  assert.ok(rate >= 0.5, 'baseline should show high FP rate before fixes');
});

// --- Target assertions (fixed pipeline) ---
for (const fixture of FALSE_POSITIVE_FIXTURES) {
  test(`false-positive: ${fixture.id} (${fixture.edgeCaseId})`, () => {
    const result = evaluateVisaFromText(fixture.text);

    assert.equal(
      result.detectedAsVisa,
      fixture.expectDetectedAsVisa,
      `[${fixture.id}] detectedAsVisa: expected ${fixture.expectDetectedAsVisa}, got ${result.detectedAsVisa}`,
    );
    assert.equal(
      result.visa.visaNumber,
      fixture.expectVisaNumber,
      `[${fixture.id}] visaNumber leaked: ${result.visa.visaNumber}`,
    );
    assert.equal(
      result.visa.controlNumber,
      fixture.expectControlNumber,
      `[${fixture.id}] controlNumber leaked: ${result.visa.controlNumber}`,
    );
    assert.equal(
      result.visa.visaCategory,
      fixture.expectVisaCategory,
      `[${fixture.id}] visaCategory leaked: ${result.visa.visaCategory}`,
    );
    assert.ok(
      result.visa.confidence <= fixture.maxConfidence,
      `[${fixture.id}] confidence ${result.visa.confidence} exceeds max ${fixture.maxConfidence}`,
    );
    assert.ok(
      result.populatedFieldCount <= fixture.maxPopulatedFields,
      `[${fixture.id}] populated fields ${result.populatedFieldCount} exceeds max ${fixture.maxPopulatedFields}`,
    );
  });
}

test('positive control: visa-shaped text is still detected as visa', () => {
  const result = evaluateVisaFromText(TRUE_VISA_FIXTURE.text);
  assert.equal(result.detectedAsVisa, true, 'real visa OCR text must detect as visa');
  assert.ok(result.visa.confidence > 0.3);
});

test('fixed pipeline false-positive rate summary', () => {
  const rate = falsePositiveRate(FALSE_POSITIVE_FIXTURES, (t) => evaluateVisaFromText(t));
  console.log(`\n[FIXED] detectedAsVisa false-positive rate: ${(rate * 100).toFixed(1)}% (${FALSE_POSITIVE_FIXTURES.filter((f) => evaluateVisaFromText(f.text).detectedAsVisa).length}/${FALSE_POSITIVE_FIXTURES.length})`);
  assert.equal(rate, 0, `false-positive rate must be 0%, got ${(rate * 100).toFixed(1)}%`);
});
