/**
 * Run OCR benchmark on generated visa images (real pipeline).
 * Usage:
 *   node tests/visa-image-benchmark.mjs
 *   VISA_IMAGE_LIMIT=20 node tests/visa-image-benchmark.mjs
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'tests/fixtures/visa-groundtruth/manifest.json');
const OUT = path.join(ROOT, 'tests/fixtures/visa-groundtruth/benchmark-results.json');
const REPORT = path.join(ROOT, 'docs/VISA_IMAGE_BENCHMARK.md');

const limit = Number(process.env.VISA_IMAGE_LIMIT || 0) || Infinity;

async function main() {
  const { OCRService } = await import('../src/modules/extraction/shared/OCRService.ts');
  const { evaluateVisaFromImage } = await import('../src/modules/extraction/visa/visaFromText.ts');
  const { terminateOcrWorkers } = await import('../src/modules/extraction/shared/lib/ocr.js');
  const { buildSampleResult, summarizeResults, renderBenchmarkMarkdown } = await import(
    './helpers/visaImageMetrics.ts'
  );

  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  const fixtures = manifest.fixtures.slice(0, limit === Infinity ? undefined : limit);
  const ocr = new OCRService();
  const samples = [];
  const t0 = Date.now();

  console.log(`Benchmarking ${fixtures.length} visa images (real OCR)...`);

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const abs = path.join(ROOT, f.imagePath);
    const buf = await fs.readFile(abs);
    const started = Date.now();
    const result = await evaluateVisaFromImage(buf, ocr);
    const elapsed = Date.now() - started;
    const sample = buildSampleResult(f, result.detectedAsVisa, result.visa, result.rawText, {
      passWinner: result.ocrMeta.passWinner,
      ocrConfidence: result.ocrMeta.ocrConfidence,
      passScores: result.ocrMeta.passScores,
      recoveredFields: result.ocrMeta.recoveredFieldSignals,
      elapsedMs: elapsed,
    });
    samples.push(sample);
    console.log(
      `[${i + 1}/${fixtures.length}] ${f.id} — field ${sample.fieldHits}/${sample.fieldTotal} mrz=${sample.mrzMatch} pass=${sample.ocrPassWinner} (${elapsed}ms)`,
    );

    if ((i + 1) % 5 === 0) {
      await fs.writeFile(OUT, JSON.stringify({ partial: true, samples, updatedAt: new Date().toISOString() }, null, 2));
    }
  }

  const summary = summarizeResults(samples, Date.now() - t0);
  const payload = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    imageLimit: limit === Infinity ? null : limit,
    summary,
    samples,
  };

  await fs.writeFile(OUT, JSON.stringify(payload, null, 2));
  await fs.writeFile(REPORT, renderBenchmarkMarkdown(summary, samples));
  await terminateOcrWorkers();

  console.log('\n=== BENCHMARK COMPLETE ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`Wrote ${REPORT}`);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { terminateOcrWorkers } = await import('../src/modules/extraction/shared/lib/ocr.js');
    await terminateOcrWorkers();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
