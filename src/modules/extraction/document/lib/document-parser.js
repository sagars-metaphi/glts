import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { pdfToPng } from 'pdf-to-png-converter';
import { createWorker } from 'tesseract.js';

const MIN_TEXT_CHARS = Number(process.env.MIN_PDF_TEXT_CHARS || 40);

export async function extractTextFromBuffer(buffer, filename, mimeType) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf' || mimeType === 'application/pdf') return extractFromPdf(buffer, filename);
  if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractFromDocx(buffer);
  }
  throw new Error(`Unsupported file type: ${ext || mimeType}`);
}

async function extractFromPdf(buffer, filename) {
  const data = await pdfParse(buffer);
  const text = (data.text || '').trim();
  if (text.length >= MIN_TEXT_CHARS) return { text, source: 'pdf-parse', ocrUsed: false };

  const tmpPath = path.join(os.tmpdir(), `doc-${Date.now()}-${filename}`);
  await fs.writeFile(tmpPath, buffer);
  try {
    const ocrText = await ocrPdfPages(tmpPath);
    return { text: ocrText, source: 'ocr', ocrUsed: true };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function extractFromDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return { text: (value || '').trim(), source: 'mammoth', ocrUsed: false };
}

async function ocrPdfPages(filePath) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-extract-'));
  try {
    const pages = await pdfToPng(filePath, { outputFolder: tmpDir, outputFileMask: 'page', pagesToProcess: [1, 2, 3] });
    if (!pages?.length) return '';

    const worker = await createWorker('eng');
    const chunks = [];
    try {
      for (const page of pages.slice(0, 3)) {
        const pagePath = page.path || path.join(tmpDir, page.fileName || page.name);
        const { data } = await worker.recognize(pagePath);
        if (data?.text) chunks.push(data.text);
      }
    } finally {
      await worker.terminate();
    }
    return chunks.join('\n').trim();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function normalizeText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
