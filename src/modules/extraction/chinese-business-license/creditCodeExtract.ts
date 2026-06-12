import { fixOcrCodeSubstitutions } from './chineseOcrNormalize.js';
import { validateCreditCode } from './ChineseBusinessLicenseValidators.js';

const CREDIT_CODE_RE = /(?:^|[^0-9A-Z])([0-9A-Z]{18})(?=[^0-9A-Z]|$)/gi;
const DIGIT_ONLY_RE = /(?:^|[^0-9])(\d{18})(?=[^0-9]|$)/g;
const OCR_SEPARATOR_RE = /[\s·#!_:.\-—–|/\\]+/g;

export interface CreditCodeExtractionResult {
  value: string | null;
  candidate: string | null;
  checksumValid: boolean;
  source: 'segment' | 'fulltext' | null;
  reconstructed?: boolean;
}

export function sanitizeCreditSearchText(text: string): string {
  return text.replace(OCR_SEPARATOR_RE, '').toUpperCase();
}

function collectCandidates(text: string): Array<{ candidate: string; reconstructed: boolean }> {
  const found: Array<{ candidate: string; reconstructed: boolean }> = [];
  const seen = new Set<string>();

  const add = (raw: string, reconstructed: boolean) => {
    const candidate = fixOcrCodeSubstitutions(raw);
    if (candidate.length !== 18 || seen.has(candidate)) return;
    seen.add(candidate);
    found.push({ candidate, reconstructed });
  };

  const sources: Array<{ text: string; reconstructed: boolean }> = [
    { text, reconstructed: false },
    { text: sanitizeCreditSearchText(text), reconstructed: true },
  ];

  for (const source of sources) {
    if (!source.text) continue;

    let match: RegExpExecArray | null;
    const digitRe = new RegExp(DIGIT_ONLY_RE.source, DIGIT_ONLY_RE.flags);
    while ((match = digitRe.exec(source.text)) !== null) {
      add(match[1], source.reconstructed);
    }

    const alphaRe = new RegExp(CREDIT_CODE_RE.source, CREDIT_CODE_RE.flags);
    while ((match = alphaRe.exec(source.text.toUpperCase())) !== null) {
      add(match[1], source.reconstructed);
    }
  }

  return found;
}

function pickFirstValidChecksum(
  candidates: Array<{ candidate: string; reconstructed: boolean }>,
): (CreditCodeExtractionResult & { reconstructed: boolean }) | null {
  for (const entry of candidates) {
    const validation = validateCreditCode(entry.candidate);
    if (validation.valid) {
      return {
        value: validation.normalized || entry.candidate,
        candidate: entry.candidate,
        checksumValid: true,
        source: null,
        reconstructed: entry.reconstructed,
      };
    }
  }
  return null;
}

function pickBestCandidate(
  candidates: Array<{ candidate: string; reconstructed: boolean }>,
): CreditCodeExtractionResult {
  if (!candidates.length) {
    return { value: null, candidate: null, checksumValid: false, source: null };
  }

  const scored = candidates.map((entry) => {
    const validation = validateCreditCode(entry.candidate);
    const digitRatio = (entry.candidate.match(/\d/g) || []).length / 18;
    return { ...entry, validation, digitRatio };
  });

  scored.sort((a, b) => {
    if (a.validation.valid !== b.validation.valid) return a.validation.valid ? -1 : 1;
    if (a.digitRatio !== b.digitRatio) return b.digitRatio - a.digitRatio;
    return a.candidate.localeCompare(b.candidate);
  });

  const best = scored[0];
  return {
    value: best.validation.normalized || best.candidate,
    candidate: best.candidate,
    checksumValid: best.validation.valid,
    source: null,
    reconstructed: best.reconstructed,
  };
}

/**
 * Extract credit code without stripping/recombining segment text.
 * Searches segment first, then nearby full document text.
 */
export function extractCreditCode(segment: string, fullText: string): CreditCodeExtractionResult {
  const segmentCandidates = collectCandidates(segment);
  const segmentValid = pickFirstValidChecksum(segmentCandidates);
  if (segmentValid) {
    return { ...segmentValid, source: 'segment' };
  }

  const fullCandidates = collectCandidates(fullText);
  const fullValid = pickFirstValidChecksum(fullCandidates);
  if (fullValid) {
    return { ...fullValid, source: 'fulltext' };
  }

  const segmentPick = pickBestCandidate(segmentCandidates);
  if (segmentPick.candidate) {
    return { ...segmentPick, source: 'segment' };
  }

  const fullPick = pickBestCandidate(fullCandidates);
  if (fullPick.candidate) {
    return { ...fullPick, source: 'fulltext' };
  }

  return { value: null, candidate: null, checksumValid: false, source: null };
}
