import type { FieldKey } from './constants.js';
import { FIELD_KEYS } from './constants.js';
import type { DocumentComparison, FieldComparison } from './compare.js';
import { computeSimilarity, isTextField } from './similarity.js';
import { diagnoseCreditCodeCandidates } from './creditCodeDiagnostics.js';

export type FailureBucket =
  | 'ocr_failure'
  | 'segmentation_failure'
  | 'validation_failure'
  | 'confidence_failure';

export interface DetailedFailureRecord {
  documentId: string;
  style: string;
  field: FieldKey;
  expected: string | null;
  actual: string | null;
  rawSegment: string | null;
  ocrText: string;
  failureCategory: FailureBucket;
  legacyCategory: string;
  confidence: number;
  requiresReview: boolean;
  exactMatch: boolean;
  normalizedMatch: boolean;
  levenshteinSimilarity: number;
}

export interface CompanyNameBoundaryDebug {
  documentId: string;
  style: string;
  startLabel: string;
  endLabel: string | null;
  rawSegment: string;
  extractedValue: string | null;
  expected: string | null;
  exactMatch: boolean;
}

export interface CreditCodeDiagnosticEntry {
  documentId: string;
  style: string;
  expected: string | null;
  extracted: string | null;
  rawSegment: string;
  candidates: ReturnType<typeof diagnoseCreditCodeCandidates>;
}

export interface BenchmarkRunContext {
  documentId: string;
  style: string;
  ocrText: string;
  extractionDebug: Array<{
    field: string;
    startLabel: string;
    nextLabel: string | null;
    rawSegment: string;
    raw: string | null;
    finalValue: string | null;
    confidence: number;
    requiresReview: boolean;
    checksumValid?: boolean;
    confusionCorrections: Array<{ index: number; from: string; to: string }>;
  }>;
  segments: Record<string, {
    startLabel: string;
    nextLabel: string | null;
    rawSegment: string;
  }>;
  expected: Record<string, string | null | undefined>;
}

function expectedInOcr(expected: string | null, ocrText: string): boolean {
  if (!expected) return false;
  if (ocrText.includes(expected)) return true;
  const probe = expected.slice(0, Math.min(6, expected.length));
  return probe.length >= 2 && ocrText.includes(probe);
}

function labelIntact(field: FieldKey, ocrText: string): boolean {
  const labels: Partial<Record<FieldKey, string>> = {
    creditCode: '统一社会信用代码',
    companyName: '名称',
    registeredCapital: '注册资本',
    companyType: '类型',
    establishmentDate: '成立日期',
    legalRepresentative: '法定代表人',
    businessTerm: '营业期限',
    address: '住所',
    businessScope: '经营范围',
    registrationAuthority: '登记机关',
  };
  const label = labels[field];
  if (!label) return true;
  return ocrText.includes(label);
}

export function classifyFailureBucket(
  field: FieldKey,
  expected: string | null,
  actual: string | null,
  ocrText: string,
  rawSegment: string | null,
  confidence: number,
  requiresReview: boolean,
  checksumValid?: boolean,
): FailureBucket {
  const overconfidentWrong = !requiresReview && confidence >= 0.8 && expected !== actual;
  const underconfident = requiresReview && confidence < 0.65 && expected === actual;

  if (field === 'creditCode') {
    if (!actual && expected) {
      return labelIntact(field, ocrText) ? 'validation_failure' : 'segmentation_failure';
    }
    if (actual && expected && actual !== expected) return 'validation_failure';
    if (!checksumValid && actual) return 'validation_failure';
  }

  if (overconfidentWrong) return 'confidence_failure';
  if (underconfident) return 'confidence_failure';

  if (!actual && expected) {
    if (!expectedInOcr(expected, ocrText)) return 'ocr_failure';
    if (!labelIntact(field, ocrText)) return 'segmentation_failure';
    if (!rawSegment || rawSegment.length < 2) return 'segmentation_failure';
    return 'segmentation_failure';
  }

  if (actual && expected && actual !== expected) {
    if (!expectedInOcr(expected, ocrText)) return 'ocr_failure';
    if (!labelIntact(field, ocrText)) return 'segmentation_failure';
    if (rawSegment && !rawSegment.includes(expected.slice(0, 4)) && field !== 'creditCode') {
      return 'segmentation_failure';
    }
    if (field === 'creditCode') return 'validation_failure';
    if (confidence >= 0.85 && requiresReview === false) return 'confidence_failure';
    return 'ocr_failure';
  }

  return 'ocr_failure';
}

function legacyCategory(bucket: FailureBucket): string {
  const map: Record<FailureBucket, string> = {
    ocr_failure: 'ocr_issue',
    segmentation_failure: 'segmentation_issue',
    validation_failure: 'validation_issue',
    confidence_failure: 'confidence_issue',
  };
  return map[bucket];
}

