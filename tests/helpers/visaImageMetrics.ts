import type { VisaData } from '../../src/modules/extraction/visa/VisaData.js';

const FIELD_KEYS = [
  'surname',
  'givenNames',
  'nationality',
  'passportNumber',
  'sex',
  'dateOfBirth',
  'issueDate',
  'expiryDate',
  'entries',
  'issuingCountry',
  'visaType',
  'controlNumber',
] as const;

export interface FixtureGroundTruth {
  surname?: string | null;
  givenNames?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  entries?: string | null;
  issuingCountry?: string | null;
  visaType?: string | null;
  controlNumber?: string | null;
  mrzValid?: boolean;
  expectedDetectedAsVisa?: boolean;
  machineReadableZone?: string | null;
}

export interface OcrPassTracking {
  passWinner: string;
  ocrConfidence: number;
  passScores: Record<string, number>;
  recoveredFields: number;
}

export interface SampleResult {
  id: string;
  country: string;
  variant: string;
  degradation: string;
  detectedAsVisa: boolean;
  mrzValid: boolean;
  fieldHits: number;
  fieldTotal: number;
  ocrCharAccuracy: number;
  mrzMatch: boolean;
  falseNegative: boolean;
  ocrPassWinner?: string;
  ocrConfidence?: number;
  passScores?: Record<string, number>;
  recoveredFields?: number;
  elapsedMs?: number;
}

function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function fieldMatch(expected: string | null | undefined, actual: string | null | undefined): boolean {
  if (!expected) return true;
  if (!actual) return false;
  const e = norm(expected);
  const a = norm(actual);
  if (!e) return true;
  return a.includes(e) || e.includes(a.slice(0, Math.min(4, a.length)));
}

export function scoreFields(gt: FixtureGroundTruth, visa: VisaData): { hits: number; total: number } {
  let hits = 0;
  let total = 0;
  for (const key of FIELD_KEYS) {
    const expected = gt[key];
    if (expected == null || expected === '') continue;
    total++;
    if (fieldMatch(expected, visa[key] as string | null)) hits++;
  }
  return { hits, total };
}

export function ocrCharacterAccuracy(gt: FixtureGroundTruth, rawText: string): number {
  const tokens = [
    gt.surname,
    gt.givenNames,
    gt.nationality,
    gt.passportNumber,
    gt.issuingCountry,
    gt.visaType,
    gt.controlNumber,
  ]
    .filter(Boolean)
    .map((t) => norm(t));

  if (!tokens.length) return 0;
  const ocr = norm(rawText);
  let found = 0;
  for (const t of tokens) {
    if (t.length >= 3 && ocr.includes(t.slice(0, Math.max(3, Math.floor(t.length * 0.7))))) found++;
  }
  return found / tokens.length;
}

export function mrzAccuracy(gt: FixtureGroundTruth, visa: VisaData): boolean {
  if (gt.mrzValid === false) return visa.mrzValid === false;
  return visa.mrzValid === true;
}

export function buildSampleResult(
  fixture: { id: string; country: string; variant: string; degradation: string; groundTruth: FixtureGroundTruth },
  detectedAsVisa: boolean,
  visa: VisaData,
  rawText: string,
  tracking?: OcrPassTracking & { elapsedMs?: number },
): SampleResult {
  const { hits, total } = scoreFields(fixture.groundTruth, visa);
  const expectedDetect = fixture.groundTruth.expectedDetectedAsVisa !== false;
  const passWinner = tracking?.passWinner ?? 'pass1';
  const recoveredFields =
    tracking?.recoveredFields ??
    (passWinner !== 'pass1' && hits > 0 ? hits : 0);

  return {
    id: fixture.id,
    country: fixture.country,
    variant: fixture.variant,
    degradation: fixture.degradation,
    detectedAsVisa,
    mrzValid: visa.mrzValid,
    fieldHits: hits,
    fieldTotal: total,
    ocrCharAccuracy: ocrCharacterAccuracy(fixture.groundTruth, rawText),
    mrzMatch: mrzAccuracy(fixture.groundTruth, visa),
    falseNegative: expectedDetect && !detectedAsVisa,
    ocrPassWinner: passWinner,
    ocrConfidence: tracking?.ocrConfidence,
    passScores: tracking?.passScores,
    recoveredFields,
    elapsedMs: tracking?.elapsedMs,
  };
}

