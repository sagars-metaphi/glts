import fs from 'fs/promises';
import path from 'path';
import { runChineseTesseractFallback } from '../../shared/lib/ocr.js';
import { normalizeChineseOcrText } from '../chineseOcrNormalize.js';
import {
  buildOcrVariants,
  ORIENTATIONS,
  preprocessForChineseOcr,
  rotateOrientation,
} from './chineseBusinessLicensePreprocess.js';
import { scoreOcrPassResult } from './chineseKeywordScore.js';
import { runPaddleOcr } from './paddleOcrProvider.js';

const ALL_VARIANTS = ['original', 'grayscale', 'highContrast', 'sharpened', 'watermarkRemoved'];
const PHASE1_VARIANTS = ['highContrast', 'original'];
const PHASE2_VARIANTS = ['grayscale', 'sharpened', 'watermarkRemoved'];
const OCR_DEBUG_DIR = path.join(process.cwd(), 'output', 'chinese-business-license-ocr');
const EARLY_EXIT_SCORE = 0.7;
const TESSERACT_FALLBACK_THRESHOLD = 0.65;

function recordPass(ocrPasses, passRecord) {
  ocrPasses.push(passRecord);
  return passRecord;
}

function updateBest(best, candidate) {
  if (
    !best ||
    candidate.compositeScore > best.compositeScore ||
    (candidate.compositeScore === best.compositeScore && candidate.ocrConfidence > best.ocrConfidence)
  ) {
    return candidate;
  }
  return best;
}

function topOrientations(ocrPasses, limit = 2) {
  const scores = new Map();
  for (const pass of ocrPasses) {
    const ori = pass.orientation;
    const score = pass.compositeScore ?? 0;
    scores.set(ori, Math.max(scores.get(ori) ?? 0, score));
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([ori]) => ori);
}

async function runPaddlePass(variantBuffer, orientation, variantName, deskewAngle, ocrPasses) {
  let raw;
  try {
    raw = await runPaddleOcr(variantBuffer);
  } catch (err) {
    console.warn(`[cbl-ocr] Paddle pass failed orient${orientation}/${variantName}:`, err?.message || err);
    return null;
  }

  const text = normalizeChineseOcrText(raw.text);
  const scoring = scoreOcrPassResult(text, raw.confidence, 'paddle');
  const passId = `orient${orientation}_${variantName}_paddle`;

  recordPass(ocrPasses, {
    passId,
    orientation,
    variant: variantName,
    engine: 'paddle',
    deskewAngle,
    ocrConfidence: raw.confidence,
    compositeScore: scoring.compositeScore,
    keywordScore: scoring.keywordScore,
    keywordHits: scoring.keywordHits,
    detectionConfidence: scoring.detectionConfidence,
    textLength: text.length,
  });

  return {
    passId,
    orientation,
    variant: variantName,
    engine: 'paddle',
    deskewAngle,
    text,
    ocrConfidence: raw.confidence,
    compositeScore: scoring.compositeScore,
    keywordHits: scoring.keywordHits,
    detectionConfidence: scoring.detectionConfidence,
  };
}

/**
 * Full Chinese business license OCR pipeline for one page image.
 * @param {Buffer} pageBuffer
 * @param {{ saveDebugOnFailure?: boolean, pageIndex?: number }} [options]
 */
