import type { AggregateMetrics } from './compare.js';
import type { DetailedFailureRecord, FailureBucket } from './diagnostics.js';
import type { RankedRootCause } from './rootCauseAnalysis.js';
import { FIELD_KEYS } from './constants.js';

export function renderDiagnosticsMarkdown(
  metrics: AggregateMetrics,
  failures: DetailedFailureRecord[],
  bucketCounts: Record<FailureBucket, number>,
  rootCauses: RankedRootCause[],
  recommendations: Array<{ priority: number; recommendation: string; impact: number }>,
): string {
  const lines = [
    '# Chinese Business License Diagnostic Report',
    '',
    `Overall accuracy: **${(metrics.overallExactMatchRate * 100).toFixed(1)}%**`,
    `Total field failures: **${failures.length}**`,
    '',
    '## Why accuracy is below target',
    '',
    `At ${(metrics.overallExactMatchRate * 100).toFixed(1)}% overall, the benchmark corpus mixes clean (style-a) and degraded OCR styles.`,
    'Failures cluster around OCR label corruption, credit-code punctuation, and boundary segmentation — not clean-document extraction.',
    '',
    '### Per-field exact match',
    '',
    '| Field | Accuracy | Failures |',
    '|-------|----------|----------|',
  ];

  const fieldFailCounts = Object.fromEntries(FIELD_KEYS.map((f) => [f, 0]));
  for (const f of failures) fieldFailCounts[f.field] += 1;

  for (const field of FIELD_KEYS) {
    const acc = metrics.perField[field]?.exactMatchRate ?? 0;
    lines.push(`| ${field} | ${(acc * 100).toFixed(1)}% | ${fieldFailCounts[field]} |`);
  }

  lines.push('', '## Failure buckets', '');
  for (const [bucket, count] of Object.entries(bucketCounts)) {
    lines.push(`- **${bucket}**: ${count}`);
  }

  lines.push('', '## Ranked root causes', '');
  for (const c of rootCauses.slice(0, 10)) {
    lines.push(
      `### Root Cause #${c.rank}: ${c.label}`,
      `Impact: **${c.impact}** failures`,
      `Fields: ${c.affectedFields.join(', ') || 'n/a'}`,
      `Examples: ${c.exampleDocumentIds.join(', ')}`,
      '',
      c.description,
      '',
    );
  }

  lines.push('## Prioritized recommendations', '');
  for (const r of recommendations.slice(0, 8)) {
    lines.push(`${r.priority}. (${r.impact} failures) ${r.recommendation}`);
  }

  lines.push(
    '',
    '## Output files',
    '- `reports/detailed-failures.json`',
    '- `reports/failure-categories.json`',
    '- `reports/credit-code-candidates.json`',
    '- `reports/company-name-boundaries.json`',
    '- `reports/root-causes.json`',
    '- `reports/diagnostic-recommendations.json`',
  );

  return lines.join('\n');
}
