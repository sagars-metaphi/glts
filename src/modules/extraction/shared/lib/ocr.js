import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Tesseract, { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { pdfToPng } from 'pdf-to-png-converter';
import sharp from 'sharp';
import {
  mergeUniqueLines,
  scoreOcrCandidate,
  selectBestOcrPass,
} from './ocrBlurRecovery.js';
import { pdfBufferToPngPages } from './pdf-pages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIN_OCR_WIDTH = 1600;
const MIN_OCR_HEIGHT = 400;
const MIN_EDGE = 120;
const MAX_SCALE = 12;

const MIN_OCR_BUFFER_WIDTH = 100;
const MIN_OCR_BUFFER_HEIGHT = 80;

const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
const TESS_OPTS = { logger: () => {} };

// Path to custom OCRB-trained model (trained for OCR-B font used in MRZ)
const OCRB_MODEL_PATH = path.resolve(__dirname, '../../../../models');

// Calculate scale factor for Tesseract optimization
function computeOcrScale(width, height) {
  if (!width || !height) return 1;
  const scales = [1];
  if (width < MIN_OCR_WIDTH) scales.push(MIN_OCR_WIDTH / width);
  if (height < MIN_OCR_HEIGHT) scales.push(MIN_OCR_HEIGHT / height);
  if (width < MIN_EDGE) scales.push(MIN_EDGE / width);
  if (height < MIN_EDGE) scales.push(MIN_EDGE / height);
  return Math.min(MAX_SCALE, Math.max(...scales));
}

// Resize image for optimal OCR resolution
function resizeForOcr(pipeline, meta) {
  const width = meta.width || 0;
  const height = meta.height || 0;
  const scale = computeOcrScale(width, height);
  if (scale <= 1.01) return pipeline;
  return pipeline.resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    withoutEnlargement: false,
    kernel: sharp.kernel.lanczos3,
  });
}

// Initialize base Sharp pipeline
async function basePipeline(buffer) {
  const image = sharp(buffer).rotate();
  const meta = await image.metadata();
  return resizeForOcr(image, meta);
}

// Verify image meets minimum dimensions
async function isOcrReadyBuffer(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    return (
      (meta.width || 0) >= MIN_OCR_BUFFER_WIDTH &&
      (meta.height || 0) >= MIN_OCR_BUFFER_HEIGHT
    );
  } catch {
    return false;
  }
}

// Standard image preprocessing for OCR
export async function preprocessImageStandard(buffer) {
  const pipeline = await basePipeline(buffer);
  return pipeline.grayscale().normalize().sharpen({ sigma: 1.2 }).png().toBuffer();
}

// High contrast image preprocessing
export async function preprocessImageHighContrast(buffer) {
  const pipeline = await basePipeline(buffer);
  return pipeline
    .grayscale()
    .normalize()
    .linear(1.4, -(128 * 0.3))
    .sharpen({ sigma: 1.8 })
    .png()
    .toBuffer();
}

/** Pass 1 — current standard pipeline */
export async function preprocessBlurPass1(buffer) {
  return preprocessImageStandard(buffer);
}

async function basePipelineBlur(buffer) {
  const image = sharp(buffer).rotate();
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const scale = Math.min(MAX_SCALE, computeOcrScale(width, height) * 1.75);
  if (scale <= 1.01) return image;
  return image.resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    withoutEnlargement: false,
    kernel: sharp.kernel.lanczos3,
  });
}

/** Pass 2 — unsharp mask + adaptive contrast */
export async function preprocessBlurPass2(buffer) {
  const pipeline = await basePipelineBlur(buffer);
  return pipeline
    .grayscale()
    .median(3)
    .normalize()
    .sharpen({ sigma: 2.8, m1: 1.6, m2: 0.9 })
    .linear(1.8, -(128 * 0.42))
    .png()
    .toBuffer();
}