export async function ocrChineseBusinessLicensePage(pageBuffer, options = {}) {
  const { buffer: preprocessed, deskewAngle } = await preprocessForChineseOcr(pageBuffer);
  /** @type {Array<Record<string, unknown>>} */
  const ocrPasses = [];
  let best = null;

  async function runOrientationPasses(orientation, variantNames) {
    const oriented = await rotateOrientation(preprocessed, orientation);
    const variants = await buildOcrVariants(oriented);

    for (const variantName of variantNames) {
      const candidate = await runPaddlePass(
        variants[variantName],
        orientation,
        variantName,
        deskewAngle,
        ocrPasses,
      );
      if (candidate) best = updateBest(best, candidate);
      if (best && best.compositeScore >= EARLY_EXIT_SCORE) return true;
    }
    return false;
  }

  // Phase 1 — all orientations, primary variants
  for (const orientation of ORIENTATIONS) {
    const done = await runOrientationPasses(orientation, PHASE1_VARIANTS);
    if (done) break;
  }

  // Phase 2 — remaining variants on best-scoring orientations
  if (!best || best.compositeScore < EARLY_EXIT_SCORE) {
    const orientations = topOrientations(ocrPasses, 2);
    for (const orientation of orientations) {
      const done = await runOrientationPasses(orientation, PHASE2_VARIANTS);
      if (done) break;
    }
  }

  // Phase 3 — optional full sweep if still below threshold
  if (!best || best.compositeScore < EARLY_EXIT_SCORE) {
    for (const orientation of ORIENTATIONS) {
      const done = await runOrientationPasses(
        orientation,
        ALL_VARIANTS.filter((v) => !PHASE1_VARIANTS.includes(v) && !PHASE2_VARIANTS.includes(v)),
      );
      if (done) break;
    }
  }

  if (!best || best.compositeScore < TESSERACT_FALLBACK_THRESHOLD) {
    const oriented = await rotateOrientation(preprocessed, best?.orientation ?? 0);
    const variants = await buildOcrVariants(oriented);
    const fallbackBuffer = variants[best?.variant ?? 'highContrast'];
    const raw = await runChineseTesseractFallback(fallbackBuffer);
    const text = normalizeChineseOcrText(raw.text);
    const scoring = scoreOcrPassResult(text, raw.confidence, 'tesseract');
    const passId = `orient${best?.orientation ?? 0}_${best?.variant ?? 'highContrast'}_tesseract`;

    recordPass(ocrPasses, {
      passId,
      orientation: best?.orientation ?? 0,
      variant: best?.variant ?? 'highContrast',
      engine: 'tesseract',
      deskewAngle,
      ocrConfidence: raw.confidence,
      compositeScore: scoring.compositeScore,
      keywordScore: scoring.keywordScore,
      keywordHits: scoring.keywordHits,
      detectionConfidence: scoring.detectionConfidence,
      textLength: text.length,
    });

    best = updateBest(best, {
      passId,
      orientation: best?.orientation ?? 0,
      variant: best?.variant ?? 'highContrast',
      engine: 'tesseract',
      deskewAngle,
      text,
      ocrConfidence: raw.confidence,
      compositeScore: scoring.compositeScore,
      keywordHits: scoring.keywordHits,
      detectionConfidence: scoring.detectionConfidence,
    });
  }

  const bestConfidence = Math.round((best?.ocrConfidence ?? 0) * 10) / 10;
  const ocrWarning =
    bestConfidence < 60
      ? {
          type: 'OCR_QUALITY_LOW',
          message:
            'OCR confidence is below 60%. Text recognition quality is insufficient for reliable extraction. Please upload a cleaner scan without heavy watermarking.',
          confidence: bestConfidence,
          recommendation: 'Use a higher-resolution scan or remove watermark overlay before upload.',
        }
      : null;

  const debug = {
    ocrPasses,
    bestPass: best?.passId ?? '',
    bestConfidence,
    orientation: best?.orientation ?? 0,
    deskewAngle,
    engine: best?.engine ?? 'none',
    keywordHits: best?.keywordHits ?? [],
    rawChineseText: best?.text ?? '',
  };

  let savedOcrPath = null;
  if (options.saveDebugOnFailure !== false && (bestConfidence < 60 || (best?.detectionConfidence ?? 0) < 0.45)) {
    savedOcrPath = await saveOcrDebugText(best?.text ?? '', options.pageIndex ?? 0, ocrPasses);
    console.warn('[cbl-ocr] Low OCR quality — saved debug text:', savedOcrPath);
  }

  console.info(
    '[cbl-ocr]',
    JSON.stringify({
      bestPass: debug.bestPass,
      bestConfidence: debug.bestConfidence,
      orientation: debug.orientation,
      engine: debug.engine,
      keywordHits: debug.keywordHits,
      detectionConfidence: best?.detectionConfidence ?? 0,
      compositeScore: best?.compositeScore ?? 0,
    }),
  );

  return {
    text: best?.text ?? '',
    confidence: bestConfidence,
    detectionConfidence: best?.detectionConfidence ?? 0,
    ocrDebug: debug,
    ocrWarning,
    savedOcrPath,
  };
}

async function saveOcrDebugText(text, pageIndex, ocrPasses) {
  await fs.mkdir(OCR_DEBUG_DIR, { recursive: true });
  const stamp = Date.now();
  const base = `page${pageIndex + 1}-${stamp}`;
  const textPath = path.join(OCR_DEBUG_DIR, `${base}-raw.txt`);
  const metaPath = path.join(OCR_DEBUG_DIR, `${base}-passes.json`);
  await fs.writeFile(textPath, text, 'utf8');
  await fs.writeFile(metaPath, JSON.stringify(ocrPasses, null, 2), 'utf8');
  return textPath;
}