export function buildDetailedFailures(
  comparison: DocumentComparison,
  context: BenchmarkRunContext,
): DetailedFailureRecord[] {
  const failures: DetailedFailureRecord[] = [];
  const debugByField = Object.fromEntries(context.extractionDebug.map((d) => [d.field, d]));

  for (const f of comparison.fields) {
    if (f.exactMatch) continue;

    const debug = debugByField[f.field];
    const segment = context.segments[f.field];
    const similarity = computeSimilarity(f.expected, f.actual);
    const bucket = classifyFailureBucket(
      f.field,
      f.expected,
      f.actual,
      context.ocrText,
      segment?.rawSegment ?? debug?.rawSegment ?? null,
      f.confidence,
      f.requiresReview,
      debug?.checksumValid,
    );

    failures.push({
      documentId: comparison.documentId,
      style: comparison.style,
      field: f.field,
      expected: f.expected,
      actual: f.actual,
      rawSegment: segment?.rawSegment ?? debug?.rawSegment ?? null,
      ocrText: context.ocrText,
      failureCategory: bucket,
      legacyCategory: legacyCategory(bucket),
      confidence: f.confidence,
      requiresReview: f.requiresReview,
      ...similarity,
    });
  }

  return failures;
}

export function buildCompanyNameBoundaries(
  contexts: BenchmarkRunContext[],
  comparisons: DocumentComparison[],
): CompanyNameBoundaryDebug[] {
  const compById = Object.fromEntries(comparisons.map((c) => [c.documentId, c]));
  return contexts.map((ctx) => {
    const seg = ctx.segments.companyName;
    const debug = ctx.extractionDebug.find((d) => d.field === 'companyName');
    const field = compById[ctx.documentId]?.fields.find((f) => f.field === 'companyName');
    return {
      documentId: ctx.documentId,
      style: ctx.style,
      startLabel: seg?.startLabel ?? debug?.startLabel ?? '名称',
      endLabel: seg?.nextLabel ?? debug?.nextLabel ?? null,
      rawSegment: seg?.rawSegment ?? debug?.rawSegment ?? '',
      extractedValue: debug?.finalValue ?? field?.actual ?? null,
      expected: ctx.expected.companyName ?? null,
      exactMatch: field?.exactMatch ?? false,
    };
  });
}

export function buildCreditCodeDiagnostics(contexts: BenchmarkRunContext[]): CreditCodeDiagnosticEntry[] {
  return contexts.map((ctx) => {
    const seg = ctx.segments.creditCode?.rawSegment ?? '';
    const debug = ctx.extractionDebug.find((d) => d.field === 'creditCode');
    return {
      documentId: ctx.documentId,
      style: ctx.style,
      expected: ctx.expected.creditCode ?? null,
      extracted: debug?.finalValue ?? null,
      rawSegment: seg,
      candidates: diagnoseCreditCodeCandidates(seg, ctx.ocrText, ctx.expected.creditCode ?? null),
    };
  });
}

export function enrichFieldComparisons(fields: FieldComparison[]): Array<FieldComparison & {
  normalizedMatch: boolean;
  levenshteinSimilarity: number;
}> {
  return fields.map((f) => {
    const sim = computeSimilarity(f.expected, f.actual);
    return {
      ...f,
      normalizedMatch: sim.normalizedMatch,
      levenshteinSimilarity: isTextField(f.field) || f.field === 'creditCode'
        ? sim.levenshteinSimilarity
        : sim.levenshteinSimilarity,
    };
  });
}

export function groupFailuresByBucket(failures: DetailedFailureRecord[]): Record<FailureBucket, DetailedFailureRecord[]> {
  const grouped: Record<FailureBucket, DetailedFailureRecord[]> = {
    ocr_failure: [],
    segmentation_failure: [],
    validation_failure: [],
    confidence_failure: [],
  };
  for (const f of failures) grouped[f.failureCategory].push(f);
  return grouped;
}

export function summarizeFailureBuckets(failures: DetailedFailureRecord[]): Record<FailureBucket, number> {
  const counts: Record<FailureBucket, number> = {
    ocr_failure: 0,
    segmentation_failure: 0,
    validation_failure: 0,
    confidence_failure: 0,
  };
  for (const f of failures) counts[f.failureCategory] += 1;
  return counts;
}

export function countFailuresByField(failures: DetailedFailureRecord[]): Record<FieldKey, number> {
  const counts = Object.fromEntries(FIELD_KEYS.map((f) => [f, 0])) as Record<FieldKey, number>;
  for (const f of failures) counts[f.field] += 1;
  return counts;
}
