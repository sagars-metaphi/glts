import { normalizeRegisteredCapitalValue } from '../../../src/modules/extraction/chinese-business-license/chineseNumberParse.js';
import { sanitizeCreditSearchText } from '../../../src/modules/extraction/chinese-business-license/creditCodeExtract.js';
import { normalizeChineseDate } from '../../../src/modules/extraction/chinese-business-license/ChineseBusinessLicenseValidators.js';
import { FIELD_KEYS, type FieldKey } from './constants.js';

export interface FieldInput {
  rawValue?: string | null;
  normalizedValue?: string | null;
  value?: string | null;
  raw?: string | null;
  confidence?: number;
  requiresReview?: boolean;
}

export interface FieldComparison {
  field: FieldKey;
  expected: string | null;
  actual: string | null;
  ocrSegment: string | null;
  rawValue: string | null;
  normalizedValue: string | null;
  /** Ground-truth match (business accuracy). */
  businessMatch: boolean;
  /** OCR segment fidelity (extraction accuracy). */
  extractionMatch: boolean;
  /** @deprecated use businessMatch */
  exactMatch: boolean;
  confidence: number;
  requiresReview: boolean;
}

export interface DocumentComparison {
  documentId: string;
  style: string;
  fields: FieldComparison[];
  exactMatches: number;
  businessMatches: number;
  extractionMatches: number;
  fieldTotal: number;
  ocrText?: string;
  extractionTimeMs?: number;
  ocrTimeMs?: number;
}

export interface FieldMetrics {
  field: FieldKey;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  exactMatchRate: number;
  businessMatchRate: number;
  extractionMatchRate: number;
  total: number;
}

export interface AggregateMetrics {
  documents: number;
  overallExactMatchRate: number;
  overallBusinessMatchRate: number;
  overallExtractionMatchRate: number;
  perField: Record<FieldKey, FieldMetrics>;
  perStyle: Record<string, {
    exactMatchRate: number;
    businessMatchRate: number;
    extractionMatchRate: number;
    documents: number;
  }>;
  reviewTriggerRate: number;
  avgConfidence: number;
  avgExtractionTimeMs: number;
  avgOcrTimeMs: number;
}

function normalizeCompareValue(field: FieldKey, value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (field === 'establishmentDate') return v;
  if (field === 'registeredCapital') {
    return normalizeRegisteredCapitalValue(v) || v.replace(/\s+/g, '');
  }
  if (field === 'creditCode') {
    return sanitizeCreditSearchText(v);
  }
  return v.replace(/\s+/g, '');
}

function normalizeOcrSegment(field: FieldKey, segment: string | null | undefined): string | null {
  if (segment == null) return null;
  const trimmed = segment.trim();
  if (!trimmed) return null;
  return normalizeCompareValue(field, trimmed);
}

function normalizeScopeForExtraction(value: string): string {
  return value.replace(/\s+/g, '').replace(/[;；]/g, '；').trim();
}

function extractionEquivalent(
  field: FieldKey,
  normalizedValue: string | null,
  rawValue: string | null,
  ocrSegment: string | null,
): boolean {
  const segmentNorm = normalizeOcrSegment(field, ocrSegment);
  const extractedNorm = normalizeCompareValue(field, normalizedValue);
  if (segmentNorm === extractedNorm) return true;
  if (segmentNorm == null && extractedNorm == null) return true;

  if (field === 'creditCode' && segmentNorm && extractedNorm) {
    return segmentNorm.includes(extractedNorm) || extractedNorm.includes(segmentNorm);
  }

  if (field === 'companyType' && ocrSegment) {
    const rawNorm = normalizeCompareValue(field, rawValue ?? normalizedValue);
    const segNorm = normalizeCompareValue(field, ocrSegment);
    if (rawNorm === segNorm) return true;
  }

  if (field === 'establishmentDate' && ocrSegment && normalizedValue) {
    const datePart =
      ocrSegment.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?|\d{4}[./-]\d{1,2}[./-]\d{1,2})/)?.[1]
      || ocrSegment.trim();
    const parsed = normalizeChineseDate(datePart);
    if (parsed.valid && parsed.normalized === normalizedValue) return true;
  }

  if (field === 'businessTerm' && ocrSegment && normalizedValue) {
    if (/长期/.test(ocrSegment) && normalizedValue === '长期') return true;
    const range = ocrSegment.match(
      /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*[至到\-—]\s*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|长期))/,
    );
    if (range && range[1].replace(/\s+/g, '') === normalizedValue.replace(/\s+/g, '')) return true;
  }

  if (field === 'registeredCapital' && ocrSegment && extractedNorm) {
    const segAmount = normalizeRegisteredCapitalValue(ocrSegment);
    if (segAmount && segAmount === extractedNorm) return true;
  }

  if (field === 'businessScope' && ocrSegment && normalizedValue) {
    const segScope = normalizeScopeForExtraction(ocrSegment.split(/登记机关/)[0] || ocrSegment);
    const extScope = normalizeScopeForExtraction(normalizedValue);
    if (segScope === extScope) return true;
    if (segScope && extScope && (segScope.includes(extScope) || extScope.includes(segScope))) return true;
  }

  if (field === 'legalRepresentative' && ocrSegment) {
    const rawNorm = (rawValue ?? normalizedValue)?.replace(/\s+/g, '') ?? null;
    const nameFromSegment = ocrSegment.replace(/住所.*/s, '').replace(/注册资本.*/s, '').trim()
      .match(/^[\u4e00-\u9fff·]{2,4}/)?.[0]
      || ocrSegment.replace(/\s+/g, '');
    if (rawNorm && rawNorm === nameFromSegment.replace(/\s+/g, '')) return true;
  }

  return false;
}

