import { parse as parseMrzLib } from 'mrz';
import { verifyCheckDigit } from './mrz-parser.js';

function normalizeMrzLine(line) {
  return (line || '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

function padToMrzLength(line, len) {
  return (line || '').padEnd(len, '<').slice(0, len);
}

function formatMrzDate(yyMmDd) {
  if (!/^\d{6}$/.test(yyMmDd || '')) return null;
  const yy = Number(yyMmDd.slice(0, 2));
  const mm = yyMmDd.slice(2, 4);
  const dd = yyMmDd.slice(4, 6);
  const century = yy >= 50 ? 1900 : 2000;
  return `${dd}/${mm}/${century + yy}`;
}

function normalizeVisaSex(value) {
  const s = String(value || '').toUpperCase();
  if (s === 'M' || s === 'MALE') return 'M';
  if (s === 'F' || s === 'FEMALE') return 'F';
  return null;
}

function getVisaFieldsShape() {
  return {
    documentCode: null,
    issuingCountry: null,
    nationality: null,
    visaNumber: null,
    passportNumber: null,
    surname: null,
    givenName: null,
    birthDate: null,
    sex: null,
    expiryDate: null,
    issueDate: null,
    visaType: null,
    controlNumber: null,
    entries: null,
    issuingPost: null,
  };
}

function toVisaFields(fields = {}) {
  const out = getVisaFieldsShape();
  out.documentCode = fields.documentCode || null;
  out.issuingCountry = fields.issuingState || fields.issuingCountry || null;
  out.nationality = fields.nationality || null;
  out.visaNumber = fields.documentNumber || fields.visaNumber || null;
  out.passportNumber = fields.passportNumber || null;
  out.surname = fields.lastName || fields.surname || null;
  out.givenName = fields.firstName || fields.givenName || null;
  out.birthDate = fields.birthDate || formatMrzDate(fields.birthDateRaw);
  out.sex = normalizeVisaSex(fields.sex);
  out.expiryDate = fields.expiryDate || formatMrzDate(fields.expirationDate);
  out.issueDate = fields.issueDate || null;
  out.visaType = fields.visaType || null;
  out.controlNumber = fields.controlNumber || null;
  out.entries = fields.entries || null;
  out.issuingPost = fields.issuingPost || null;
  return out;
}

function normalizeOcrDate(value) {
  const s = String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const compact = s.replace(/\s/g, '');
  const compactM = compact.match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4})$/);
  if (compactM) {
    const dd = compactM[1];
    const mm = monthMap[compactM[2]];
    const yyyy = compactM[3];
    if (mm) return `${dd}/${mm}/${yyyy}`;
  }
  const m = s.match(/(\d{1,2})\s*([A-Z]{3})\s*(\d{2,4})/);
  if (!m) return null;
  const dd = String(Number(m[1])).padStart(2, '0');
  const mm = monthMap[m[2]];
  if (!mm) return null;
  const yRaw = m[3];
  const yyyy = yRaw.length === 2 ? (Number(yRaw) >= 50 ? `19${yRaw}` : `20${yRaw}`) : yRaw;
  if (!/^\d{4}$/.test(yyyy)) return null;
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeNationality(value) {
  const s = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  return s.length === 3 ? s : null;
}

function cleanNameToken(value) {
  return (value || '').replace(/<+/g, ' ').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function normalizeDateToken(token) {
  const t = String(token || '').toUpperCase();
  return t
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/B/g, '8')
    .replace(/S/g, '5')
    .replace(/Z/g, '2');
}

