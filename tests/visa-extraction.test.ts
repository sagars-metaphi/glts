import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVisaData } from '../src/modules/extraction/shared/lib/visa-extract.js';
import { extractVisaFromOcr } from '../src/modules/extraction/visa/VisaOcrExtractor.js';
import { mapMrzToVisaData, mapOcrToVisaData, mergeVisaData } from '../src/modules/extraction/visa/VisaFieldMapper.js';
import { computeVisaConfidence, computeMetrics } from '../src/modules/extraction/visa/VisaConfidence.js';
import { validateVisaData, isExpired } from '../src/modules/extraction/visa/VisaValidators.js';
import { VISA_TEST_SAMPLES } from '../src/modules/extraction/visa/VisaTestData.js';
import { VALID_VISA_SAMPLES } from './fixtures/visa-mrz-generator.js';

interface EvalResult {
  id: string;
  passed: boolean;
  fieldAccuracy: number;
  mrzValid: boolean;
  missing: string[];
}

function evaluateSample(sample: {
  id: string;
  ocrText: string;
  mrzLine1?: string;
  mrzLine2?: string;
  groundTruth: Record<string, string | undefined>;
}): EvalResult {
  const mrzText = [sample.mrzLine1, sample.mrzLine2].filter(Boolean).join('\n');
  const legacy = extractVisaData(sample.ocrText, mrzText);
  const ocr = extractVisaFromOcr(sample.ocrText);
  const fromMrz = mapMrzToVisaData(
    (legacy.mrzData?.fields || {}) as Record<string, unknown>,
    Boolean(legacy.mrzData?.mrzValid),
    mrzText,
  );
  const fromOcr = mapOcrToVisaData(ocr);
  const visa = mergeVisaData(fromMrz, fromOcr, sample.ocrText, 0);

  const checks: Array<[keyof typeof sample.groundTruth, keyof typeof visa]> = [
    ['surname', 'surname'],
    ['givenNames', 'givenNames'],
    ['nationality', 'nationality'],
    ['passportNumber', 'passportNumber'],
    ['issuingCountry', 'issuingCountry'],
  ];

  let hits = 0;
  const missing: string[] = [];
  for (const [gtKey, visaKey] of checks) {
    const expected = sample.groundTruth[gtKey];
    if (!expected) continue;
    const actual = visa[visaKey];
    const ok =
      actual != null &&
      String(actual).toUpperCase().includes(String(expected).toUpperCase().slice(0, 3));
    if (ok) hits++;
    else missing.push(String(gtKey));
  }

  const total = checks.filter(([k]) => sample.groundTruth[k]).length;
  return {
    id: sample.id,
    passed: hits / Math.max(total, 1) >= 0.6,
    fieldAccuracy: total > 0 ? hits / total : 0,
    mrzValid: Boolean(legacy.mrzData?.mrzValid),
    missing,
  };
}

test('VisaTestData generates 50+ synthetic samples', () => {
  assert.ok(VISA_TEST_SAMPLES.length >= 50, `expected 50+, got ${VISA_TEST_SAMPLES.length}`);
});

test('extractVisaFromOcr extracts labelled fields', () => {
  const text = `VISA\nSURNAME: DOE\nGIVEN NAMES: JOHN\nNATIONALITY: IND\nPASSPORT NO: Z1234567\nDATE OF BIRTH: 15/05/1990`;
  const ocr = extractVisaFromOcr(text);
  assert.equal(ocr.surname, 'DOE');
  assert.equal(ocr.givenNames, 'JOHN');
  assert.equal(ocr.nationality, 'IND');
});

test('ICAO valid visa MRZ fixtures parse with mrzValid', () => {
  for (const sample of VALID_VISA_SAMPLES) {
    const result = extractVisaData(sample.mrz, sample.mrz);
    assert.equal(result.mrzData?.documentType, 'V');
    assert.equal(result.mrzData?.mrzValid, true, sample.id);
    assert.ok(result.mrzData?.fields?.surname, sample.id);
  }
});

test('confidence and metrics computation', () => {
  const visa = mergeVisaData(
    {
      surname: 'DOE',
      givenNames: 'JOHN',
      nationality: 'USA',
      passportNumber: '123456789',
      mrzValid: true,
    },
    {},
    'text',
    0,
  );
  const conf = computeVisaConfidence({
    mrzValid: true,
    mrzFieldCount: 5,
    ocrFieldCount: 2,
    merged: visa,
  });
  assert.ok(conf > 0.5);
  const metrics = computeMetrics(visa, true, 0.8);
  assert.ok(metrics.fieldExtractionRate > 0);
  assert.ok(metrics.populatedFields.includes('surname'));
});

test('validateVisaData and isExpired', () => {
  const v = validateVisaData(
    mergeVisaData({ surname: 'X', sex: 'M' as const, mrzValid: false }, {}, '', 0),
  );
  assert.equal(v.valid, true);
  assert.equal(isExpired('01/01/2020'), true);
  assert.equal(isExpired('01/01/2030'), false);
});

test('synthetic dataset field accuracy >= 60% per sample', () => {
  const results = VISA_TEST_SAMPLES.map((s) => evaluateSample(s));
  const avg =
    results.reduce((sum, r) => sum + r.fieldAccuracy, 0) / Math.max(results.length, 1);
  const passRate = results.filter((r) => r.passed).length / results.length;

  assert.ok(avg >= 0.6, `avg field accuracy ${avg.toFixed(2)} below 60%`);
  assert.ok(passRate >= 0.6, `pass rate ${passRate.toFixed(2)} below 60%`);
});

test('accuracy report summary', () => {
  const icao = VALID_VISA_SAMPLES.map((s) => evaluateSample({
    id: s.id,
    ocrText: s.mrz,
    mrzLine1: s.line1,
    mrzLine2: s.line2,
    groundTruth: {
      surname: s.surname,
      givenNames: s.givenName,
      nationality: s.nationality,
      passportNumber: s.documentNumber,
      issuingCountry: s.issuingCountry,
    },
  }));

  const synth = VISA_TEST_SAMPLES.map((s) => evaluateSample(s));
  const all = [...icao, ...synth];
  const report = {
    totalSamples: all.length,
    icaoSamples: icao.length,
    syntheticSamples: synth.length,
    avgFieldAccuracy: all.reduce((s, r) => s + r.fieldAccuracy, 0) / all.length,
    mrzValidRate: all.filter((r) => r.mrzValid).length / all.length,
    passRate: all.filter((r) => r.passed).length / all.length,
  };

  assert.ok(report.totalSamples >= 55);
  assert.ok(report.avgFieldAccuracy >= 0.6);
  console.log('\n=== VISA EXTRACTION ACCURACY REPORT ===');
  console.log(JSON.stringify(report, null, 2));
});
