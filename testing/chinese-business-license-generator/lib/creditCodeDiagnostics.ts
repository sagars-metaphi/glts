import { fixOcrCodeSubstitutions } from '../../../src/modules/extraction/chinese-business-license/chineseOcrNormalize.js';
import { validateCreditCode } from '../../../src/modules/extraction/chinese-business-license/ChineseBusinessLicenseValidators.js';
import { extractCreditCode } from '../../../src/modules/extraction/chinese-business-license/creditCodeExtract.js';

const CREDIT_CODE_RE = /(?:^|[^0-9A-Z])([0-9A-Z]{18})(?=[^0-9A-Z]|$)/gi;
const DIGIT_ONLY_RE = /(?:^|[^0-9])(\d{18})(?=[^0-9]|$)/g;

export interface CreditCodeCandidateLog {
  candidate: string;
  normalizedCandidate: string;
  checksumPassed: boolean;
  rejectionReason: string;
  selected: boolean;
  matchesExpected: boolean;
}

function collectAllCandidates(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const candidate = fixOcrCodeSubstitutions(raw);
    if (candidate.length !== 18 || seen.has(candidate)) return;
    seen.add(candidate);
    found.push(candidate);
  };

  let match: RegExpExecArray | null;
  const digitRe = new RegExp(DIGIT_ONLY_RE.source, DIGIT_ONLY_RE.flags);
  while ((match = digitRe.exec(text)) !== null) add(match[1]);

  const alphaRe = new RegExp(CREDIT_CODE_RE.source, CREDIT_CODE_RE.flags);
  while ((match = alphaRe.exec(text.toUpperCase())) !== null) add(match[1]);

  return found;
}

function collectDiagnosticWindows(segment: string, fullText: string): string[] {
  const windows = [segment, fullText];
  for (const w of [segment, fullText]) {
    windows.push(w.replace(/[^0-9A-Za-z]/g, ''));
    windows.push(w.replace(/[·#!_:.\s-]/g, ''));
  }
  return [...new Set(windows.filter(Boolean))];
}

export function diagnoseCreditCodeCandidates(
  segment: string,
  fullText: string,
  expected: string | null,
): CreditCodeCandidateLog[] {
  const windows = collectDiagnosticWindows(segment, fullText);
  const all = [...new Set(windows.flatMap((w) => collectAllCandidates(w)))];
  const selected = extractCreditCode(segment, fullText);

  if (!all.length) {
    return [{
      candidate: segment.slice(0, 30),
      normalizedCandidate: '',
      checksumPassed: false,
      rejectionReason: 'no_18_char_candidate_found',
      selected: false,
      matchesExpected: false,
    }];
  }

  return all.map((raw) => {
    const normalizedCandidate = fixOcrCodeSubstitutions(raw);
    const validation = validateCreditCode(normalizedCandidate);
    const checksumPassed = validation.valid;
    const matchesExpected = expected != null && normalizedCandidate === expected;
    const isSelected = selected.value === normalizedCandidate;

    let rejectionReason = 'not_selected';
    if (isSelected && checksumPassed) rejectionReason = 'selected_valid';
    else if (isSelected && !checksumPassed) rejectionReason = 'selected_despite_checksum_fail';
    else if (!checksumPassed) rejectionReason = validation.message || 'checksum_failed';
    else if (checksumPassed && !matchesExpected) rejectionReason = 'checksum_valid_but_wrong_code';
    else if (checksumPassed && matchesExpected) rejectionReason = 'valid_expected_but_not_selected';

    return {
      candidate: raw,
      normalizedCandidate,
      checksumPassed,
      rejectionReason,
      selected: isSelected,
      matchesExpected,
    };
  });
}
