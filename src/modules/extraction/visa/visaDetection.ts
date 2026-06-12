/** Confidence ceiling when document is not classified as a visa */
export const NON_VISA_CONFIDENCE_CAP = 0.4;

export interface VisaDetectionInput {
  rawText: string;
  mrzValid: boolean;
}

/** Labels counted for label-triggered extraction (fix #2) */
export const VISA_LABEL_SIGNALS = [
  'SURNAME',
  'GIVEN NAMES',
  'GIVEN NAME',
  'NATIONALITY',
  'PASSPORT NO',
  'PASSPORT NUMBER',
  'DATE OF BIRTH',
  'ISSUE DATE',
  'EXPIRY DATE',
  'EXPIRATION DATE',
  'CONTROL NO',
  'GRANT NO',
  'ENTRIES',
  'VISA TYPE',
  'PLACE OF ISSUE',
  'SEX',
] as const;

/** Label groups including edge-crop partial OCR (e.g. ATIONALITY, VEN NAMES) */
const VISA_LABEL_GROUP_PATTERNS: RegExp[][] = [
  [/\bSURNAME\b/i, /\bFAMILY\s*NAME\b/i],
  [/\bGIVEN\s*NAMES?\b/i, /(?:GIVEN\s*)?VEN\s*NAMES?\b/i],
  [/\bNATIONALITY\b/i, /(?<!N)ATIONALITY\b/i],
  [/\bPASSPORT\b/i, /(?:A\\)?SSPORT\s*NO/i],
  [/\bDATE\s*OF\s*BIRTH\b/i, /ATE\s*OF\s*BIRTH/i],
  [/\bISSUE\s*DATE\b/i, /SUE\s*DATE/i],
  [/\bEXPIR(?:Y|ATION)\s*DATE\b/i, /XPIRY\s*DATE/i],
  [/\bENTRIES\b/i, /\bNTRIES\b/i],
  [/\bVISA\s*TYPE\b/i, /\bSA\s*TYPE\b/i],
  [/\bPLACE\s*OF\s*ISSUE\b/i, /(?:PACE|ACE)\s*OF\s*ISSUE/i],
  [/\bCONTROL\s*NO\b/i, /ONTROL\s*NO/i],
  [/\bGRANT\s*NO\b/i],
  [/\bSEX\b/i],
];

const MIN_LABEL_SIGNALS_FOR_EXTRACTION = 3;
const MIN_SUPPORTING_SIGNALS = 2;

function countLabelGroups(upper: string): number {
  let count = 0;
  for (const patterns of VISA_LABEL_GROUP_PATTERNS) {
    if (patterns.some((re) => re.test(upper))) count++;
  }
  return count;
}

function countSupportingVisaSignals(upper: string): number {
  let signals = countLabelGroups(upper);
  const compact = upper.replace(/\s/g, '');
  if (!/P</.test(compact) && /[A-Z]{3}[A-Z]{2,}<<[A-Z<]+/.test(compact)) signals++;
  if ((upper.match(/\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/g) || []).length >= 2) signals++;
  return signals;
}

/** Visa-specific anchors — passports (P<) and generic IDs lack these */
function hasVisaDocumentAnchor(upper: string, compact: string): boolean {
  if (/\b(?:ONTROL|CONTROL)\s*NO\b/i.test(upper)) return true;
  if (/\bGRANT\s*NO\b/i.test(upper)) return true;
  if (/\bVIGNETTE\b/i.test(upper)) return true;
  if (/\bE-?VISA\b/i.test(upper)) return true;
  if (/\b(?:VISA\s*)?(?:SA\s*)?TYPE\b/i.test(upper)) return true;
  if (/V<[A-Z]{3}/.test(compact)) return true;
  if (!/P</.test(compact) && /[A-Z]{3}[A-Z]{2,}<<[A-Z<]+/.test(compact)) return true;
  return false;
}

function hasSupportingVisaSignals(upper: string): boolean {
  return countSupportingVisaSignals(upper) >= MIN_SUPPORTING_SIGNALS;
}

export function countVisaLabels(rawText: string): number {
  const upper = String(rawText || '').toUpperCase();
  let count = 0;
  for (const label of VISA_LABEL_SIGNALS) {
    if (upper.includes(label)) count++;
  }
  return Math.max(count, countLabelGroups(upper));
}

/**
 * True when OCR/MRZ text represents a visa document — not a mere mention of "visa".
 * Does not use legacy extractVisaData documentType (always 'V').
 */
export function detectAsVisa({ rawText, mrzValid }: VisaDetectionInput): boolean {
  if (mrzValid) return true;

  const text = String(rawText || '');
  const upper = text.toUpperCase();
  const compact = upper.replace(/\s/g, '');

  if (/V<[A-Z]{3}/.test(compact)) return true;

  if (/\bGRANT\s*NO\b/.test(upper) && hasSupportingVisaSignals(upper)) return true;

  if (/\bVIGNETTE\b/.test(upper) && hasSupportingVisaSignals(upper)) return true;

  if (/\bE-?VISA\b/.test(upper) && hasSupportingVisaSignals(upper)) return true;

  if (/\bVISA\b/.test(upper) && hasSupportingVisaSignals(upper)) return true;

  if (/\bVISA\s*(NUMBER|NO\.?|CONTROL|STICKER|FOIL)\b/i.test(text)) return true;

  if (/\bVISA\s*CLASS\s*[:/]/i.test(text)) return true;

  if (/\bVISA\s*TYPE\s*[:/]/i.test(text)) return true;

  if (/CONTROL\s*NO/i.test(upper) && /\bSURNAME\b/i.test(upper)) return true;

  if (/ONTROL\s*NO/i.test(upper) && countLabelGroups(upper) >= 2) return true;

  if (
    countVisaLabels(text) >= MIN_LABEL_SIGNALS_FOR_EXTRACTION &&
    hasVisaDocumentAnchor(upper, compact)
  ) {
    return true;
  }

  return false;
}

/** Gate OCR label/heuristic extraction to visa-like documents */
export function isVisaLikeContext(rawText: string, mrzValid = false): boolean {
  if (mrzValid) return true;
  return detectAsVisa({ rawText, mrzValid: false });
}

/**
 * Run label OCR when document is visa-like OR >=3 visa labels appear in OCR text.
 */
export function shouldRunLabelExtraction(rawText: string, mrzValid = false): boolean {
  if (mrzValid) return true;
  if (detectAsVisa({ rawText, mrzValid: false })) return true;
  const compact = String(rawText || '').toUpperCase().replace(/\s/g, '');
  if (/P</.test(compact) && !/V</.test(compact)) return false;
  return countVisaLabels(rawText) >= MIN_LABEL_SIGNALS_FOR_EXTRACTION;
}