function fieldsEquivalent(field: FieldKey, expected: string | null, actual: string | null): boolean {
  if (expected === actual) return true;
  if (field === 'businessTerm' && expected?.includes('长期') && actual === '长期') {
    return true;
  }
  return false;
}

export function compareField(
  field: FieldKey,
  expected: string | null | undefined,
  actual: FieldInput | null | undefined,
  ocrSegment: string | null | undefined = null,
): FieldComparison {
  const rawValue = actual?.rawValue ?? actual?.raw ?? null;
  const normalizedValue = actual?.normalizedValue ?? actual?.value ?? null;
  const exp = normalizeCompareValue(field, expected);
  const act = normalizeCompareValue(field, normalizedValue);
  const businessMatch = fieldsEquivalent(field, exp, act);
  const extractionMatch = extractionEquivalent(field, normalizedValue, rawValue, ocrSegment);

  return {
    field,
    expected: exp,
    actual: act,
    ocrSegment: ocrSegment?.trim() || null,
    rawValue,
    normalizedValue,
    businessMatch,
    extractionMatch,
    exactMatch: businessMatch,
    confidence: actual?.confidence ?? 0,
    requiresReview: actual?.requiresReview ?? false,
  };
}

export function compareDocument(
  documentId: string,
  style: string,
  expected: Record<string, string | null | undefined>,
  actual: Record<string, FieldInput | null | undefined>,
  meta: {
    ocrText?: string;
    extractionTimeMs?: number;
    ocrTimeMs?: number;
    ocrSegments?: Record<string, string | null | undefined>;
  } = {},
): DocumentComparison {
  const fields = FIELD_KEYS.map((field) =>
    compareField(
      field,
      expected[field],
      actual[field],
      meta.ocrSegments?.[field] ?? null,
    ),
  );
  const businessMatches = fields.filter((f) => f.businessMatch).length;
  const extractionMatches = fields.filter((f) => f.extractionMatch).length;
  return {
    documentId,
    style,
    fields,
    exactMatches: businessMatches,
    businessMatches,
    extractionMatches,
    fieldTotal: FIELD_KEYS.length,
    ocrText: meta.ocrText,
    extractionTimeMs: meta.extractionTimeMs,
    ocrTimeMs: meta.ocrTimeMs,
  };
}

function aggregateFieldMetrics(
  comparisons: DocumentComparison[],
  pickMatch: (f: FieldComparison) => boolean,
): Record<FieldKey, { tp: number; fp: number; fn: number; tn: number; matches: number; total: number }> {
  const perField = Object.fromEntries(
    FIELD_KEYS.map((f) => [f, { tp: 0, fp: 0, fn: 0, tn: 0, matches: 0, total: 0 }]),
  ) as Record<FieldKey, { tp: number; fp: number; fn: number; tn: number; matches: number; total: number }>;

  for (const doc of comparisons) {
    for (const f of doc.fields) {
      const m = perField[f.field];
      m.total += 1;
      const expPresent = f.expected != null;
      const actPresent = f.actual != null;
      const matched = pickMatch(f);

      if (matched) {
        m.tp += 1;
        m.matches += 1;
      } else if (expPresent && actPresent) {
        m.fp += 1;
        m.fn += 1;
      } else if (expPresent && !actPresent) {
        m.fn += 1;
      } else if (!expPresent && actPresent) {
        m.fp += 1;
      } else {
        m.tn += 1;
      }
    }
  }

  return perField;
}