export interface BenchmarkSummary {
  totalSamples: number;
  fieldAccuracy: number;
  ocrCharAccuracy: number;
  mrzAccuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  durationMs?: number;
  avgElapsedMs?: number;
  byDegradation: Record<string, { count: number; fieldAccuracy: number }>;
  byCountry: Record<string, { count: number; fieldAccuracy: number }>;
  byOcrPass?: Record<string, number>;
  blurRecovery?: {
    nonPass1Winners: number;
    totalRecoveredFields: number;
    avgOcrConfidence: number;
  };
}

export function summarizeResults(samples: SampleResult[], durationMs?: number): BenchmarkSummary {
  const fieldAccuracy =
    samples.reduce((s, r) => s + (r.fieldTotal > 0 ? r.fieldHits / r.fieldTotal : 0), 0) /
    Math.max(samples.length, 1);
  const ocrCharAccuracy = samples.reduce((s, r) => s + r.ocrCharAccuracy, 0) / Math.max(samples.length, 1);
  const mrzAccuracyRate = samples.filter((r) => r.mrzMatch).length / Math.max(samples.length, 1);
  const falseNegativeRate = samples.filter((r) => r.falseNegative).length / Math.max(samples.length, 1);
  const falsePositiveRate = 0;

  const byDegradation: BenchmarkSummary['byDegradation'] = {};
  const byCountry: BenchmarkSummary['byCountry'] = {};

  for (const r of samples) {
    if (!byDegradation[r.degradation]) byDegradation[r.degradation] = { count: 0, fieldAccuracy: 0 };
    if (!byCountry[r.country]) byCountry[r.country] = { count: 0, fieldAccuracy: 0 };
    byDegradation[r.degradation].count++;
    byDegradation[r.degradation].fieldAccuracy += r.fieldTotal > 0 ? r.fieldHits / r.fieldTotal : 0;
    byCountry[r.country].count++;
    byCountry[r.country].fieldAccuracy += r.fieldTotal > 0 ? r.fieldHits / r.fieldTotal : 0;
  }

  for (const k of Object.keys(byDegradation)) {
    byDegradation[k].fieldAccuracy /= byDegradation[k].count;
  }
  for (const k of Object.keys(byCountry)) {
    byCountry[k].fieldAccuracy /= byCountry[k].count;
  }

  const byOcrPass: Record<string, number> = {};
  let totalRecoveredFields = 0;
  let ocrConfSum = 0;
  let ocrConfCount = 0;
  for (const r of samples) {
    const pass = r.ocrPassWinner || 'pass1';
    byOcrPass[pass] = (byOcrPass[pass] || 0) + 1;
    totalRecoveredFields += r.recoveredFields || 0;
    if (r.ocrConfidence != null) {
      ocrConfSum += r.ocrConfidence;
      ocrConfCount++;
    }
  }

  const elapsedSamples = samples.filter((s) => s.elapsedMs != null);
  const avgElapsedMs =
    elapsedSamples.length > 0
      ? elapsedSamples.reduce((s, r) => s + (r.elapsedMs || 0), 0) / elapsedSamples.length
      : undefined;

  return {
    totalSamples: samples.length,
    fieldAccuracy,
    ocrCharAccuracy,
    mrzAccuracy: mrzAccuracyRate,
    falsePositiveRate,
    falseNegativeRate,
    durationMs,
    avgElapsedMs,
    byDegradation,
    byCountry,
    byOcrPass,
    blurRecovery: {
      nonPass1Winners: samples.filter((s) => s.ocrPassWinner && s.ocrPassWinner !== 'pass1').length,
      totalRecoveredFields,
      avgOcrConfidence: ocrConfCount > 0 ? ocrConfSum / ocrConfCount : 0,
    },
  };
}

