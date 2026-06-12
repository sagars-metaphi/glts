import { VISA_LABEL_RULES, buildLabelRegex, fuzzyCountryCode, ISO_ALPHA3 } from './VisaRegex.js';
import { shouldRunLabelExtraction } from './visaDetection.js';

export type OcrPartial = Record<string, string | null>;

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

export function normalizeOcrDate(value: string | null): string | null {
  if (!value) return null;
  const s = value.toUpperCase().replace(/\s+/g, ' ').trim();

  const num = s.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (num) {
    const dd = num[1].padStart(2, '0');
    const mm = num[2].padStart(2, '0');
    let yyyy = num[3];
    if (yyyy.length === 2) yyyy = Number(yyyy) >= 50 ? `19${yyyy}` : `20${yyyy}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  const text = s.match(/(\d{1,2})\s*([A-Z]{3,9})\s*(\d{2,4})/);
  if (text) {
    const mm = MONTH_MAP[text[2].slice(0, 3)];
    if (!mm) return null;
    let yyyy = text[3];
    if (yyyy.length === 2) yyyy = Number(yyyy) >= 50 ? `19${yyyy}` : `20${yyyy}`;
    return `${text[1].padStart(2, '0')}/${mm}/${yyyy}`;
  }
  return null;
}

function extractByLabel(text: string, label: string, maxLen = 64): string | null {
  const re = buildLabelRegex(label, maxLen);
  const m = text.match(re);
  const raw = m?.[1]?.trim().split(/\n/)[0].replace(/\s+/g, ' ').trim();
  return raw || null;
}

function normalizeSex(val: string | null): 'M' | 'F' | 'U' | null {
  if (!val) return null;
  const s = val.toUpperCase().charAt(0);
  if (s === 'M') return 'M';
  if (s === 'F') return 'F';
  return 'U';
}

/** Country-specific OCR heuristics layered on label matching */
function applyCountryHeuristics(text: string, out: OcrPartial): void {
  const upper = text.toUpperCase();

  // US B1/B2
  const usVisa = upper.match(/\bB[1I]\s*\/?\s*B2\b/i)?.[0];
  if (usVisa) {
    out.visaType = usVisa.replace(/I/g, '1').replace(/\s/g, '');
    out.visaCategory = 'B1/B2';
  }
  const usControl = upper.match(/(?:C)?ONTROL\s*NO\.?\s*[:.]?\s*(\d{9,12})/i)?.[1];
  if (usControl) {
    out.controlNumber = usControl;
    out.visaLabelNumber = usControl;
    out.visaNumber = usControl;
  }

  const mrzNamesNoPrefix = upper.match(/([A-Z]{3})([A-Z]+)<<<?<?([A-Z<]+)/);
  if (mrzNamesNoPrefix && ISO_ALPHA3.has(mrzNamesNoPrefix[1])) {
    out.issuingCountry = out.issuingCountry || mrzNamesNoPrefix[1];
    out.surname = out.surname || mrzNamesNoPrefix[2].replace(/<+/g, ' ').trim();
    out.givenNames = out.givenNames || mrzNamesNoPrefix[3].replace(/<+/g, ' ').trim();
  }

  // Schengen category — letter codes A–D only (avoids employment "CATEGORY: A")
  const schengen = upper.match(/\b(?:VISA\s*)?CATEGORY\s*([A-D])\b/i)?.[1];
  if (schengen) out.visaCategory = schengen;

  // UK vignette
  if (/VIGNETTE|LEAVE TO ENTER/i.test(upper)) out.visaType = 'VIGNETTE';

  // Canada eTA
  if (/\beTA\b|ELECTRONIC TRAVEL/i.test(upper)) out.visaType = 'eTA';

  // Australia grant
  const grant = upper.match(/GRANT\s*(?:NO|NUMBER)?\s*[:.]?\s*([A-Z0-9]{8,15})/i)?.[1];
  if (grant) out.visaLabelNumber = grant;

  // UAE sponsor
  const sponsor = extractByLabel(upper, 'SPONSOR', 80) || extractByLabel(upper, 'HOST', 80);
  if (sponsor) out.sponsor = sponsor;

  // Duration
  const stay = upper.match(/(\d{1,3})\s*DAYS?\s*(?:STAY|DURATION)/i)?.[1];
  if (stay) out.durationOfStay = `${stay} days`;

  // Purpose
  for (const kw of ['TOURISM', 'BUSINESS', 'STUDY', 'WORK', 'TRANSIT', 'MEDICAL']) {
    if (upper.includes(kw)) {
      out.purposeOfTravel = kw;
      break;
    }
  }
}

export function extractVisaFromOcr(
  rawText: string,
  options?: { mrzValid?: boolean },
): OcrPartial {
  const text = String(rawText || '');
  if (!shouldRunLabelExtraction(text, options?.mrzValid ?? false)) return {};

  const upper = text.toUpperCase();
  const out: OcrPartial = {};

  for (const rule of VISA_LABEL_RULES) {
    for (const label of rule.labels) {
      const val = extractByLabel(upper, label, rule.maxLen ?? 64);
      if (!val) continue;
      if (rule.field.includes('date') || rule.field === 'dateOfBirth') {
        const norm = normalizeOcrDate(val);
        if (norm) out[rule.field] = norm;
      } else if (rule.field === 'nationality') {
        const code = fuzzyCountryCode(val) || (val.length === 3 ? val : null);
        if (code) out.nationality = code;
      } else {
        out[rule.field] = val.replace(/<+/g, ' ').trim();
      }
      break;
    }
  }

  // Sex
  const sex =
    upper.match(/\bSEX\b[^A-Z]{0,6}([MF])\b/i)?.[1] ||
    upper.match(/[=:]\s*X\s*:\s*([MF])\b/i)?.[1] ||
    upper.match(/\b([MF])\s+\d{1,2}\s*[A-Z]{3}/)?.[1] ||
    null;
  out.sex = normalizeSex(sex);

  // MRZ fragment in OCR text
  const mrzNames = upper.match(/V<[A-Z]{3}([A-Z]+)<<<?<?([A-Z<]+)/);
  if (mrzNames) {
    out.surname = out.surname || mrzNames[1];
    out.givenNames = out.givenNames || mrzNames[2].replace(/<+/g, ' ').trim();
  }

  const issuing = upper.match(/V<([A-Z]{3})/)?.[1];
  if (issuing) out.issuingCountry = issuing;

  applyCountryHeuristics(text, out);

  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v != null && v !== ''),
  ) as OcrPartial;
}
