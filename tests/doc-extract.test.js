#!/usr/bin/env node
/**
 * Smoke test: run document extraction against employment-form template.
 * Requires a sample DOCX at tests/fixtures/sample.docx (optional).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { runDocumentExtraction } from '../src/modules/extraction/document/lib/run-extraction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sample = path.join(__dirname, 'fixtures/sample.docx');
const templatePath = path.join(root, 'src/templates/employment-form.json');
const outputDir = path.join(root, 'output/document-extraction');

async function main() {
  try {
    await fs.access(sample);
  } catch {
    console.log('Skip: tests/fixtures/sample.docx not found');
    process.exit(0);
  }

  const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
  const buffer = await fs.readFile(sample);
  const result = await runDocumentExtraction({
    buffer,
    filename: 'sample.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    template,
    outputDir,
    saveOutput: false,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