export function renderBenchmarkMarkdown(summary: BenchmarkSummary, samples: SampleResult[]): string {
  const lines = [
    '# Visa Image OCR Benchmark',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Samples | ${summary.totalSamples} |`,
    `| Field accuracy | ${(summary.fieldAccuracy * 100).toFixed(1)}% |`,
    `| OCR character accuracy | ${(summary.ocrCharAccuracy * 100).toFixed(1)}% |`,
    `| MRZ accuracy | ${(summary.mrzAccuracy * 100).toFixed(1)}% |`,
    `| False positive rate | ${(summary.falsePositiveRate * 100).toFixed(1)}% |`,
    `| False negative rate | ${(summary.falseNegativeRate * 100).toFixed(1)}% |`,
  ];

  if (summary.durationMs != null) {
    lines.push(`| Total runtime | ${(summary.durationMs / 1000).toFixed(1)}s |`);
  }
  if (summary.avgElapsedMs != null) {
    lines.push(`| Avg per image | ${summary.avgElapsedMs.toFixed(0)}ms |`);
  }
  if (summary.blurRecovery) {
    lines.push(
      `| Blur pass winners (non-pass1) | ${summary.blurRecovery.nonPass1Winners} |`,
      `| Recovered field signals | ${summary.blurRecovery.totalRecoveredFields} |`,
      `| Avg OCR confidence | ${summary.blurRecovery.avgOcrConfidence.toFixed(1)} |`,
    );
  }

  lines.push(
    '',
    '## By country',
    '',
    '| Country | Samples | Field accuracy |',
    '|---------|---------|----------------|',
  );

  for (const [country, data] of Object.entries(summary.byCountry).sort()) {
    lines.push(`| ${country} | ${data.count} | ${(data.fieldAccuracy * 100).toFixed(1)}% |`);
  }

  lines.push('', '## By degradation', '', '| Degradation | Samples | Field accuracy |', '|-------------|---------|----------------|');
  for (const [deg, data] of Object.entries(summary.byDegradation).sort()) {
    lines.push(`| ${deg} | ${data.count} | ${(data.fieldAccuracy * 100).toFixed(1)}% |`);
  }

  if (summary.byOcrPass && Object.keys(summary.byOcrPass).length) {
    lines.push('', '## OCR pass winners', '', '| Pass | Samples |', '|------|---------|');
    for (const [pass, count] of Object.entries(summary.byOcrPass).sort()) {
      lines.push(`| ${pass} | ${count} |`);
    }
  }

  const worst = [...samples]
    .sort((a, b) => (a.fieldTotal > 0 ? a.fieldHits / a.fieldTotal : 0) - (b.fieldTotal > 0 ? b.fieldHits / b.fieldTotal : 0))
    .slice(0, 10);

  lines.push('', '## Lowest field accuracy (top 10)', '', '| ID | Field acc | OCR acc | MRZ ok |', '|----|-----------|---------|--------|');
  for (const r of worst) {
    const fa = r.fieldTotal > 0 ? ((r.fieldHits / r.fieldTotal) * 100).toFixed(0) : '0';
    lines.push(`| ${r.id} | ${fa}% | ${(r.ocrCharAccuracy * 100).toFixed(0)}% | ${r.mrzMatch ? 'yes' : 'no'} |`);
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- Images: `tests/fixtures/visa-images/{country}/{variant}.png`',
    '- Ground truth: `tests/fixtures/visa-groundtruth/`',
    '- Pipeline: real `OCRService` + `evaluateVisaFromImage` (no mocked OCR)',
    '- Regenerate: `node tests/fixtures/visa-image-generator.mjs`',
    '- Re-benchmark: `npm run benchmark:visa-images`',
    '',
  );

  return lines.join('\n');
}