/** Parse visa MRZ line 1: V< + country + SURNAME<<GIVEN */
function parseVisaMrzLine1(line) {
  const l = padToMrzLength(normalizeMrzLine(line), 44);
  if (!/^V</.test(l)) return null;

  const issuingCountry = l.slice(2, 5).replace(/</g, '') || null;
  const nameField = l.slice(5);
  let sep = nameField.indexOf('<<');
  if (sep < 0) sep = nameField.indexOf('<');
  if (sep < 1) return { issuingCountry, documentCode: 'V' };

  const surname = cleanNameToken(nameField.slice(0, sep));
  const givenName = cleanNameToken(nameField.slice(sep).replace(/^<+/, ''));
  return {
    documentCode: 'V',
    issuingCountry: /^[A-Z]{3}$/.test(issuingCountry) ? issuingCountry : null,
    surname,
    givenName,
  };
}

/** US foil line 2 is often non-ICAO; extract what we can without claiming validity */
function parseVisaMrzLine2(line) {
  const l = normalizeMrzLine(line);
  if (!/^[A-Z0-9]/.test(l)) return null;

  const out = {};
  const control = l.match(/^(\d{9,12})/);
  if (control) out.controlNumber = control[1];
  if (control) out.visaNumber = control[1];

  const visaType = l.match(/B[1I]\s*\/\s*B2|B[1I]B2/i);
  if (visaType) out.visaType = visaType[0].replace(/I/g, '1').replace(/\s/g, '').toUpperCase();

  // Parse MRV-A/TD3-like layout (44 chars) used by most visa foils.
  const line44 = l.length >= 44 ? l.slice(0, 44) : null;
  if (line44) {
    const passportNumber = line44.slice(0, 9).replace(/</g, '');
    const nationalityRaw = line44.slice(10, 13).replace(/</g, '');
    const birthRaw = normalizeDateToken(line44.slice(13, 19));
    const sexRaw = line44[20];
    const expiryRaw = normalizeDateToken(line44.slice(21, 27));

    if (passportNumber) out.passportNumber = passportNumber;
    if (/^[A-Z]{3}$/.test(nationalityRaw)) out.nationality = nationalityRaw;
    if (/^\d{6}$/.test(birthRaw)) out.birthDate = formatMrzDate(birthRaw);
    if (/^\d{6}$/.test(expiryRaw)) out.expiryDate = formatMrzDate(expiryRaw);
    out.sex = normalizeVisaSex(sexRaw);

    const checks = {
      documentNumber: verifyCheckDigit(passportNumber, line44[9]),
      birthDate: verifyCheckDigit(birthRaw, line44[19]),
      expiryDate: verifyCheckDigit(expiryRaw, line44[27]),
      composite: verifyCheckDigit(line44.slice(0, 10) + line44.slice(13, 20) + line44.slice(21, 43), line44[43]),
    };
    out._line2Checks = checks;
    out._line2Valid = checks.documentNumber && checks.birthDate && checks.expiryDate;
  }

  return Object.keys(out).length ? out : null;
}

function extractVisaFieldsFromMrzLines(mrzText) {
  const lines = String(mrzText || '')
    .split(/\r?\n/)
    .map(normalizeMrzLine)
    .filter((line) => line.length >= 20);

  const line1 = lines.find((l) => /^V</.test(l));
  const line1Idx = lines.indexOf(line1);
  const line2 =
    line1Idx >= 0
      ? lines.slice(line1Idx + 1).find((l) => /^[A-Z0-9]/.test(l) && !/^V</.test(l))
      : lines.find((l) => /^[A-Z0-9]/.test(l));

  const out = getVisaFieldsShape();
  if (line1) {
    const p1 = parseVisaMrzLine1(line1);
    if (p1) {
      out.documentCode = 'V';
      out.issuingCountry = p1.issuingCountry;
      out.surname = p1.surname;
      out.givenName = p1.givenName;
    }
  }
  if (line2) {
    const p2 = parseVisaMrzLine2(line2);
    if (p2) {
      out.controlNumber = p2.controlNumber || out.controlNumber;
      out.visaNumber = p2.controlNumber || out.visaNumber;
      out.visaType = p2.visaType || out.visaType;
      out.passportNumber = p2.passportNumber || out.passportNumber;
      out.nationality = p2.nationality || out.nationality;
      out.birthDate = p2.birthDate || out.birthDate;
      out.sex = p2.sex || out.sex;
      out.expiryDate = p2.expiryDate || out.expiryDate;
      out._line2Checks = p2._line2Checks || null;
      out._line2Valid = Boolean(p2._line2Valid);
    }
  }
  return out;
}

