import { countVisaLabels } from '../../visa/visaDetection.js';

/** @typedef {'pass1' | 'pass2' | 'pass3' | 'pass4'} BlurPassId */

/**
 * @typedef {Object} OcrPassResult
 * @property {BlurPassId} passId
 * @property {string} text
 * @property {number} confidence
 * @property {number} compositeScore
 * @property {{ mrzScore: number, labelCount: number, ocrConfidence: number, fieldCount: number }} scores
 */

/**
 * @typedef {Object} BlurRecoveryMeta
 * @property {BlurPassId} passWinner
 * @property {number} ocrConfidence
 * @property {Record<BlurPassId, number>} passScores
 * @property {number} recoveredFieldSignals
 */

function mergeUniqueLines(...blocks) {
  const unique = new Set();
  for (const text of blocks) {
    for (const line of String(text || '').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length >= 2) unique.add(trimmed);
    }
  }
  return [...unique].join('\n');
}

function scoreMrzContent(text) {
  const compact = String(text || '').toUpperCase().replace(/\s/g, '');
  let score = 0;
  if (/V<[A-Z]{3}/.test(compact)) score += 40;
  if (!/P</.test(compact) && /[A-Z]{3}[A-Z]{2,}<</.test(compact)) score += 25;
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim().replace(/\s/g, '').toUpperCase();
    if (t.length >= 28 && (t.includes('<<') || t.startsWith('V<'))) score += 12;
    if (/^[A-Z0-9<]{28,}$/.test(t) && /\d{6}/.test(t)) score += 12;
  }
  return Math.min(100, score);
}

function countFieldSignalsInText(text) {
  const upper = String(text || '').toUpperCase();
  let count = 0;
  if (/\bSURNAME\b/i.test(upper)) count++;
  if (/\b(?:GIVEN\s*NAMES?|VEN\s*NAMES?)\b/i.test(upper)) count++;
  if (/\bNATIONALITY\b|ATIONALITY\b/i.test(upper)) count++;
  if (/\b(?:PASSPORT|SSPORT)\s*NO\b/i.test(upper)) count++;
  if (/\b(?:CONTROL|ONTROL)\s*NO\b/i.test(upper)) count++;
  if (/\b(?:ISSUE|SUE)\s*DATE\b/i.test(upper)) count++;
  if (/\b(?:EXPIRY|XPIRY)\s*DATE\b/i.test(upper)) count++;
  if (/\bDATE\s*OF\s*BIRTH\b|ATE\s*OF\s*BIRTH\b/i.test(upper)) count++;
  if (/\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/.test(upper)) count++;
  if (/\b[A-Z0-9]{6,12}\b/.test(upper) && /\bVISA\b/i.test(upper)) count++;
  return count;
}

/**
 * Composite score for pass selection (higher = better OCR candidate).
 * @param {string} text
 * @param {number} confidence Tesseract mean confidence 0–100
 */
export function scoreOcrCandidate(text, confidence) {
  const mrzScore = scoreMrzContent(text);
  const labelCount = countVisaLabels(text);
  const fieldCount = countFieldSignalsInText(text);
  const ocrConfidence = Math.max(0, Math.min(100, confidence)) / 100;
  let compositeScore =
    mrzScore * 0.35 + labelCount * 10 + ocrConfidence * 25 + fieldCount * 8;
  if (/\bVISA\b/i.test(text)) compositeScore += 15;
  if (/\b(?:SURNAME|NATIONALITY|PASSPORT|CONTROL|GRANT)\b/i.test(text)) compositeScore += 10;
  return {
    compositeScore,
    scores: { mrzScore, labelCount, ocrConfidence, fieldCount },
  };
}

/**
 * Pick best OCR pass result.
 * @param {OcrPassResult[]} passes
 * @returns {{ winner: OcrPassResult, meta: BlurRecoveryMeta }}
 */
export function selectBestOcrPass(passes) {
  const sorted = [...passes].sort((a, b) => b.compositeScore - a.compositeScore);
  const winner = sorted[0];
  const pass1 = passes.find((p) => p.passId === 'pass1') || winner;
  const passScores = Object.fromEntries(passes.map((p) => [p.passId, p.compositeScore]));
  const recoveredFieldSignals = Math.max(
    0,
    winner.scores.fieldCount - pass1.scores.fieldCount,
  );

  const mergedText = mergeUniqueLines(...passes.map((p) => p.text));

  return {
    winner: { ...winner, text: mergedText || winner.text },
    meta: {
      passWinner: winner.passId,
      ocrConfidence: winner.confidence,
      passScores,
      recoveredFieldSignals,
    },
  };
}

export { mergeUniqueLines };
