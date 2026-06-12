import type { DocumentComparison } from './compare.js';
import type { FieldKey } from './constants.js';

export type FailureCategory =
  | 'ocr_issue'
  | 'segmentation_issue'
  | 'validation_issue'
  | 'confusion_resolver_issue'
  | 'unknown';

export interface FailureRecord {
  documentId: string;
  style: string;
  field: FieldKey;
  expected: string | null;
  actual: string | null;
  confidence: number;
  ocrText: string;
  category: FailureCategory;
}

function classifyFailure(
  field: FieldKey,
  expected: string | null,
  actual: string | null,
  ocrText: string,
): FailureCategory {
  if (!actual && expected) {
    if (!ocrText.includes(expected.slice(0, Math.min(4, expected.length)))) {
      return 'ocr_issue';
    }
    return 'segmentation_issue';
  }

  if (actual && expected && actual !== expected) {
    if (field === 'creditCode') return 'validation_issue';
    if (field === 'companyType' || field === 'legalRepresentative' || field === 'registeredCapital') {
      return 'confusion_resolver_issue';
    }
    if (field === 'companyName') return 'ocr_issue';
    if (field === 'address' || field === 'businessScope') return 'ocr_issue';
  }

  return 'unknown';
}

export function buildErrorAnalysis(comparisons: DocumentComparison[]): {
  failures: FailureRecord[];
  grouped: Record<FailureCategory, number>;
} {
  const failures: FailureRecord[] = [];
  const grouped: Record<FailureCategory, number> = {
    ocr_issue: 0,
    segmentation_issue: 0,
    validation_issue: 0,
    confusion_resolver_issue: 0,
    unknown: 0,
  };

  for (const doc of comparisons) {
    for (const f of doc.fields) {
      if (f.exactMatch) continue;
      const category = classifyFailure(f.field, f.expected, f.actual, doc.ocrText || '');
      grouped[category] += 1;
      failures.push({
        documentId: doc.documentId,
        style: doc.style,
        field: f.field,
        expected: f.expected,
        actual: f.actual,
        confidence: f.confidence,
        ocrText: (doc.ocrText || '').slice(0, 500),
        category,
      });
    }
  }

  return { failures, grouped };
}