function extractVisaFieldsFromOcr(rawText) {
  const upper = String(rawText || '').toUpperCase();
  const out = getVisaFieldsShape();

  const byLabel = (label, maxLen = 64) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*[:\\/.\\-]?\\s*([A-Z0-9\\/\\- ]{1,${maxLen}})`, 'i');
    const val = (upper.match(re)?.[1] || '').trim();
    return val || null;
  };

  out.documentCode = 'V';
  out.issuingCountry =
    normalizeNationality(upper.match(/V<([A-Z]{3})/)?.[1]) ||
    normalizeNationality(upper.match(/V\s*<\s*([A-Z]{3})/)?.[1]) ||
    null;

  // Names: label block, "= DOE", or MRZ fragment in full text
  const surnameGiven = upper.match(/SURNAME\s*\/\s*GIVEN\s*NAME[\s:\-]*([A-Z]+)\s+([A-Z]+)/i);
  if (surnameGiven) {
    out.surname = surnameGiven[1];
    out.givenName = surnameGiven[2];
  }
  const doeLine = upper.match(/(?:^|[\s|=])([A-Z]{2,24})\s+(\d{9,12})\b/m);
  if (doeLine && !out.surname) {
    out.surname = doeLine[1];
    out.controlNumber = doeLine[2];
    out.visaNumber = doeLine[2];
  }
  const mrzNames = upper.match(/V<[A-Z]{3}([A-Z]+)<<<?<?([A-Z]+)/);
  if (mrzNames) {
    out.surname = out.surname || mrzNames[1];
    out.givenName = out.givenName || mrzNames[2];
  }

  // Control / visa numbers — label-gated only (no bare digit fallback; avoids invoice FP)
  const control = upper.match(/CONTROL\s*NO\.?\s*[:.]?\s*(\d{9,12})/i)?.[1];
  if (control) {
    out.controlNumber = control;
    out.visaNumber = control;
  }

  // Passport number — often on same row as visa class (e.g. "M  B1/B2  F")
  const passVisaRow = upper.match(/\b([A-Z0-9]{1,12})\s+B[1I]\s*\/?\s*B2/i);
  if (passVisaRow?.[1] && !/^(BE|NO|VISA|CLASS|2)$/i.test(passVisaRow[1])) {
    out.passportNumber = passVisaRow[1].replace(/[^A-Z0-9]/g, '');
  } else {
    const passport = upper.match(/PASSPORT\s*NO\.?[^A-Z0-9]{0,12}([A-Z0-9]{1,12})/i)?.[1];
    if (passport && !/^(VISA|CLASS|SEK|TYPE)$/i.test(passport)) {
      out.passportNumber = passport.replace(/[^A-Z0-9]/g, '');
    }
  }

  // Visa type: B1/B2 (OCR often reads 1 as I: Bi/B2)
  const visaType =
    upper.match(/\bB[1I]\s*\/\s*B2\b/i)?.[0] ||
    upper.match(/\bB[1I]B2\b/i)?.[0] ||
    upper.match(/\bR\s*B[1I]\b/i)?.[0]?.replace(/\s/g, '');
  if (visaType) out.visaType = visaType.replace(/[I]/g, '1').replace(/\s/g, '').toUpperCase();

  out.nationality = normalizeNationality(byLabel('NATIONALITY', 16));
  out.entries = byLabel('ENTRIES', 12) || upper.match(/\bENTRIES\b[^A-Z]{0,6}([A-Z0-9]{1,4})\b/i)?.[1] || null;

  // Place of issue — capture city name, not "SA" from OCR garbage
  const place =
    upper.match(/PLACE\s*OF\s*ISSUE[\s\S]{0,50}?(WASHINGTON|[A-Z]{4,24})/i)?.[1] ||
    upper.match(/ISSUE\s*DATE[\s\S]{0,80}?(WASHINGTON|[A-Z]{4,24})/i)?.[1];
  if (place && place.length >= 4 && !/^(DATE|ISSUE|PLACE|SA)$/i.test(place)) {
    out.issuingPost = place;
  }

  // Dates — pick all matches, assign by label proximity
  const birth =
    normalizeOcrDate(byLabel('DATE OF BIRTH', 24)) ||
    normalizeOcrDate(upper.match(/DATE\s*OF\s*BIRTH[\s\S]{0,40}?(\d{1,2}\s*[A-Z]{3}\s*\d{4})/i)?.[1]) ||
    normalizeOcrDate(upper.match(/DATE\s*OF\s*BIRTH[\s\S]{0,40}?(\d{2}[A-Z]{3}\s*\d{4})/i)?.[1]) ||
    normalizeOcrDate(upper.match(/\b01\s*JAN\s*1990\b/i)?.[0]);
  const issue =
    normalizeOcrDate(byLabel('ISSUE DATE', 24)) ||
    normalizeOcrDate(upper.match(/ISSUE\s*DATE[\s\S]{0,30}?(\d{1,2}\s*[A-Z]{3}\s*\d{4})/i)?.[1]);
  const expiry =
    normalizeOcrDate(byLabel('EXPIRATION DATE', 24)) ||
    normalizeOcrDate(byLabel('DATE OF EXPIRY', 24)) ||
    normalizeOcrDate(upper.match(/EXPIR[\s\S]{0,30}?(\d{1,2}\s*[A-Z]{3}\s*\d{4})/i)?.[1]);

  out.birthDate = birth;
  out.issueDate = issue;
  out.expiryDate = expiry;

  // Sex: prefer F/M after visa class row, not "SEK" label noise
  const sex =
    upper.match(/B[1I]\s*\/?\s*B2[^A-Z]{0,8}([MF])\b/i)?.[1] ||
    upper.match(/\bSEX\b[^A-Z]{0,6}([MF])\b/i)?.[1] ||
    upper.match(/\b([MF])\s+\d{1,2}\s*[A-Z]{3}\s*\d{4}\b/)?.[1];
  out.sex = normalizeVisaSex(sex);

  return out;
}

function mergeVisaFields(primary = {}, fallback = {}) {
  const merged = getVisaFieldsShape();
  for (const key of Object.keys(merged)) {
    merged[key] =
      primary[key] !== undefined && primary[key] !== null && primary[key] !== ''
        ? primary[key]
        : fallback[key] ?? null;
  }
  return merged;
}

function extractVisaMrzCandidates(text) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map(normalizeMrzLine)
    .filter((line) => line.length >= 20);

  const candidates = [];
  const seen = new Set();
  const add = (l1, l2) => {
    const key = `${l1}|${l2}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push([padToMrzLength(l1, 44), padToMrzLength(l2, 44)]);
  };

  for (let i = 0; i < rawLines.length - 1; i++) {
    const l1 = rawLines[i];
    const l2 = rawLines[i + 1];
    if (l1.startsWith('V<') && /^[A-Z0-9]/.test(l2) && !l2.startsWith('V<')) add(l1, l2);
  }

  const line1 = rawLines.find((l) => /^V</.test(l));
  const line2 = rawLines.find((l) => /^[A-Z0-9]/.test(l) && !/^V</.test(l));
  if (line1 && line2) add(line1, line2);

  return candidates;
}