/** Pass 3 — multi-level threshold (blur recovery) */
export async function preprocessBlurPass3Variants(buffer) {
  const pipeline = await basePipelineBlur(buffer);
  const gray = pipeline.grayscale().median(3).normalize();
  const thresholds = [105, 130];
  const bufs = [];
  for (const t of thresholds) {
    bufs.push(await gray.clone().threshold(t).sharpen({ sigma: 1.2 }).png().toBuffer());
  }
  return bufs;
}

export async function preprocessBlurPass3(buffer) {
  const variants = await preprocessBlurPass3Variants(buffer);
  return variants[2] || variants[0];
}

/** Pass 4 — aggressive sharpen */
export async function preprocessBlurPass4(buffer) {
  const pipeline = await basePipelineBlur(buffer);
  return pipeline
    .grayscale()
    .normalize()
    .sharpen({ sigma: 4.5, m1: 2.2, m2: 1.2 })
    .linear(1.5, -35)
    .png()
    .toBuffer();
}

const BLUR_PASS_PREPROCESSORS = {
  pass1: preprocessBlurPass1,
  pass2: preprocessBlurPass2,
  pass3: preprocessBlurPass3,
  pass4: preprocessBlurPass4,
};

/** Compute a safe bottom MRZ crop region (must fit inside rotated image bounds). */
function mrzCropRegion(width, height, fraction = 0.28) {
  if (width < 80 || height < 120) return null;

  const cropHeight = Math.max(40, Math.min(Math.floor(height * fraction), height));
  const top = Math.max(0, height - cropHeight);
  const safeHeight = Math.min(cropHeight, height - top);

  if (safeHeight < 40 || top + safeHeight > height) return null;

  return { left: 0, top, width, height: safeHeight };
}

async function extractMrzRegion(buffer, fraction) {
  const meta = await sharp(buffer).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const region = mrzCropRegion(width, height, fraction);
  if (!region) return null;

  try {
    return sharp(buffer).rotate().extract(region);
  } catch {
    return null;
  }
}

