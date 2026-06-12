/**
 * Synthetic Chinese Business License document generator.
 *
 * Usage:
 *   npm run generate:chinese-business-license
 *   CBL_GEN_PER_STYLE=100 npm run generate:chinese-business-license
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOCUMENT_STYLES, DEFAULT_PER_STYLE } from './lib/constants.js';
import { generateTruthDocument } from './lib/truth.js';
import { renderLicensePng, renderIdCardPng } from './lib/renderer.js';
import { applyStyleTransform } from './lib/transforms.js';
import { imagesToPdf } from './lib/pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIXTURES_ROOT = path.join(ROOT, 'testing/chinese-business-license-fixtures');
const MANIFEST_PATH = path.join(FIXTURES_ROOT, 'manifest.json');

const perStyle = Number(process.env.CBL_GEN_PER_STYLE || DEFAULT_PER_STYLE);

interface ManifestDocument {
  id: string;
  style: string;
  styleName: string;
  corruptionLevel: string;
  imagePath: string;
  pdfPath: string;
  truthPath: string;
  seed: number;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const started = Date.now();
  const documents: ManifestDocument[] = [];
  let globalIndex = 0;

  console.log(`Generating ${DOCUMENT_STYLES.length} styles × ${perStyle} documents = ${DOCUMENT_STYLES.length * perStyle} total`);

  for (const style of DOCUMENT_STYLES) {
    const styleDir = path.join(FIXTURES_ROOT, style.id);
    await ensureDir(styleDir);

    for (let i = 1; i <= perStyle; i += 1) {
      globalIndex += 1;
      const sampleId = `sample-${String(i).padStart(3, '0')}`;
      const documentId = `${style.id}-${sampleId}`;
      const seed = globalIndex * 9973 + i * 131;

      const truth = generateTruthDocument(
        documentId,
        style.id,
        style.name,
        style.corruptionLevel,
        seed,
        {
          mixedLanguage: style.degradation === 'mixed_lang',
          includeIdCard: style.degradation === 'multi_page',
        },
      );

      let png = await renderLicensePng(truth.fields, style.degradation === 'mixed_lang');
      png = await applyStyleTransform(png, style.degradation === 'multi_page' ? 'none' : style.degradation);

      const images: Buffer[] = [png];
      if (style.degradation === 'multi_page') {
        const idPng = await renderIdCardPng(truth.fields.legalRepresentative);
        images.push(idPng);
      }

      const pdf = await imagesToPdf(images);
      const imagePath = path.join(styleDir, `${sampleId}.png`);
      const pdfPath = path.join(styleDir, `${sampleId}.pdf`);
      const truthPath = path.join(styleDir, `${sampleId}.truth.json`);

      await fs.writeFile(imagePath, png);
      await fs.writeFile(pdfPath, pdf);
      await fs.writeFile(truthPath, JSON.stringify(truth, null, 2));

      documents.push({
        id: documentId,
        style: style.id,
        styleName: style.name,
        corruptionLevel: style.corruptionLevel,
        imagePath: path.relative(ROOT, imagePath).replace(/\\/g, '/'),
        pdfPath: path.relative(ROOT, pdfPath).replace(/\\/g, '/'),
        truthPath: path.relative(ROOT, truthPath).replace(/\\/g, '/'),
        seed,
      });

      if (globalIndex % 25 === 0) {
        console.log(`  generated ${globalIndex} documents...`);
      }
    }
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    perStyle,
    styles: DOCUMENT_STYLES.map((s) => s.id),
    total: documents.length,
    documents,
  };

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${documents.length} documents in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