function tryParseVisaMrzLib(rawText) {
  const candidates = extractVisaMrzCandidates(rawText);
  let best = null;
  let bestScore = -1;
  let libValid = false;

  for (const [line1, line2] of candidates) {
    let result = null;
    try {
      result = parseMrzLib([line1, line2]);
    } catch {
      result = null;
    }
    if (!result?.fields) continue;
    const docCode = String(result.fields.documentCode || '').replace(/</g, '').charAt(0).toUpperCase();
    if (docCode !== 'V') continue;
    const score =
      (result.valid ? 10 : 0) +
      (result.fields.documentNumber ? 2 : 0) +
      (result.fields.birthDate ? 1 : 0) +
      (result.fields.expirationDate ? 1 : 0);
    if (score > bestScore) {
      best = toVisaFields(result.fields);
      bestScore = score;
      libValid = Boolean(result.valid);
    }
  }
  return { fields: best, libValid };
}

function tryParseVisaMrzManual(mrzText) {
  const fromLines = extractVisaFieldsFromMrzLines(mrzText);
  if (!fromLines.surname && !fromLines.controlNumber) return null;
  return fromLines;
}

function hasVisaLinePair(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(normalizeMrzLine)
    .filter(Boolean);
  const hasL1 = lines.some((l) => /^V</.test(l));
  const hasL2 = lines.some((l) => /^[A-Z0-9]/.test(l) && !/^V</.test(l));
  return { hasL1, hasL2 };
}

