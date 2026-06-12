import fs from 'fs/promises';
import { pdfBufferToPngPages } from '../src/modules/extraction/shared/lib/pdf-pages.js';
import { ocrChineseBusinessLicensePage } from '../src/modules/extraction/chinese-business-license/ocr/chineseBusinessLicenseOcr.js';
import { detectChineseBusinessLicense } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseDetection.ts';
import { terminateOcrWorkers } from '../src/modules/extraction/shared/lib/ocr.js';
import { destroyPaddleOcr } from '../src/modules/extraction/chinese-business-license/ocr/paddleOcrProvider.js';

const pdf =
  process.argv[2] ||
  'c:/Users/Admin/Downloads/chinagtyperequirementsdelhi (1)/WATERMARK - BUSINESS REGISTRATION COPY - DRAFT_NEW (3).pdf';

const buffer = await fs.readFile(pdf);
const pages = await pdfBufferToPngPages(buffer, [1], 2.75);
console.log('page1 bytes', pages[0].length);

const ocr = await ocrChineseBusinessLicensePage(pages[0], { pageIndex: 0 });
const detection = detectChineseBusinessLicense(ocr.text);

console.log(
  JSON.stringify(
    {
      ocrConfidence: ocr.confidence,
      detectionConfidence: detection.confidence,
      detected: detection.detected,
      matchedSignals: detection.matchedSignals,
      ocrDebug: {
        bestPass: ocr.ocrDebug.bestPass,
        bestConfidence: ocr.ocrDebug.bestConfidence,
        orientation: ocr.ocrDebug.orientation,
        engine: ocr.ocrDebug.engine,
        keywordHits: ocr.ocrDebug.keywordHits,
        passCount: ocr.ocrDebug.ocrPasses.length,
      },
      textPreview: ocr.text.slice(0, 500),
      ocrWarning: ocr.ocrWarning,
      savedOcrPath: ocr.savedOcrPath,
    },
    null,
    2,
  ),
);

await terminateOcrWorkers();
await destroyPaddleOcr();
