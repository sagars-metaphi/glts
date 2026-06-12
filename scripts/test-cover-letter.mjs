import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { runDocumentExtraction } from '../src/modules/extraction/document/lib/run-extraction.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docx =
  process.argv[2] ||
  'c:/Users/Admin/Downloads/CHINA G TYPE - COVER LETTER FORMAT - DELHI LOCATION (2) (2).docx';

const template = JSON.parse(
  await fs.readFile(path.join(ROOT, 'src/templates/china-g-type-cover-letter-delhi.json'), 'utf8'),
);
const buffer = await fs.readFile(docx);
const result = await runDocumentExtraction({
  buffer,
  filename: path.basename(docx),
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  template,
  saveOutput: false,
});

console.log(JSON.stringify({ validation: result.validation, sections: result.sections }, null, 2));