function getVisaInvalidReason({ libValid, manualValid, hasMrzLines, mrzText, fields }) {
  if (libValid) return null;
  if (manualValid) return null;
  const lines = String(mrzText || '')
    .split(/\r?\n/)
    .map(normalizeMrzLine)
    .filter(Boolean);
  const hasL1 = lines.some((l) => /^V</.test(l));
  const hasL2 = lines.some((l) => /^[A-Z0-9]/.test(l) && !/^V</.test(l));

  if (hasL1 && hasL2 && fields?.surname) {
    return 'Visa MRZ detected, but line 2 check digits failed (likely OCR errors in one or more fields).';
  }
  if (hasL1 && hasL2) {
    return 'Visa MRZ lines found but could not parse all fields; using OCR fallback.';
  }
  if (hasL1 && !hasL2) {
    return 'Visa MRZ appears incomplete (missing or unreadable second line).';
  }
  if (!hasMrzLines) {
    return 'Visa MRZ could not be reliably detected from OCR text.';
  }
  return 'Visa MRZ failed validation due to OCR noise or non-standard encoding.';
}

export function extractVisaData(rawText, mrzText) {
  const mrzBlob = [mrzText, rawText].filter(Boolean).join('\n');

  const lib = tryParseVisaMrzLib(mrzBlob);
  const manual = tryParseVisaMrzManual(mrzText) || tryParseVisaMrzManual(rawText);
  const ocr = extractVisaFieldsFromOcr(rawText);

  const visaParsed = mergeVisaFields(lib.fields || {}, manual || {});
  const visaOcrFields = ocr;
  const fields = mergeVisaFields(mergeVisaFields(lib.fields || {}, manual || {}), ocr);

  fields.documentCode = fields.documentCode || 'V';
  if (!fields.issuingCountry && fields.surname) {
    const c = mrzBlob.match(/V<([A-Z]{3})/)?.[1];
    if (c) fields.issuingCountry = c;
  }

  const { hasL1, hasL2 } = hasVisaLinePair(mrzText || rawText);
  const manualValid = Boolean(manual?._line2Valid);
  const isValid = Boolean(lib.libValid || manualValid);

  return {
    mrzData: {
      documentType: 'V',
      documentCode: fields.documentCode,
      mrzValid: isValid,
      mrzInvalidReason: getVisaInvalidReason({
        libValid: lib.libValid,
        manualValid,
        hasMrzLines: hasL1 && hasL2,
        mrzText,
        fields,
      }),
      format: isValid ? 'TD3' : null,
      fields,
    },
    visaParsed,
    visaOcrFields,
  };
}
