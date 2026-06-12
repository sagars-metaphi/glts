/**
 * Image-based visa OCR regression (real OCR pipeline, no mocks).
 *
 * Env:
 *   VISA_IMAGE_LIMIT=20     — cap images processed (default: 20 for CI)
 *   VISA_IMAGE_FULL=1       — process all 200 fixtures
 *   VISA_IMAGE_USE_CACHE=1  — skip OCR if benchmark-results.json is fresh
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { OCRService } from '../src/modules/extraction/shared/OCRService.js';
import { evaluateVisaFromImage } from '../src/modules/extraction/visa/visaFromText.js';
import { terminateOcrWorkers } from '../src/modules/extraction/shared/lib/ocr.js';
import {
  buildSampleResult,
  summarizeResults,
  renderBenchmarkMarkdown,
  type SampleResult,
} from './helpers/visaImageMetrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'tests/fixtures/visa-groundtruth/manifest.json');
const CACHE_PATH = path.join(ROOT, 'tests/fixtures/visa-groundtruth/benchmark-results.json');
const REPORT_PATH = path.join(ROOT, 'docs/VISA_IMAGE_BENCHMARK.md');

interface ManifestFixture {
  id: string;
  country: string;
  variant: string;
  degradation: string;
  imagePath: string;
  groundTruth: Record<string, unknown>;
}

function resolveLimit(total: number): number {
  if (process.env.VISA_IMAGE_FULL === '1') return total;
  const n = Number(process.env.VISA_IMAGE_LIMIT || 20);
  return Math.min(n, total);
}

/** Representative subset: clean scan per country + key degradations */
function pickRegressionSet(fixtures: ManifestFixture[]): ManifestFixture[] {
  if (process.env.VISA_IMAGE_FULL === '1') return fixtures;
  const byCountry = new Map<string, ManifestFixture[]>();
  for (const f of fixtures) {
    if (!byCountry.has(f.country)) byCountry.set(f.country, []);
    byCountry.get(f.country)!.push(f);
  }
  const picked: ManifestFixture[] = [];
  const want = ['01_clean', '04_gaussian_blur', '10_glare', '18_invalid_mrz', '19_missing_mrz'];
  for (const [, list] of byCountry) {
    for (const v of want) {
      const m = list.find((x) => x.variant === v);
      if (m) picked.push(m);
    }
  }
  return picked.length > 0 ? picked.slice(0, resolveLimit(fixtures.length)) : fixtures.slice(0, resolveLimit(fixtures.length));
}

test('visa image manifest has 200+ fixtures', async () => {
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw) as { total: number; fixtures: ManifestFixture[] };
  assert.ok(manifest.total >= 200, `expected 200+ fixtures, got ${manifest.total}`);
  assert.equal(manifest.fixtures.length, manifest.total);
});

test(
  'visa image OCR regression benchmark',
  { timeout: 3_600_000 },
  async () => {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    const manifest = JSON.parse(raw) as { fixtures: ManifestFixture[] };
    const fixtures = pickRegressionSet(manifest.fixtures);

    let samples: SampleResult[] = [];

    if (process.env.VISA_IMAGE_USE_CACHE === '1') {
      try {
        const cached = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')) as { samples: SampleResult[] };
        samples = cached.samples;
        console.log(`\n[visa-image] Using cached benchmark (${samples.length} samples)`);
      } catch {
        /* run live */
      }
    }

    if (!samples.length) {
      const ocr = new OCRService();
      console.log(`\n[visa-image] Running OCR on ${fixtures.length} images...`);
      for (let i = 0; i < fixtures.length; i++) {
        const f = fixtures[i];
        const buf = await fs.readFile(path.join(ROOT, f.imagePath));
        const result = await evaluateVisaFromImage(buf, ocr);
        samples.push(
          buildSampleResult(f, result.detectedAsVisa, result.visa, result.rawText, {
            passWinner: result.ocrMeta.passWinner,
            ocrConfidence: result.ocrMeta.ocrConfidence,
            passScores: result.ocrMeta.passScores,
            recoveredFields: result.ocrMeta.recoveredFieldSignals,
          }),
        );
        if ((i + 1) % 5 === 0) console.log(`  processed ${i + 1}/${fixtures.length}`);
      }
      await terminateOcrWorkers();
    }

    const summary = summarizeResults(samples);
    await fs.writeFile(REPORT_PATH, renderBenchmarkMarkdown(summary, samples));

    console.log('\n=== VISA IMAGE BENCHMARK ===');
    console.log(JSON.stringify(summary, null, 2));

    assert.ok(summary.totalSamples >= 10, 'need at least 10 benchmark samples');
    assert.ok(summary.fieldAccuracy >= 0.25, `field accuracy ${summary.fieldAccuracy} below 25% floor`);
    assert.ok(summary.ocrCharAccuracy >= 0.2, `OCR char accuracy ${summary.ocrCharAccuracy} below 20% floor`);
    assert.equal(summary.falsePositiveRate, 0, 'visa images must not be false positives');

    if (samples.length >= 200) {
      const cropAcc = summary.byDegradation.partial_crop?.fieldAccuracy ?? 0;
      const missingAcc = summary.byDegradation.content_missing_mrz?.fieldAccuracy ?? 0;
      assert.ok(cropAcc >= 0.7, `partial_crop field accuracy ${(cropAcc * 100).toFixed(1)}% below 70%`);
      assert.ok(missingAcc >= 0.75, `missing_mrz field accuracy ${(missingAcc * 100).toFixed(1)}% below 75%`);
      const blurAcc = summary.byDegradation.gaussian_blur?.fieldAccuracy ?? 0;
      assert.ok(blurAcc >= 0.6, `gaussian_blur field accuracy ${(blurAcc * 100).toFixed(1)}% below 60%`);
      assert.ok(summary.falseNegativeRate <= 0.02, `false negative rate ${summary.falseNegativeRate} above 2%`);
    } else {
      assert.ok(summary.falseNegativeRate <= 0.15, `false negative rate ${summary.falseNegativeRate} above 15%`);
    }

    const undetected = samples.filter((s) => s.falseNegative);
    if (undetected.length) {
      console.log('False negatives:', undetected.map((s) => s.id).join(', '));
    }
  },
);

test.after(async () => {
  await terminateOcrWorkers();
});
