/**
 * Chinese Business License extraction benchmark.
 *
 * Modes:
 *   CBL_BENCHMARK_MODE=text   — corrupt ground-truth text, run extraction (default, fast)
 *   CBL_BENCHMARK_MODE=image  — full OCR + extraction pipeline (slow)
 *
 * Usage:
 *   npm run benchmark:chinese-business-license
 *   CBL_BENCHMARK_LIMIT=50 CBL_BENCHMARK_MODE=image npm run benchmark:chinese-business-license
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOCUMENT_STYLES, FIELD_KEYS } from './lib/constants.js';
import { corruptOcrText } from './lib/ocrCorruptor.js';
import { compareDocument, aggregateMetrics, type AggregateMetrics, type DocumentComparison } from './lib/compare.js';
import { buildErrorAnalysis } from './lib/errorAnalysis.js';
import { buildConfidenceCalibration } from './lib/confidenceCalibration.js';
import { evaluatePassFail, renderMarkdownReport } from './lib/report.js';
import { buildAccuracyAttribution, renderDualAccuracyMarkdown } from './lib/dualAccuracyReport.js';
import {
  buildDetailedFailures,
  buildCompanyNameBoundaries,
  buildCreditCodeDiagnostics,
  groupFailuresByBucket,
  summarizeFailureBuckets,
  countFailuresByField,
  type BenchmarkRunContext,
} from './lib/diagnostics.js';
import { rankRootCauses, buildRecommendations } from './lib/rootCauseAnalysis.js';
import { renderDiagnosticsMarkdown } from './lib/diagnosticReport.js';
import type { TruthDocument } from './lib/truth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIXTURES_ROOT = path.join(ROOT, 'testing/chinese-business-license-fixtures');
const MANIFEST_PATH = path.join(FIXTURES_ROOT, 'manifest.json');
const REPORTS_DIR = path.join(ROOT, 'reports');
const RESULTS_PATH = path.join(REPORTS_DIR, 'benchmark-results.json');
const ERROR_PATH = path.join(REPORTS_DIR, 'error-analysis.json');
const CALIBRATION_PATH = path.join(REPORTS_DIR, 'confidence-calibration.json');
const REPORT_PATH = path.join(REPORTS_DIR, 'latest-report.md');
const DETAILED_FAILURES_PATH = path.join(REPORTS_DIR, 'detailed-failures.json');
const FAILURE_CATEGORIES_PATH = path.join(REPORTS_DIR, 'failure-categories.json');
const CREDIT_CANDIDATES_PATH = path.join(REPORTS_DIR, 'credit-code-candidates.json');
const COMPANY_BOUNDARIES_PATH = path.join(REPORTS_DIR, 'company-name-boundaries.json');
const ROOT_CAUSES_PATH = path.join(REPORTS_DIR, 'root-causes.json');
const RECOMMENDATIONS_PATH = path.join(REPORTS_DIR, 'diagnostic-recommendations.json');
const DIAGNOSTICS_REPORT_PATH = path.join(REPORTS_DIR, 'diagnostics-report.md');
const BASELINE_METRICS_PATH = path.join(REPORTS_DIR, 'baseline-metrics.json');
const ACCURACY_COMPARISON_PATH = path.join(REPORTS_DIR, 'accuracy-comparison.md');
const DUAL_ACCURACY_PATH = path.join(REPORTS_DIR, 'dual-accuracy-report.md');

const MODE = process.env.CBL_BENCHMARK_MODE || 'text';
const LIMIT = Number(process.env.CBL_BENCHMARK_LIMIT || 0) || Infinity;
const STYLE_FILTER = process.env.CBL_BENCHMARK_STYLE_FILTER || '';

interface Manifest {
  total: number;
  documents: Array<{
    id: string;
    style: string;
    corruptionLevel: string;
    imagePath: string;
    pdfPath: string;
    truthPath: string;
  }>;
}

interface BenchmarkOutput {
  comparisons: DocumentComparison[];
  contexts: BenchmarkRunContext[];
}

async function loadTruth(relPath: string): Promise<TruthDocument> {
  const raw = await fs.readFile(path.join(ROOT, relPath), 'utf8');
  return JSON.parse(raw) as TruthDocument;
}

async function runTextBenchmark(docs: Manifest['documents']): Promise<BenchmarkOutput> {
  const { extractChineseBusinessLicenseFields } = await import(
    '../../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js'
  );
  const { extractByLabelSegments } = await import(
    '../../src/modules/extraction/chinese-business-license/chineseLabelSegmentExtract.js'
  );
  const { normalizeChineseOcrText } = await import(
    '../../src/modules/extraction/chinese-business-license/chineseOcrNormalize.js'
  );

  const comparisons: DocumentComparison[] = [];
  const contexts: BenchmarkRunContext[] = [];

  for (const doc of docs) {
    const truth = await loadTruth(doc.truthPath);
    const styleMeta = DOCUMENT_STYLES.find((s) => s.id === doc.style);
    const level = styleMeta?.corruptionLevel || 'medium';
    const corrupted =
      level === 'none'
        ? { text: truth.licenseText, operations: [] as string[] }
        : corruptOcrText(truth.licenseText, level, truth.seed);

    const normalizedText = normalizeChineseOcrText(corrupted.text);
    const segments = extractByLabelSegments(normalizedText);

    const t0 = Date.now();
    const result = await extractChineseBusinessLicenseFields(corrupted.text, 79);
    const extractionTimeMs = Date.now() - t0;

    const actual: Record<string, { value?: string | null; confidence?: number; requiresReview?: boolean }> = {};
    for (const [k, v] of Object.entries(result.fields)) {
      actual[k] = v;
    }

    const ocrSegments = Object.fromEntries(
      Object.entries(segments.segments).map(([k, v]) => [k, v.rawSegment]),
    );

    const comparison = compareDocument(doc.id, doc.style, truth.fields, actual, {
      ocrText: corrupted.text,
      extractionTimeMs,
      ocrTimeMs: 0,
      ocrSegments,
    });

    comparisons.push(comparison);
    contexts.push({
      documentId: doc.id,
      style: doc.style,
      ocrText: corrupted.text,
      extractionDebug: result.extractionDebug,
      segments: Object.fromEntries(
        Object.entries(segments.segments).map(([k, v]) => [
          k,
          { startLabel: v.startLabel, nextLabel: v.nextLabel, rawSegment: v.rawSegment },
        ]),
      ),
      expected: truth.fields,
    });
  }

  return { comparisons, contexts };
}

async function runImageBenchmark(docs: Manifest['documents']): Promise<BenchmarkOutput> {
  const { OCRService } = await import('../../src/modules/extraction/shared/OCRService.js');
  const { ChineseBusinessLicenseExtractor } = await import(
    '../../src/modules/extraction/chinese-business-license/ChineseBusinessLicenseExtractor.js'
  );
  const { extractByLabelSegments } = await import(
    '../../src/modules/extraction/chinese-business-license/chineseLabelSegmentExtract.js'
  );
  const { terminateOcrWorkers } = await import('../../src/modules/extraction/shared/lib/ocr.js');

  const ocr = new OCRService();
  const extractor = new ChineseBusinessLicenseExtractor(ocr);
  const comparisons: DocumentComparison[] = [];
  const contexts: BenchmarkRunContext[] = [];

  for (const doc of docs) {
    const truth = await loadTruth(doc.truthPath);
    const pdfBuf = await fs.readFile(path.join(ROOT, doc.pdfPath));

    const ocrT0 = Date.now();
    const result = await extractor.extract(pdfBuf, { mimeType: 'application/pdf', saveOutput: false });
    const totalMs = Date.now() - ocrT0;

    const ocrText = result.ocrDebug?.rawChineseText || '';
    const segments = extractByLabelSegments(ocrText);

    const actual: Record<string, { value?: string | null; confidence?: number; requiresReview?: boolean }> = {};
    for (const [k, v] of Object.entries(result.fields)) {
      actual[k] = v;
    }

    const ocrSegments = Object.fromEntries(
      Object.entries(segments.segments).map(([k, v]) => [k, v.rawSegment]),
    );

    comparisons.push(
      compareDocument(doc.id, doc.style, truth.fields, actual, {
        ocrText,
        extractionTimeMs: totalMs,
        ocrTimeMs: totalMs,
        ocrSegments,
      }),
    );

    contexts.push({
      documentId: doc.id,
      style: doc.style,
      ocrText,
      extractionDebug: result.extractionDebug,
      segments: Object.fromEntries(
        Object.entries(segments.segments).map(([k, v]) => [
          k,
          { startLabel: v.startLabel, nextLabel: v.nextLabel, rawSegment: v.rawSegment },
        ]),
      ),
      expected: truth.fields,
    });
  }

  await terminateOcrWorkers();
  return { comparisons, contexts };
}

interface BaselineMetrics {
  overallExactMatchRate: number;
  perField: Record<string, number>;
}

async function writeAccuracyComparison(metrics: AggregateMetrics, attribution: ReturnType<typeof buildAccuracyAttribution>) {
  let baseline: BaselineMetrics = { overallExactMatchRate: 0.755, perField: {} };
  try {
    const raw = JSON.parse(await fs.readFile(BASELINE_METRICS_PATH, 'utf8')) as BaselineMetrics & { perField?: Record<string, number> };
    baseline = {
      overallExactMatchRate: raw.overallExactMatchRate,
      perField: raw.perField || {},
    };
  } catch {
    // use hardcoded pre-fix baseline
  }

  const beforeBusiness = baseline.overallExactMatchRate * 100;
  const afterBusiness = metrics.overallBusinessMatchRate * 100;
  const afterExtraction = metrics.overallExtractionMatchRate * 100;
  const businessDelta = afterBusiness - beforeBusiness;

  const fieldRows = FIELD_KEYS.map((field) => {
    const beforeRate = (baseline.perField[field] ?? 0) * 100;
    const extractionRate = (metrics.perField[field]?.extractionMatchRate ?? 0) * 100;
    const businessRate = (metrics.perField[field]?.businessMatchRate ?? 0) * 100;
    const fieldDelta = businessRate - beforeRate;
    const sign = fieldDelta >= 0 ? '+' : '';
    return `| ${field} | ${beforeRate.toFixed(1)}% | ${extractionRate.toFixed(1)}% | ${businessRate.toFixed(1)}% | ${sign}${fieldDelta.toFixed(1)}% |`;
  });

  const md = [
    '# Accuracy Comparison',
    '',
    '## Overall',
    '',
    '| Metric | Before (business) | After extraction | After business | Delta |',
    '| --- | --- | --- | --- | --- |',
    `| Overall | ${beforeBusiness.toFixed(1)}% | ${afterExtraction.toFixed(1)}% | ${afterBusiness.toFixed(1)}% | ${businessDelta >= 0 ? '+' : ''}${businessDelta.toFixed(1)}% |`,
    '',
    `OCR-attributed loss: ${(attribution.ocrAttributedLossRate * 100).toFixed(1)}% of fields`,
    `Extraction-attributed loss: ${(attribution.extractionAttributedLossRate * 100).toFixed(1)}% of fields`,
    '',
    '## Per-field (business baseline vs dual after)',
    '',
    '| Field | Before business | After extraction | After business | Delta |',
    '| --- | --- | --- | --- | --- |',
    ...fieldRows,
    '',
    `_Generated ${new Date().toISOString()}_`,
  ].join('\n');

  await fs.writeFile(ACCURACY_COMPARISON_PATH, md);
}

async function writeDiagnostics(
  comparisons: DocumentComparison[],
  contexts: BenchmarkRunContext[],
  metrics: ReturnType<typeof aggregateMetrics>,
) {
  const detailedFailures = comparisons.flatMap((c) => {
    const ctx = contexts.find((x) => x.documentId === c.documentId)!;
    return buildDetailedFailures(c, ctx);
  });

  const grouped = groupFailuresByBucket(detailedFailures);
  const bucketCounts = summarizeFailureBuckets(detailedFailures);
  const rootCauses = rankRootCauses(detailedFailures);
  const recommendations = buildRecommendations(rootCauses);
  const companyBoundaries = buildCompanyNameBoundaries(contexts, comparisons);
  const creditDiagnostics = buildCreditCodeDiagnostics(contexts);

  const failedCreditOnly = creditDiagnostics.filter((d) => {
    const comp = comparisons.find((c) => c.documentId === d.documentId);
    const field = comp?.fields.find((f) => f.field === 'creditCode');
    return field && !field.exactMatch;
  });

  await fs.writeFile(DETAILED_FAILURES_PATH, JSON.stringify({
    totalFailures: detailedFailures.length,
    byField: countFailuresByField(detailedFailures),
    byBucket: bucketCounts,
    failures: detailedFailures,
  }, null, 2));

  await fs.writeFile(FAILURE_CATEGORIES_PATH, JSON.stringify({
    ocr_failures: grouped.ocr_failure,
    segmentation_failures: grouped.segmentation_failure,
    validation_failures: grouped.validation_failure,
    confidence_failures: grouped.confidence_failure,
    counts: bucketCounts,
  }, null, 2));

  await fs.writeFile(CREDIT_CANDIDATES_PATH, JSON.stringify({
    documents: creditDiagnostics.length,
    failedDocuments: failedCreditOnly,
    all: creditDiagnostics,
  }, null, 2));

  await fs.writeFile(COMPANY_BOUNDARIES_PATH, JSON.stringify({
    documents: companyBoundaries.length,
    failures: companyBoundaries.filter((b) => !b.exactMatch),
    all: companyBoundaries,
  }, null, 2));

  await fs.writeFile(ROOT_CAUSES_PATH, JSON.stringify({ rootCauses }, null, 2));
  await fs.writeFile(RECOMMENDATIONS_PATH, JSON.stringify({ recommendations }, null, 2));
  await fs.writeFile(
    DIAGNOSTICS_REPORT_PATH,
    renderDiagnosticsMarkdown(metrics, detailedFailures, bucketCounts, rootCauses, recommendations),
  );
}

async function main() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  let manifest: Manifest;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch {
    console.error('Manifest not found. Run: npm run generate:chinese-business-license');
    process.exit(1);
  }

  let docs = manifest.documents;
  if (STYLE_FILTER) docs = docs.filter((d) => d.style === STYLE_FILTER);
  docs = docs.slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`Benchmarking ${docs.length} documents (mode=${MODE})...`);

  const t0 = Date.now();
  const { comparisons, contexts } =
    MODE === 'image' ? await runImageBenchmark(docs) : await runTextBenchmark(docs);
  const durationMs = Date.now() - t0;

  const metrics = aggregateMetrics(comparisons);
  const attribution = buildAccuracyAttribution(comparisons);
  const { failures, grouped } = buildErrorAnalysis(comparisons);
  const calibration = buildConfidenceCalibration(comparisons);
  const passFail = evaluatePassFail(metrics);
  const reportMd = renderMarkdownReport(metrics, calibration, attribution, grouped, passFail, durationMs, MODE);

  await writeDiagnostics(comparisons, contexts, metrics);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    durationMs,
    documentCount: comparisons.length,
    passFail,
    metrics,
    attribution,
    calibration: {
      buckets: calibration.buckets,
      reviewTriggerRate: metrics.reviewTriggerRate,
      highConfidenceBusinessAccuracy: calibration.highConfidenceBusinessAccuracy,
      highConfidenceExtractionAccuracy: calibration.highConfidenceExtractionAccuracy,
    },
    comparisons,
  };

  await fs.writeFile(RESULTS_PATH, JSON.stringify(payload, null, 2));
  await fs.writeFile(ERROR_PATH, JSON.stringify({ failures, grouped }, null, 2));
  await fs.writeFile(CALIBRATION_PATH, JSON.stringify(calibration, null, 2));
  await fs.writeFile(REPORT_PATH, reportMd);
  await fs.writeFile(DUAL_ACCURACY_PATH, renderDualAccuracyMarkdown(attribution));
  await writeAccuracyComparison(metrics, attribution);

  console.log('\n=== BENCHMARK COMPLETE ===');
  console.log(`Extraction accuracy: ${(metrics.overallExtractionMatchRate * 100).toFixed(1)}%`);
  console.log(`Business accuracy: ${(metrics.overallBusinessMatchRate * 100).toFixed(1)}%`);
  console.log(`Review trigger rate: ${(metrics.reviewTriggerRate * 100).toFixed(1)}%`);
  console.log(`Pass: ${passFail.passed ? 'YES' : 'NO'}`);
  if (!passFail.passed) console.log('Failures:', passFail.failures.join('; '));
  console.log(`\nWrote ${REPORT_PATH}`);
  console.log(`Wrote ${DIAGNOSTICS_REPORT_PATH}`);

  if (process.env.CBL_BENCHMARK_STRICT === '1' && !passFail.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