export function aggregateMetrics(comparisons: DocumentComparison[]): AggregateMetrics {
  const businessAgg = aggregateFieldMetrics(comparisons, (f) => f.businessMatch);
  const extractionAgg = aggregateFieldMetrics(comparisons, (f) => f.extractionMatch);

  const perField: Record<FieldKey, FieldMetrics> = Object.fromEntries(
    FIELD_KEYS.map((f) => [f, {
      field: f,
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      exactMatchRate: 0,
      businessMatchRate: 0,
      extractionMatchRate: 0,
      total: 0,
    }]),
  ) as Record<FieldKey, FieldMetrics>;

  const perStyle: Record<string, { business: number; extraction: number; total: number; documents: number }> = {};
  let totalBusiness = 0;
  let totalExtraction = 0;
  let totalFields = 0;
  let reviewCount = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let extractionTimeSum = 0;
  let ocrTimeSum = 0;
  let timingCount = 0;

  for (const doc of comparisons) {
    if (!perStyle[doc.style]) {
      perStyle[doc.style] = { business: 0, extraction: 0, total: 0, documents: 0 };
    }
    perStyle[doc.style].documents += 1;
    perStyle[doc.style].business += doc.businessMatches;
    perStyle[doc.style].extraction += doc.extractionMatches;
    perStyle[doc.style].total += doc.fieldTotal;
    totalBusiness += doc.businessMatches;
    totalExtraction += doc.extractionMatches;
    totalFields += doc.fieldTotal;

    if (doc.extractionTimeMs) {
      extractionTimeSum += doc.extractionTimeMs;
      timingCount += 1;
    }
    if (doc.ocrTimeMs) ocrTimeSum += doc.ocrTimeMs;

    for (const f of doc.fields) {
      confidenceSum += f.confidence;
      confidenceCount += 1;
      if (f.requiresReview) reviewCount += 1;
    }
  }

  for (const field of FIELD_KEYS) {
    const b = businessAgg[field];
    const e = extractionAgg[field];
    const m = perField[field];
    m.tp = b.tp;
    m.fp = b.fp;
    m.fn = b.fn;
    m.tn = b.tn;
    m.total = b.total;
    m.precision = b.tp + b.fp > 0 ? b.tp / (b.tp + b.fp) : 0;
    m.recall = b.tp + b.fn > 0 ? b.tp / (b.tp + b.fn) : 0;
    m.f1 = m.precision + m.recall > 0 ? (2 * m.precision * m.recall) / (m.precision + m.recall) : 0;
    m.businessMatchRate = b.total > 0 ? b.matches / b.total : 0;
    m.extractionMatchRate = e.total > 0 ? e.matches / e.total : 0;
    m.exactMatchRate = m.businessMatchRate;
  }

  const perStyleOut: AggregateMetrics['perStyle'] = {};
  for (const [style, s] of Object.entries(perStyle)) {
    perStyleOut[style] = {
      exactMatchRate: s.total > 0 ? s.business / s.total : 0,
      businessMatchRate: s.total > 0 ? s.business / s.total : 0,
      extractionMatchRate: s.total > 0 ? s.extraction / s.total : 0,
      documents: s.documents,
    };
  }

  return {
    documents: comparisons.length,
    overallExactMatchRate: totalFields > 0 ? totalBusiness / totalFields : 0,
    overallBusinessMatchRate: totalFields > 0 ? totalBusiness / totalFields : 0,
    overallExtractionMatchRate: totalFields > 0 ? totalExtraction / totalFields : 0,
    perField,
    perStyle: perStyleOut,
    reviewTriggerRate: confidenceCount > 0 ? reviewCount / confidenceCount : 0,
    avgConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
    avgExtractionTimeMs: timingCount > 0 ? extractionTimeSum / timingCount : 0,
    avgOcrTimeMs: timingCount > 0 ? ocrTimeSum / timingCount : 0,
  };
}
