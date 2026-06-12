import type { DocumentComparison } from './compare.js';
import { FIELD_KEYS, type FieldKey } from './constants.js';

export interface AccuracyAttribution {
  totalFields: number;
  businessMatches: number;
  extractionMatches: number;
  businessAccuracy: number;
  extractionAccuracy: number;
  /** Business failures where extraction matched OCR segment (OCR corruption). */
  ocrAttributedFailures: number;
  /** Failures where extraction did not match OCR segment (logic/segmentation). */
  extractionAttributedFailures: number;
  ocrAttributedLossRate: number;
  extractionAttributedLossRate: number;
  perField: Record<FieldKey, {
    businessAccuracy: number;
    extractionAccuracy: number;
    ocrAttributedFailures: number;
    extractionAttributedFailures: number;
  }>;
}

export function buildAccuracyAttribution(comparisons: DocumentComparison[]): AccuracyAttribution {
  const perField: AccuracyAttribution['perField'] = Object.fromEntries(
    FIELD_KEYS.map((f) => [
      f,
      {
        businessAccuracy: 0,
        extractionAccuracy: 0,
        ocrAttributedFailures: 0,
        extractionAttributedFailures: 0,
      },
    ]),
  ) as AccuracyAttribution['perField'];

  const fieldTotals: Record<FieldKey, number> = Object.fromEntries(
    FIELD_KEYS.map((f) => [f, 0]),
  ) as Record<FieldKey, number>;
  const fieldBusiness: Record<FieldKey, number> = { ...fieldTotals };
  const fieldExtraction: Record<FieldKey, number> = { ...fieldTotals };

  let totalFields = 0;
  let businessMatches = 0;
  let extractionMatches = 0;
  let ocrAttributedFailures = 0;
  let extractionAttributedFailures = 0;

  for (const doc of comparisons) {
    for (const f of doc.fields) {
      totalFields += 1;
      fieldTotals[f.field] += 1;
      if (f.businessMatch) {
        businessMatches += 1;
        fieldBusiness[f.field] += 1;
      }
      if (f.extractionMatch) {
        extractionMatches += 1;
        fieldExtraction[f.field] += 1;
      }
      if (!f.businessMatch && f.extractionMatch) {
        ocrAttributedFailures += 1;
        perField[f.field].ocrAttributedFailures += 1;
      }
      if (!f.extractionMatch) {
        extractionAttributedFailures += 1;
        perField[f.field].extractionAttributedFailures += 1;
      }
    }
  }

  for (const field of FIELD_KEYS) {
    const total = fieldTotals[field];
    perField[field].businessAccuracy = total > 0 ? fieldBusiness[field] / total : 0;
    perField[field].extractionAccuracy = total > 0 ? fieldExtraction[field] / total : 0;
  }

  return {
    totalFields,
    businessMatches,
    extractionMatches,
    businessAccuracy: totalFields > 0 ? businessMatches / totalFields : 0,
    extractionAccuracy: totalFields > 0 ? extractionMatches / totalFields : 0,
    ocrAttributedFailures,
    extractionAttributedFailures,
    ocrAttributedLossRate: totalFields > 0 ? ocrAttributedFailures / totalFields : 0,
    extractionAttributedLossRate: totalFields > 0 ? extractionAttributedFailures / totalFields : 0,
    perField,
  };
}

export function renderDualAccuracyMarkdown(attribution: AccuracyAttribution): string {
  const lines = [
    '# Dual Accuracy Report',
    '',
    'Separates **OCR fidelity** (extraction vs OCR segment) from **business truth** (extraction vs ground truth).',
    '',
    '## Summary',
    '',
    `| Metric | Accuracy |`,
    `| --- | --- |`,
    `| OCR Extraction Accuracy | ${(attribution.extractionAccuracy * 100).toFixed(1)}% |`,
    `| Business Accuracy | ${(attribution.businessAccuracy * 100).toFixed(1)}% |`,
  ];

  const accuracyGap = attribution.businessAccuracy - attribution.extractionAccuracy;
  lines.push(
    '',
    '## Accuracy Loss Attribution',
    '',
    `| Source | Failures | Share of fields |`,
    `| --- | --- | --- |`,
    `| OCR corruption (extraction OK, business wrong) | ${attribution.ocrAttributedFailures} | ${(attribution.ocrAttributedLossRate * 100).toFixed(1)}% |`,
    `| Extraction logic (extraction ≠ OCR segment) | ${attribution.extractionAttributedFailures} | ${(attribution.extractionAttributedLossRate * 100).toFixed(1)}% |`,
    '',
    `Business accuracy is ${Math.abs(accuracyGap * 100).toFixed(1)}pp ${accuracyGap < 0 ? 'below' : 'above'} extraction accuracy.`,
    accuracyGap < 0
      ? 'When business accuracy is lower, OCR-attributed failures dominate (extracted text matches OCR but not ground truth).'
      : 'When business accuracy is higher, normalization/confusion resolution improves truth match without changing OCR fidelity measurement.',
    '',
    '## Per-field',
    '',
    '| Field | Extraction | Business | OCR-attributed fails | Extraction-attributed fails |',
    '| --- | --- | --- | --- | --- |',
  );

  for (const field of FIELD_KEYS) {
    const p = attribution.perField[field];
    lines.push(
      `| ${field} | ${(p.extractionAccuracy * 100).toFixed(1)}% | ${(p.businessAccuracy * 100).toFixed(1)}% | ${p.ocrAttributedFailures} | ${p.extractionAttributedFailures} |`,
    );
  }

  lines.push('', `_Generated ${new Date().toISOString()}_`);
  return lines.join('\n');
}
