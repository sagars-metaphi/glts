import path from 'path';
import { Canvas } from '@napi-rs/canvas';

/** pdfjs requires URL-style paths with forward slashes and trailing slash. */
function pdfResourceUrl(relativeFromCwd) {
  const abs = path.resolve(process.cwd(), relativeFromCwd).replace(/\\/g, '/');
  return abs.endsWith('/') ? abs : `${abs}/`;
}

let pdfjsLib = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLib;
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas = new Canvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
    canvasAndContext.context = canvasAndContext.canvas.getContext('2d');
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * Render PDF buffer pages to PNG buffers (Windows-safe pdfjs paths).
 * @param {Buffer} buffer
 * @param {number[]} [pagesToProcess]
 * @param {number} [viewportScale]
 * @returns {Promise<Buffer[]>}
 */
export async function pdfBufferToPngPages(buffer, pagesToProcess = [1, 2], viewportScale = 2.0) {
  const { getDocument } = await getPdfjs();
  const data =
    buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)
      ? buffer
      : new Uint8Array(buffer);
  const pdf = await getDocument({
    data,
    cMapUrl: pdfResourceUrl('node_modules/pdfjs-dist/cmaps/'),
    standardFontDataUrl: pdfResourceUrl('node_modules/pdfjs-dist/standard_fonts/'),
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const pageCount = pdf.numPages;
  const targets = pagesToProcess.filter((p) => p >= 1 && p <= pageCount);
  const outputs = [];

  for (const pageNumber of targets) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: viewportScale });
    const canvasFactory = new NodeCanvasFactory();
    const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);
    try {
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      outputs.push(canvas.toBuffer('image/png'));
    } finally {
      page.cleanup();
      canvasFactory.destroy({ canvas, context });
    }
  }

  return outputs;
}
