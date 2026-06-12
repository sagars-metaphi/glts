import fs from 'fs/promises';
import { createContainer } from '../src/config/container.ts';
import { terminateOcrWorkers } from '../src/modules/extraction/shared/lib/ocr.js';

const pdf =
  process.argv[2] ||
  'c:/Users/Admin/Downloads/chinagtyperequirementsdelhi (1)/WATERMARK - BUSINESS REGISTRATION COPY - DRAFT_NEW (3).pdf';

const container = createContainer();
const buffer = await fs.readFile(pdf);
const extractor = container.extractorFactory.get('chinese-business-license');
const result = await extractor.extract(buffer, {
  filename: pdf.split(/[\\/]/).pop(),
  mimeType: 'application/pdf',
});

console.log(JSON.stringify(result, null, 2));
await terminateOcrWorkers();
