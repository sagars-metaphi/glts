import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await fs.readFile(path.join(ROOT, 'tests/fixtures/visa-groundtruth/manifest.json'), 'utf8'),
);
const fixtures = manifest.fixtures.filter((f) => f.degradation === 'gaussian_blur');

const { OCRService } = await import('../src/modules/extraction/shared/OCRService.ts');
const { evaluateVisaFromImage } = await import('../src/modules/extraction/visa/visaFromText.ts');
const { terminateOcrWorkers } = await import('../src/modules/extraction/shared/lib/ocr.js');
const { buildSampleResult, summarizeResults } = await import('../tests/helpers/visaImageMetrics.ts');

const ocr = new OCRService();
const samples = [];
const t0 = Date.now();

for (const f of fixtures) {
  const buf = await fs.readFile(path.join(ROOT, f.imagePath));
  const started = Date.now();
  const result = await evaluateVisaFromImage(buf, ocr);
  const sample = buildSampleResult(f, result.detectedAsVisa, result.visa, result.rawText, {
    passWinner: result.ocrMeta.passWinner,
    ocrConfidence: result.ocrMeta.ocrConfidence,
    passScores: result.ocrMeta.passScores,
    recoveredFields: result.ocrMeta.recoveredFieldSignals,
    elapsedMs: Date.now() - started,
  });
  samples.push(sample);
  console.log(
    `${f.id} ${sample.fieldHits}/${sample.fieldTotal} detected=${sample.detectedAsVisa} pass=${sample.ocrPassWinner} ${Date.now() - started}ms`,
  );
}

console.log(JSON.stringify(summarizeResults(samples, Date.now() - t0), null, 2));
await terminateOcrWorkers();