// Crop bottom strip where the MRZ zone usually resides
export async function preprocessMrzStrip(buffer) {
  let pipeline = await extractMrzRegion(buffer, 0.28);
  if (!pipeline) return null;

  const cropMeta = await pipeline.metadata();
  pipeline = resizeForOcr(pipeline, cropMeta);

  try {
    return await pipeline
      .grayscale()
      .normalize()
      .linear(1.55, -(128 * 0.38))
      .threshold(145)
      .sharpen({ sigma: 2.2 })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** Simple grayscale MRZ strip for OCRB model (minimal processing) */
async function preprocessMrzStripSimple(buffer, cropFraction = 0.25) {
  let pipeline = await extractMrzRegion(buffer, cropFraction);
  if (!pipeline) return null;

  try {
    return await pipeline
      .grayscale()
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** Binarized MRZ strip tuned for OCR-B style fonts. */
async function preprocessMrzStripBinarized(buffer) {
  let pipeline = await extractMrzRegion(buffer, 0.32);
  if (!pipeline) return null;

  const cropMeta = await pipeline.metadata();
  pipeline = resizeForOcr(pipeline, cropMeta);

  try {
    return await pipeline
      .grayscale()
      .normalize()
      .threshold(128)
      .sharpen({ sigma: 1.5 })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

// Run Tesseract on buffer with MRZ whitelist
function postProcessMrzLine(line) {
  return line
    .replace(/\s/g, '')
    .toUpperCase()
    .replace(/[\\|]/g, '<')
    .replace(/¢/g, '<')
    .replace(/[`'"]/g, '')
    .replace(/[^A-Z0-9<]/g, (ch) => {
      if (ch === '§' || ch === '°') return '<';
      return '';
    });
}

async function runMrzTesseract(buffer, psm, oem = '1') {
  const result = await Tesseract.recognize(buffer, 'eng', {
    ...TESS_OPTS,
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: MRZ_WHITELIST,
    tessedit_ocr_engine_mode: oem,  // 1 = LSTM only, 3 = Default
  });
  return (result.data.text || '')
    .split('\n')
    .map(postProcessMrzLine)
    .filter((l) => l.length >= 20)
    .join('\n');
}

/**
 * Run OCR using OCRB model trained specifically for OCR-B font used in MRZ.
 * This model is trained on the 37-character MRZ set and should be more accurate.
 */
async function runOcrbMrzTesseract(buffer, psm) {
  let worker = null;
  try {
    worker = await createWorker('ocrb', 1, {
      langPath: OCRB_MODEL_PATH,
      gzip: false,
      logger: () => {},
    });
    
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      tessedit_char_whitelist: MRZ_WHITELIST,
    });
    
    const result = await worker.recognize(buffer);
    return (result.data.text || '')
      .split('\n')
      .map(postProcessMrzLine)
      .filter((l) => l.length >= 20)
      .join('\n');
  } catch (e) {
    console.warn('OCRB model failed:', e.message);
    return '';
  } finally {
    if (worker) await worker.terminate();
  }
}

let sharedEngWorker = null;
let sharedChiSimWorker = null;
let ocrEngQueue = Promise.resolve();
let ocrChiQueue = Promise.resolve();

function withEngOcrLock(fn) {
  const run = ocrEngQueue.then(fn);
  ocrEngQueue = run.catch(() => {});
  return run;
}

async function getSharedEngWorker() {
  if (!sharedEngWorker) {
    sharedEngWorker = await createWorker('eng', 1, TESS_OPTS);
  }
  return sharedEngWorker;
}

function withChiOcrLock(fn) {
  const run = ocrChiQueue.then(fn);
  ocrChiQueue = run.catch(() => {});
  return run;
}

async function getSharedChiSimWorker() {
  if (!sharedChiSimWorker) {
    sharedChiSimWorker = await createWorker('chi_sim+eng', 1, TESS_OPTS);
  }
  return sharedChiSimWorker;
}

async function runChineseTesseractWithConfidence(buffer, psm) {
  return withChiOcrLock(async () => {
    const worker = await getSharedChiSimWorker();
    if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm });
    const result = await worker.recognize(buffer);
    return {
      text: (result.data.text || '').trim(),
      confidence: result.data.confidence ?? 0,
    };
  });
}

/** Release pooled OCR workers (benchmark / test teardown). */
export async function terminateOcrWorkers() {
  if (sharedEngWorker) {
    await sharedEngWorker.terminate();
    sharedEngWorker = null;
  }
  if (sharedChiSimWorker) {
    await sharedChiSimWorker.terminate();
    sharedChiSimWorker = null;
  }
}

// Run standard Tesseract on buffer (all characters)
async function runStandardTesseract(buffer, psm) {
  const { text } = await runStandardTesseractWithConfidence(buffer, psm);
  return text;
}

async function runStandardTesseractWithConfidence(buffer, psm) {
  return withEngOcrLock(async () => {
    const worker = await getSharedEngWorker();
    if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm });
    const result = await worker.recognize(buffer);
    return {
      text: (result.data.text || '').trim(),
      confidence: result.data.confidence ?? 0,
    };
  });
}

// Crop and OCR MRZ strip using OCRB model (trained for OCR-B font)
export async function ocrMrzStrip(buffer) {
  const lines = new Set();
  
  // Try OCRB model with multiple crop sizes (different passports have MRZ at different heights)
  const cropFractions = [0.25, 0.30, 0.35, 0.20];
  const psms = ['6', '7', '13'];
  
  for (const cropFrac of cropFractions) {
    const simpleBuf = await preprocessMrzStripSimple(buffer, cropFrac);
    if (!simpleBuf) continue;
    
    const ocrbAttempts = await Promise.all(
      psms.map((psm) => runOcrbMrzTesseract(simpleBuf, psm))
    );
    
    for (const block of ocrbAttempts) {
      for (const line of block.split('\n')) {
        const t = line.trim();
        // Look for MRZ lines: Line 1 starts with P<, Line 2 has digits and country code
        const isMrzLine1 = t.startsWith('P<') || t.includes('<<');
        const isMrzLine2 = /^[A-Z0-9<]{30,}$/.test(t) && /\d{6}/.test(t); // Has 6+ digits (dates)
        if (t.length >= 25 && (isMrzLine1 || isMrzLine2)) {
          lines.add(t);
        }
      }
    }
    
    if (lines.size >= 2) break;
  }

  if (lines.size > 0) {
    return [...lines].join('\n');
  }
  
  // Fallback: try OCRB on full image (MRZ might be elsewhere)
  try {
    const fullBuf = await sharp(buffer).grayscale().png().toBuffer();
    const fullAttempts = await Promise.all(
      ['6', '3', '11'].map((psm) => runOcrbMrzTesseract(fullBuf, psm))
    );
    
    for (const block of fullAttempts) {
      for (const line of block.split('\n')) {
        const t = line.trim();
        const isMrzLine1 = t.startsWith('P<') || (t.includes('<<') && t.length >= 40);
        const isMrzLine2 = /^[A-Z0-9<]{35,}$/.test(t) && /\d{6}/.test(t);
        if (t.length >= 30 && (isMrzLine1 || isMrzLine2)) {
          lines.add(t);
        }
      }
    }
    
    if (lines.size > 0) {
      return [...lines].join('\n');
    }
  } catch {
    // Full image OCRB failed, continue to fallback
  }
  
  // Fallback: use aggressive preprocessing with standard English model
  const mrzBuf = await preprocessMrzStrip(buffer);
  const binBuf = await preprocessMrzStripBinarized(buffer);
  const readyBufs = [];
  for (const b of [mrzBuf, binBuf]) {
    if (b && (await isOcrReadyBuffer(b))) readyBufs.push(b);
  }
  if (!readyBufs.length) return '';

  const engPsms = ['6', '7', '13', '4'];
  const engAttempts = await Promise.all(
    readyBufs.flatMap((b) => engPsms.map((psm) => runMrzTesseract(b, psm)))
  );

  for (const block of engAttempts) {
    for (const line of block.split('\n')) {
      const t = line.trim();
      if (t.length >= 25) lines.add(t);
    }
  }

  if (lines.size === 0) {
    const recovered = await ocrMrzStripBlurRecovery(buffer);
    for (const line of recovered.split('\n')) {
      const t = line.trim();
      if (t.length >= 25) lines.add(t);
    }
  }

  return [...lines].join('\n');
}

/** Raw MRZ strip crop buffer (no preprocessing). */
async function extractMrzRegionRaw(buffer, fraction = 0.28) {
  const meta = await sharp(buffer).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const region = mrzCropRegion(width, height, fraction);
  if (!region) return null;
  try {
    return sharp(buffer).rotate().extract(region).png().toBuffer();
  } catch {
    return null;
  }
}

/** Blur-recovery passes on MRZ strip when standard OCR finds nothing */
async function ocrMrzStripBlurRecovery(buffer) {
  const lines = new Set();

  const addMrzLines = (block) => {
    for (const line of String(block || '').split('\n')) {
      const t = line.trim().replace(/\s/g, '').toUpperCase();
      if (t.length < 22) continue;
      const isMrzLine1 = t.startsWith('V<') || (t.includes('<<') && t.length >= 26);
      const isMrzLine2 = /^[A-Z0-9<]{26,}$/.test(t) && /\d{6}/.test(t);
      if (isMrzLine1 || isMrzLine2) lines.add(t);
    }
  };

  for (const passId of ['pass2', 'pass3', 'pass4']) {
    const preprocess = BLUR_PASS_PREPROCESSORS[passId];
    for (const cropFrac of [0.22, 0.26, 0.3, 0.34, 0.38]) {
      const raw = await extractMrzRegionRaw(buffer, cropFrac);
      if (!raw) continue;
      const prepped = await preprocess(raw);
      if (!(await isOcrReadyBuffer(prepped))) continue;

      for (const psm of ['6', '7']) {
        addMrzLines(await runMrzTesseract(prepped, psm));
      }
    }
    if (lines.size > 0) break;
  }

  return [...lines].join('\n');
}

/** Top ~45% of document (visa header + label block). */
async function extractTopRegionRaw(buffer, fraction = 0.45) {
  const meta = await sharp(buffer).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 80 || height < 120) return null;

  const cropHeight = Math.max(80, Math.min(Math.floor(height * fraction), height));
  try {
    return sharp(buffer).rotate().extract({
      left: 0,
      top: 0,
      width,
      height: cropHeight,
    }).png().toBuffer();
  } catch {
    return null;
  }
}

async function extractTopRegionBuffer(buffer, fraction = 0.45) {
  const crop = await extractTopRegionRaw(buffer, fraction);
  if (!crop) return null;
  const meta = await sharp(crop).metadata();
  let pipeline = resizeForOcr(sharp(crop), meta);
  return pipeline.grayscale().normalize().sharpen({ sigma: 1.2 }).png().toBuffer();
}

/** English OCR on MRZ strip (labels + MRZ fragments when bottom crop is tight). */
async function ocrMrzRegionEng(buffer) {
  const simpleBuf = await preprocessMrzStripSimple(buffer, 0.28);
  if (!simpleBuf) return '';

  const meta = await sharp(simpleBuf).metadata();
  let pipeline = sharp(simpleBuf);
  pipeline = resizeForOcr(pipeline, meta);

  try {
    const prepped = await pipeline.grayscale().normalize().sharpen({ sigma: 1.5 }).png().toBuffer();
    return runStandardTesseract(prepped, '6');
  } catch {
    return '';
  }
}

/**
 * Run multi-region OCR for one blur-recovery preprocessing pass.
 * @param {Buffer} buffer
 * @param {'pass1'|'pass2'|'pass3'|'pass4'} passId
 */
async function ocrMultiRegionForPass(buffer, passId) {
  const preprocess = BLUR_PASS_PREPROCESSORS[passId];
  const topFraction = passId === 'pass1' ? 0.45 : 0.62;

  const [topRaw, mrzRaw] = await Promise.all([
    extractTopRegionRaw(buffer, topFraction),
    extractMrzRegionRaw(buffer),
  ]);

  /** @type {Buffer[]} */
  const regionBufs = [];

  if (passId === 'pass3') {
    if (topRaw) regionBufs.push(...(await preprocessBlurPass3Variants(topRaw)));
    if (mrzRaw) regionBufs.push(...(await preprocessBlurPass3Variants(mrzRaw)));
    regionBufs.push(...(await preprocessBlurPass3Variants(buffer)));
  } else {
    if (topRaw) regionBufs.push(await preprocess(topRaw));
    if (mrzRaw) regionBufs.push(await preprocess(mrzRaw));
    regionBufs.push(await preprocess(buffer));
  }

  const psm = passId === 'pass4' ? '3' : undefined;
  const results = [];
  for (const buf of regionBufs.filter(Boolean)) {
    results.push(await runStandardTesseractWithConfidence(buf, psm));
  }
  const text = mergeUniqueLines(...results.map((r) => r.text));
  const confidence =
    results.length > 0
      ? results.reduce((s, r) => s + r.confidence, 0) / results.length
      : 0;
  const { compositeScore, scores } = scoreOcrCandidate(text, confidence);

  return { passId, text, confidence, compositeScore, scores };
}

/**
 * Multi-region visa OCR with 4-pass blur recovery.
 * @returns {Promise<{ text: string, meta: import('./ocrBlurRecovery.js').BlurRecoveryMeta }>}
 */
const BLUR_EARLY_EXIT_SCORE = 48;

export async function ocrMultiRegionMerge(buffer) {
  const pass1 = await ocrMultiRegionForPass(buffer, 'pass1');
  const passes = [pass1];

  const pass1BlurLikely =
    pass1.scores.mrzScore < 20 &&
    pass1.scores.labelCount < 3 &&
    pass1.text.length < 250;

  if (pass1BlurLikely) {
    for (const id of /** @type {const} */ (['pass2', 'pass3', 'pass4'])) {
      const p = await ocrMultiRegionForPass(buffer, id);
      passes.push(p);
      if (p.compositeScore >= BLUR_EARLY_EXIT_SCORE && p.scores.labelCount >= 2) break;
    }
  }

  const { winner, meta } = selectBestOcrPass(passes);
  return { text: winner.text, meta };
}

/** Legacy string-only helper */
export async function ocrMultiRegionMergeText(buffer) {
  const { text } = await ocrMultiRegionMerge(buffer);
  return text;
}

/** Resolve upload buffer to one or more image page buffers (PDF → PNG pages). */
export async function resolveUploadToImages(buffer, mimeType, filename = '', viewportScale = 2.0) {
  const name = String(filename || '').toLowerCase();
  const isPdf = mimeType === 'application/pdf' || name.endsWith('.pdf');
  if (isPdf) {
    const pages = await pdfBufferToPngPages(buffer, [1, 2, 3], viewportScale);
    return pages.length ? pages : [buffer];
  }
  return [buffer];
}

/** Watermark-heavy Chinese document preprocessing. */
export async function preprocessChineseDocument(buffer) {
  const pipeline = await basePipeline(buffer);
  return pipeline
    .grayscale()
    .median(3)
    .normalize()
    .linear(1.8, -(128 * 0.35))
    .sharpen({ sigma: 2.5 })
    .png()
    .toBuffer();
}

/** Tesseract chi_sim fallback for Chinese document OCR. */
export async function runChineseTesseractFallback(buffer) {
  const [standard, highContrastBuf, watermarkBuf] = await Promise.all([
    preprocessImageStandard(buffer),
    preprocessImageHighContrast(buffer),
    preprocessChineseDocument(buffer),
  ]);
  const [pass1, pass2, pass3] = await Promise.all([
    runChineseTesseractWithConfidence(standard, '3'),
    runChineseTesseractWithConfidence(highContrastBuf, '3'),
    runChineseTesseractWithConfidence(watermarkBuf, '6'),
  ]);
  const candidates = [pass1, pass2, pass3];
  const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  const text = mergeUniqueLines(...candidates.map((c) => c.text));
  return { text, confidence: best.confidence, engine: 'tesseract' };
}

/** Chinese document OCR (chi_sim + eng) with multi-pass preprocessing. */
export async function ocrChinesePage(buffer) {
  const [standard, highContrastBuf, watermarkBuf] = await Promise.all([
    preprocessImageStandard(buffer),
    preprocessImageHighContrast(buffer),
    preprocessChineseDocument(buffer),
  ]);

  const result = await runChineseTesseractFallback(buffer);
  return { text: result.text, confidence: result.confidence };
}

// OCR full document page
export async function ocrFullPage(buffer) {
  const standard = await preprocessImageStandard(buffer);
  const fastText = await runStandardTesseract(standard);
  
  // If the standard OCR text looks highly readable, return it
  if (fastText.length > 200 && (fastText.includes('PASSPORT') || fastText.includes('<<'))) {
    return fastText;
  }

  // Otherwise, run on high contrast as fallback and combine
  const highContrastBuf = await preprocessImageHighContrast(buffer);
  const hcText = await runStandardTesseract(highContrastBuf, '3');
  
  return `${fastText}\n${hcText}`;
}

// Convert PDF to PNG buffer (page 1)
export async function pdfToPngBuffer(filePath) {
  const pngPages = await pdfToPng(filePath, {
    disableFontFace: true,
    useSystemFonts: false,
    viewportScale: 2.0,
    pagesToProcess: [1],
  });
  if (pngPages && pngPages.length > 0) {
    return pngPages[0].content;
  }
  throw new Error('Could not convert PDF to image');
}

// Main logic to read file (handles PDF and image)
export async function getFileBuffer(filePath) {
  const isPdf = filePath.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return pdfToPngBuffer(filePath);
  }
  return fs.readFile(filePath);
}
