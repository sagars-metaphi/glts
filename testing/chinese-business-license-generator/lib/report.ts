import type { AggregateMetrics } from './compare.js';
import type { AccuracyAttribution } from './dualAccuracyReport.js';
import type { ConfidenceCalibrationReport } from './confidenceCalibration.js';
import { FIELD_KEYS, PASS_THRESHOLDS } from './constants.js';

export interface PassFailResult {
  passed: boolean;
  failures: string[];
}

export function evaluatePassFail(metrics: AggregateMetrics): PassFailResult {
  const failures: string[] = [];
  const credit = metrics.perField.creditCode?.businessMatchRate ?? 0;
  const companyExtraction = metrics.perField.companyName?.extractionMatchRate ?? 0;
  const legal = metrics.perField.legalRepresentative?.businessMatchRate ?? 0;
  const overallExtraction = metrics.overallExtractionMatchRate;

  if (credit < PASS_THRESHOLDS.creditCode) {
    failures.push(`creditCode business accuracy ${(credit * 100).toFixed(1)}% < ${PASS_THRESHOLDS.creditCode * 100}%`);
  }
  if (companyExtraction < PASS_THRESHOLDS.companyName) {
    failures.push(`companyName extraction accuracy ${(companyExtraction * 100).toFixed(1)}% < ${PASS_THRESHOLDS.companyName * 100}%`);
  }
  if (legal < PASS_THRESHOLDS.legalRepresentative) {
    failures.push(`legalRepresentative business accuracy ${(legal * 100).toFixed(1)}% < ${PASS_THRESHOLDS.legalRepresentative * 100}%`);
  }
  if (overallExtraction < PASS_THRESHOLDS.overall) {
    failures.push(`overall extraction accuracy ${(overallExtraction * 100).toFixed(1)}% < ${PASS_THRESHOLDS.overall * 100}%`);
  }

  return { passed: failures.length === 0, failures };
}

export function renderMarkdownReport(
  metrics: AggregateMetrics,
  calibration: ConfidenceCalibrationReport,
  attribution: AccuracyAttribution,
  errorGrouped: Record<string, number>,
  passFail: PassFailResult,
  durationMs: number,
  mode: string,
): string {
  const lines: string[] = [
    '# Chinese Business License Benchmark Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${mode}`,
    `Duration: ${(durationMs / 1000).toFixed(1)}s`,
    `Documents: ${metrics.documents}`,
    '',
    '## Dual Accuracy',
    '',
    `| Metric | Accuracy |`,
    `| --- | --- |`,
    `| OCR Extraction Accuracy | ${(metrics.overallExtractionMatchRate * 100).toFixed(1)}% |`,
    `| Business Accuracy | ${(metrics.overallBusinessMatchRate * 100).toFixed(1)}% |`,
    '',
    `OCR-attributed failures: ${attribution.ocrAttributedFailures} (${(attribution.ocrAttributedLossRate * 100).toFixed(1)}% of fields)`,
    `Extraction-attributed failures: ${attribution.extractionAttributedFailures} (${(attribution.extractionAttributedLossRate * 100).toFixed(1)}% of fields)`,
    '',
    '### Pass / Fail',
    passFail.passed ? '**PASSED**' : `**FAILED** — ${passFail.failures.join('; ')}`,
    '',
    '### Field Accuracy',
    '',
    '| Field | Extraction | Business | Precision | Recall | F1 |',
    '|-------|------------|----------|-----------|--------|-----|',
  ];

  for (const field of FIELD_KEYS) {
    const m = metrics.perField[field];
    lines.push(
      `| ${field} | ${(m.extractionMatchRate * 100).toFixed(1)}% | ${(m.businessMatchRate * 100).toFixed(1)}% | ${(m.precision * 100).toFixed(1)}% | ${(m.recall * 100).toFixed(1)}% | ${(m.f1 * 100).toFixed(1)}% |`,
    );
  }

  lines.push('', '### Per-Style Extraction Accuracy', '');
  for (const [style, s] of Object.entries(metrics.perStyle).sort()) {
    lines.push(`- **${style}**: ${(s.extractionMatchRate * 100).toFixed(1)}% extraction / ${(s.businessMatchRate * 100).toFixed(1)}% business (${s.documents} docs)`);
  }

  lines.push('', '### Top Failure Types', '');
  for (const [cat, count] of Object.entries(errorGrouped).sort((a, b) => b[1] - a[1])) {
    if (count > 0) lines.push(`- ${cat}: ${count}`);
  }

  lines.push(
    '',
    '### Review & Confidence',
    `- Review trigger rate: ${(metrics.reviewTriggerRate * 100).toFixed(1)}%`,
    `- Average confidence: ${(metrics.avgConfidence * 100).toFixed(1)}%`,
    `- Avg extraction time: ${metrics.avgExtractionTimeMs.toFixed(0)}ms`,
    `- Avg OCR time: ${metrics.avgOcrTimeMs.toFixed(0)}ms`,
    '',
    '### Confidence Calibration (business accuracy)',
    '',
    '| Bucket | Count | Business | Extraction |',
    '|--------|-------|----------|------------|',
  );

  for (const b of calibration.buckets) {
    lines.push(
      `| ${b.label} | ${b.predicted} | ${(b.businessAccuracy * 100).toFixed(1)}% | ${(b.extractionAccuracy * 100).toFixed(1)}% |`,
    );
  }

  if (calibration.highConfidenceBusinessAccuracy != null) {
    lines.push(
      '',
      `High-confidence (>=0.90) business accuracy: ${(calibration.highConfidenceBusinessAccuracy * 100).toFixed(1)}%`,
      `High-confidence (>=0.90) extraction accuracy: ${((calibration.highConfidenceExtractionAccuracy ?? 0) * 100).toFixed(1)}%`,
    );
  }

  if (calibration.notes.length) {
    lines.push('', 'Notes:', ...calibration.notes.map((n) => `- ${n}`));
  }

  return lines.join('\n');
}
