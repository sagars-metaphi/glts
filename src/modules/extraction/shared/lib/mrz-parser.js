/**
 * ICAO 9303 TD3 (passport) MRZ parser.
 * Uses mrz-fast library for parsing with built-in OCR error correction.
 * Falls back to custom logic for edge cases.
 */

import { parseMRZ } from 'mrz-fast';

const TD3_LINE_LEN = 44;
const WEIGHTS = [7, 3, 1];

/** Single-char substitutions common in MRZ OCR (applied only when check digits fail). */
const MRZ_CHAR_ALTERNATIVES = {
  '0': ['O', 'Q', 'D'],
  'O': ['0', 'Q'],
  '1': ['I', 'L', '7'],
  'I': ['1', 'L'],
  'L': ['1', 'I'],
  '2': ['Z'],
  'Z': ['2'],
  '5': ['S'],
  'S': ['5', '8'],
  '8': ['B'],
  '6': ['G'],
  'G': ['6'],
  'B': ['8'],
  '4': ['A'],
  'A': ['4'],
  'U': ['V'],
  'V': ['U'],
  'M': ['N'],
  'N': ['M'],
  '<': ['K', 'C'],
  'K': ['<'],
};

function charValue(ch) {
  if (ch === '<') return 0;
  if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0;
}

export function computeCheckDigit(input) {
  const s = input.replace(/\s/g, '').toUpperCase();
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += charValue(s[i]) * WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

export function verifyCheckDigit(data, checkChar) {
  if (!checkChar) return false;
  if (checkChar === '<') {
    return !data || /^<+$/.test(data);
  }
  return computeCheckDigit(data) === checkChar;
}

function sanitizeMrzText(text) {
  return (text || '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/[\\|"%#@[\](){}]/g, '')
    .replace(/[^A-Z0-9<\n]/g, '');
}

/**
 * Fix common OCR misreads of `<` as L, K, S, etc. in MRZ lines.
 * - PL/PE at start → P<
 * - SS between name parts → << (MIHAELASSTEFANIA → MIHAELA<<STEFANIA)
 * - KL/LK/KK between SURNAME and GIVEN → <<
 * - Trailing LLLL... (5+) → <<<<<...
 * Note: Be conservative to avoid breaking real names (MUELLER, etc.)
 */
function fixChevronMisreads(line) {
  let fixed = line;
  
  // Fix P< at start (PL, PK, PE → P<) - PE is used for electronic passports
  if (/^P[LKES]/i.test(fixed)) {
    fixed = 'P<' + fixed.slice(2);
  }
  
  // Fix S as < name separator (OCR misread of chevron)
  // Case 1: MIHAELA<STEFANIA read as MIHAELASSTEFANIA (< read as S, then STEFANIA)
  // We look for SS where second S starts a valid name
  if (fixed.startsWith('P<')) {
    // Try to split SS where second S is start of a name (MIHAELASSTEFANIA → MIHAELA<STEFANIA)
    fixed = fixed.replace(/([A-Z]{4,})S(S[A-Z]{3,})/g, '$1<$2');
    // Also handle << read as SS
    fixed = fixed.replace(/([A-Z]{3,})SS([A-Z]{3,})/g, '$1<<$2');
  }
  
  // Fix name separator: SURNAME(KL/LK/KK)GIVEN → SURNAME<<GIVEN
  // Look for pattern anywhere after P< : SURNAME (5+) + KL/LK/KK + GIVEN (3+)
  // Only fix KL, LK, KK (not LL which is common in real names)
  if (fixed.startsWith('P<')) {
    // Apply separator fix to entire name area (position 2 onwards)
    // Pattern: at least 5 letters, then KL/LK/KK, then at least 3 letters
    fixed = fixed.replace(/^(P<[A-Z]{5,})(K[LK]|LK)([A-Z]{3,})/, '$1<<$3');
  }
  
  // Fix <C or <K as << (OCR misread: TAHAR<CARCANDRA → TAHAR<<ARCANDRA)
  // The second < was misread as C, K, or S
  if (fixed.startsWith('P<')) {
    // Pattern: P<COUNTRY + SURNAME + <C/K/S + NAME (country is 3 chars)
    fixed = fixed.replace(/^(P<[A-Z]{3}[A-Z]{2,})<([CKS])([A-Z]{2,})/, '$1<<$3');
  }
  
  // Fix trailing fillers (runs of L, K at end → chevrons)
  // Long runs (5+) anywhere at end, or short runs after chevrons
  fixed = fixed.replace(/[LK]{5,}$/g, (run) => '<'.repeat(run.length));
  // Also fix short trailing [LK] after chevrons (e.g., <<<KLL → <<<<<<)
  fixed = fixed.replace(/<+[LK]{1,4}$/g, (run) => '<'.repeat(run.length));
  
  return fixed;
}

/** 
 * OCR often reads MRZ filler chevrons `<` as letters: L, K, C, I, O, R.
 * Normalize long runs (4+) of these characters to chevrons.
 * Note: Don't include S, Z, K in short runs as they appear in real names (ERIKSSON, GONZALEZ).
 */
function normalizeMrzFillerRuns(value) {
  return (value || '')
    .split(/(<{2,})/)
    .map((part) => {
      if (part.startsWith('<')) return part;
      // Only L, C, I, O, R in runs of 4+ (not S, Z, K which appear in real names)
      return part.replace(/[LCIOR]{4,}/g, (run) => '<'.repeat(Math.min(run.length, 20)));
    })
    .join('')
    .replace(/<{3,}/g, (run) => '<'.repeat(Math.min(run.length, 39)));
}

function cleanMrzBlob(text) {
  return sanitizeMrzText(text).replace(/\n/g, '');
}

function padMrzLine(line) {
  return (line || '').replace(/\s/g, '').toUpperCase().padEnd(TD3_LINE_LEN, '<').slice(0, TD3_LINE_LEN);
}

function isPlausibleYyMmDd(yyMmDd) {
  if (!yyMmDd || yyMmDd.length !== 6 || /\D/.test(yyMmDd)) return false;
  const mm = parseInt(yyMmDd.slice(2, 4), 10);
  const dd = parseInt(yyMmDd.slice(4, 6), 10);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

/** Map common MRZ OCR misreads in YYMMDD fields to digits. */
function normalizeOcrDateField(s) {
  return (s || '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/B/g, '8')
    .replace(/S/g, '5')
    .replace(/Z/g, '2')
    .replace(/G/g, '6')
    .replace(/Q/g, '0')
    .replace(/D/g, '0')
    .replace(/</g, '0');
}

function isDateFieldPlausible(s) {
  if (!s || s.length !== 6) return false;
  if (/^\d{6}$/.test(s)) return isPlausibleYyMmDd(s);
  if (!/^[A-Z0-9<]{6}$/.test(s)) return false;
  const n = normalizeOcrDateField(s);
  return /^\d{6}$/.test(n) && isPlausibleYyMmDd(n);
}

function formatMrzDate(yyMmDd) {
  if (!isPlausibleYyMmDd(yyMmDd)) return null;
  const yy = parseInt(yyMmDd.slice(0, 2), 10);
  const mm = yyMmDd.slice(2, 4);
  const dd = yyMmDd.slice(4, 6);
  const century = yy >= 50 ? 1900 : 2000;
  return `${dd}/${mm}/${century + yy}`;
}

/** 
 * Trailing S/L/K runs are often chevron fillers misread by OCR (e.g. CALLIE → CALLESS). 
 * Be conservative: only strip patterns that look like obvious filler noise.
 */
function stripChevronOcrTail(word) {
  if (!word || word.length < 4) return word;
  
  // Only strip obvious filler patterns:
  // - Repeated same char: SS, LL, KK, LLL, SSS, etc.
  // - Mixed L/K at very end: KL, LK, KLL, LKK (common < misreads)
  const hadSsTail = /SS$/i.test(word);
  const hadRepeatedTail = /(.)\1{1,}$/i.test(word.slice(-3)); // e.g., LL, SS, KK
  const hadLkTail = /[LK]{2,}$/i.test(word) && !/[^LK]/.test(word.slice(-3)); // only L/K in last 3
  
  if (!hadSsTail && !hadRepeatedTail && !hadLkTail) {
    return word; // Don't strip patterns like LIC, ICO, etc.
  }
  
  let stripped = word.replace(/([SLKO])\1+$/i, ''); // Only strip repeated chars
  if (!hadRepeatedTail && hadLkTail) {
    stripped = word.replace(/[LK]{2,}$/i, ''); // Strip L/K mixed tail
  }
  
  if (stripped.length < 3 || !/^[A-Z]+$/.test(stripped)) return word;
  
  // CALLIE<<<< misread as CALLESS — dropped I before E
  if (hadSsTail && /^[A-Z]{3,}LE$/i.test(stripped)) {
    stripped = `${stripped.slice(0, -1)}IE`;
  }
  return stripped;
}

function formatMrzNameComponent(value) {
  if (!value) return null;
  const cleaned = value
    .replace(/<+/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const words = [];
  for (const w of cleaned.split(/\s+/)) {
    const parts = /^K[A-Z]{3,23}$/.test(w) && w.length >= 6 ? [w.slice(1)] : [w];
    for (let p of parts) {
      p = stripChevronOcrTail(p);
      // Allow single letters (middle initials like "G") or names 2-24 chars
      if (!/^[A-Z]{1,24}$/.test(p)) break;
      words.push(p);
    }
  }
  return words.length ? words.join(' ') : null;
}

function isValidCountryCode(code) {
  const cc = (code || '').replace(/</g, '').toUpperCase();
  return /^[A-Z]{3}$/.test(cc) && cc !== 'XXX';
}

/** Remove issuing-country trailing letters OCR-glued onto surname (e.g. UTO + OERIKSSON). */
export function peelCountryBleedFromSurname(surname, ...countryCodes) {
  if (!surname) return surname;

  let sur = surname.replace(/\s/g, '').toUpperCase();

  for (const raw of countryCodes) {
    const cc = (raw || '').replace(/</g, '').toUpperCase();
    if (!isValidCountryCode(cc)) continue;

    for (let k = Math.min(2, cc.length); k >= 1; k--) {
      const tail = cc.slice(-k);
      if (tail && sur.startsWith(tail) && sur.length > tail.length + 2) {
        sur = sur.slice(tail.length);
        break;
      }
    }
  }

  return formatMrzNameComponent(sur) || sur;
}

function parseNamesFromLine1(l1) {
  let nameField = l1.slice(5, TD3_LINE_LEN);
  
  // Fix S as < separator if not already fixed (MIHAELASSTEFANIA → MIHAELA<STEFANIA)
  nameField = nameField.replace(/([A-Z]{4,})S(S[A-Z]{3,})/g, '$1<$2');
  
  // Fix <C or <K as << (OCR misread: TAHAR<CARCANDRA → TAHAR<<ARCANDRA)
  // Pattern: SURNAME<C followed by likely name chars
  nameField = nameField.replace(/^([A-Z]{2,})<([CKS])([A-Z]{2,})/, (m, sur, ch, rest) => {
    // If the char after < looks like it starts a name, treat <C as <<
    return `${sur}<<${rest}`;
  });
  
  // Look for separator: `<<` or OCR misreads like `KL`, `LK`, `KK`, `LL`
  let sep = nameField.indexOf('<<');
  let sepLen = 2;
  
  if (sep < 0) {
    // Try OCR misread separators (KL, LK, KK, LL, SS between letters)
    const altSepMatch = nameField.match(/^([A-Z]{2,})([KL]{2}|SS)([A-Z])/);
    if (altSepMatch) {
      sep = altSepMatch[1].length;
      sepLen = 2;
    }
  }
  
  if (sep < 0) {
    const parts = nameField.split(/<+/).filter(Boolean);
    return {
      surname: formatMrzNameComponent(parts[0]),
      givenName: formatMrzNameComponent(parts.slice(1).join(' ')),
    };
  }
  return {
    surname: formatMrzNameComponent(nameField.slice(0, sep)),
    givenName: formatMrzNameComponent(nameField.slice(sep + sepLen)),
  };
}

function isValidTd3Line1(l1) {
  return l1.length === TD3_LINE_LEN && l1[0] === 'P' && l1[1] === '<';
}

function isValidTd3Line2Shape(l2) {
  if (l2.length !== TD3_LINE_LEN) return false;
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);
  const sex = l2[20];
  const sexOk = sex === 'M' || sex === 'F' || sex === '<' || sex === '1' || sex === '7' || sex === '0';
  if (!sexOk) return false;
  return isDateFieldPlausible(birth) && isDateFieldPlausible(expiry);
}

function isCandidateLine2(l2) {
  const p = padMrzLine(l2);
  if (p.length !== TD3_LINE_LEN) return false;
  const birth = p.slice(13, 19);
  const expiry = p.slice(21, 27);
  const sex = p[20];
  const sexOk = sex === 'M' || sex === 'F' || sex === '<' || sex === '1' || sex === '7' || sex === '0';
  const birthOk = /^\d{6}$/.test(birth) || isDateFieldPlausible(birth);
  const expiryOk = /^\d{6}$/.test(expiry) || isDateFieldPlausible(expiry);
  return birthOk && expiryOk && sexOk;
}

function scoreTd3Checks(l2) {
  const passportNumber = l2.slice(0, 9).replace(/</g, '');
  const checks = {
    passportNumber: verifyCheckDigit(passportNumber, l2[9]),
    birthDate: verifyCheckDigit(l2.slice(13, 19), l2[19]),
    expiryDate: verifyCheckDigit(l2.slice(21, 27), l2[27]),
    composite: verifyCheckDigit(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43), l2[43]),
  };
  const score =
    (checks.passportNumber ? 3 : 0) +
    (checks.birthDate ? 3 : 0) +
    (checks.expiryDate ? 3 : 0) +
    (checks.composite ? 2 : 0);
  return { checks, score, passportNumber };
}

function applyCharAlt(line, index, alt) {
  return line.slice(0, index) + alt + line.slice(index + 1);
}

/** Letter-only OCR fixes for TD3 line 1 name/country fields (never S↔5 etc.). */
function line1CharAlternatives(ch) {
  const map = {
    O: ['Q', '0'],
    0: ['O'],
    I: ['L', '1'],
    L: ['I'],
    K: ['<'],
    '<': ['K'],
    M: ['N'],
    N: ['M'],
    U: ['V'],
    V: ['U'],
    B: ['8'],
    G: ['6'],
    Z: ['2'],
  };
  return map[ch] || [];
}

function correctLine2WithCheckDigits(l2) {
  let line = padMrzLine(l2);
  
  // Fix common OCR misreads in line 2:
  // Q → 0, D → 0 (passport numbers don't contain Q or D usually)
  line = line.replace(/Q/g, '0');
  // Fix common letter→digit misreads in date positions
  const chars = line.split('');
  for (const pos of [13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26]) {
    if (chars[pos] === 'O') chars[pos] = '0';
    if (chars[pos] === 'I') chars[pos] = '1';
    if (chars[pos] === 'B') chars[pos] = '8';
  }
  line = chars.join('');
  
  // Handle S in birth year (position 13): could be 5 or 8
  // Both often produce valid check digits, so prefer 8 (more recent year = more likely active passport)
  if (chars[13] === 'S') {
    const with5 = line.slice(0, 13) + '5' + line.slice(14);
    const with8 = line.slice(0, 13) + '8' + line.slice(14);
    const check5 = verifyCheckDigit(with5.slice(13, 19), with5[19]);
    const check8 = verifyCheckDigit(with8.slice(13, 19), with8[19]);
    // Prefer 8 if valid, otherwise use 5
    if (check8) {
      chars[13] = '8';
      line = chars.join('');
    } else if (check5) {
      chars[13] = '5';
      line = chars.join('');
    }
  }
  
  let { checks, score } = scoreTd3Checks(line);
  if (checks.passportNumber && checks.birthDate && checks.expiryDate) return line;

  const fixTargets = () => {
    const idx = new Set();
    if (!checks.passportNumber) {
      for (let i = 0; i <= 9; i++) idx.add(i);
    }
    if (!checks.birthDate) {
      for (let i = 13; i <= 19; i++) idx.add(i);
    }
    if (!checks.expiryDate) {
      for (let i = 20; i <= 27; i++) idx.add(i);
    }
    if (!checks.composite) idx.add(43);
    return [...idx];
  };

  let improved = true;
  let passes = 0;
  while (improved && passes < 12) {
    improved = false;
    passes += 1;
    for (const i of fixTargets()) {
      const ch = line[i];
      const alts = MRZ_CHAR_ALTERNATIVES[ch] || [];
      for (const alt of alts) {
        const trial = applyCharAlt(line, i, alt);
        if (!isValidTd3Line2Shape(trial)) continue;
        const t = scoreTd3Checks(trial);
        if (t.score > score) {
          line = trial;
          checks = t.checks;
          score = t.score;
          improved = true;
        }
      }
    }
  }

  return line;
}

function scoreLine1(l1, line2Nationality = null) {
  let score = 0;
  if (l1[0] !== 'P' || l1[1] !== '<') return 0;

  const country = l1.slice(2, 5);
  const countryClean = country.replace(/</g, '').toUpperCase();
  if (isValidCountryCode(country)) score += 3;
  else if (/^[A-Z<]{3}$/.test(country)) score += 1;
  else score -= 5;

  if (line2Nationality && countryClean === line2Nationality) score += 4;
  else if (line2Nationality && countryClean !== line2Nationality) score -= 3;

  const nameField = l1.slice(5, TD3_LINE_LEN);
  const sep = nameField.indexOf('<<');
  if (sep < 1) return score;

  score += 3;
  const surname = nameField.slice(0, sep).replace(/<+$/, '');
  const given = nameField.slice(sep + 2).replace(/<+$/, '');

  if (surname.length >= 1 && surname.length <= 39) score += 1;
  if (given.length >= 1) score += 1;
  if (surname.length > 18) score -= 2;
  if (/(.)\1{4,}/.test(surname + given)) score -= 3;
  if (/\d/.test(nameField)) score -= 10;
  if (surname.length > 12) score -= Math.ceil((surname.length - 12) / 4);

  const cc = country.replace(/</g, '');
  for (let k = 1; k <= 2 && k <= cc.length; k++) {
    const tail = cc.slice(-k);
    if (tail && surname.length > tail.length + 2 && surname.startsWith(tail)) {
      score -= 3;
    }
  }

  return score;
}

/**
 * When OCR drops the real country code (P<USANELSON → P<NELSON), the first 3 letters of the
 * surname are misread as the country (NEL + SON). Rebuild line 1 using nationality from line 2.
 */
/** OCR often reads the surname/given separator `<<` as `KK` or `K<`. */
function fixNameSeparatorsInLine1(l1) {
  const head = l1.slice(0, 5);
  const nf = l1.slice(5, TD3_LINE_LEN);
  const fixed = nf
    .replace(/([A-Z])K{2,}([A-Z])/gi, '$1<<$2')
    .replace(/([A-Z])K<([A-Z])/gi, '$1<<$2');
  return padMrzLine(head + fixed);
}


/** Drop digits OCR-glued onto the end of line 1 (passport number bleed). */
function trimLine1TrailingDigits(l1) {
  const head = l1.slice(0, 5);
  const nf = l1.slice(5, TD3_LINE_LEN).replace(/\d+[A-Z0-9<]*$/i, '');
  return padMrzLine(head + nf);
}

function realignLine1CountryWithLine2(l1, l2) {
  const nat = l2.slice(10, 13).replace(/</g, '').toUpperCase();
  if (!isValidCountryCode(nat)) return l1;

  const cc = l1.slice(2, 5).replace(/</g, '').toUpperCase();
  if (cc === nat) return l1;

  const nf = l1.slice(5, TD3_LINE_LEN);
  const sep = nf.indexOf('<<');
  if (sep < 1) return l1;

  const surFrag = nf.slice(0, sep).replace(/</g, '');
  const merged = cc + surFrag;
  if (merged.length < 3 || merged.length > 39 || !/^[A-Z]+$/.test(merged)) return l1;

  const givenAndFillers = nf.slice(sep + 2);
  return padMrzLine(`P<${nat}${merged}<<${givenAndFillers}`);
}

/** Strip 1–2 chars at the start of surname when they match the end of the issuing country code (OCR bleed). */
function peelCountryBleedFromLine1(l1) {
  const cc = l1.slice(2, 5).replace(/</g, '');
  if (!/^[A-Z]{3}$/.test(cc)) return l1;

  const nf = l1.slice(5, TD3_LINE_LEN);
  const sep = nf.indexOf('<<');
  if (sep < 1) return l1;

  let sur = nf.slice(0, sep);
  const rest = nf.slice(sep);

  for (let k = 2; k >= 1; k--) {
    const tail = cc.slice(-k);
    if (sur.startsWith(tail) && sur.length > tail.length + 3) {
      sur = sur.slice(tail.length);
      return padMrzLine(l1.slice(0, 5) + sur + rest);
    }
  }

  return l1;
}

function optimizeLine1(line1, line2) {
  const line2Score = scoreTd3Checks(line2).score;
  const line2Nat = line2.slice(10, 13).replace(/</g, '').toUpperCase();
  let best = padMrzLine(line1);
  let bestScore = scoreLine1(best, line2Nat) + line2Score;

  const tryCandidate = (candidate) => {
    const l1 = padMrzLine(candidate);
    if (l1[0] !== 'P' || l1[1] !== '<') return;
    const total = scoreLine1(l1, line2Nat) + line2Score;
    if (total > bestScore) {
      bestScore = total;
      best = l1;
    }
  };

  for (let pass = 0; pass < 5; pass++) {
    const prev = best;
    for (let i = 5; i < TD3_LINE_LEN - 1; i++) {
      tryCandidate(best.slice(0, i) + best.slice(i + 1) + '<');
      const ch = best[i];
      for (const alt of line1CharAlternatives(ch)) {
        tryCandidate(applyCharAlt(best, i, alt));
      }
    }
    if (best === prev) break;
  }

  return best;
}

export function parseTd3Mrz(line1, line2) {
  if (!line1 || !line2) return null;

  const l2 = correctLine2WithCheckDigits(line2);
  const line2Nat = l2.slice(10, 13).replace(/</g, '').toUpperCase();
  let l1 = trimLine1TrailingDigits(
    fixNameSeparatorsInLine1(realignLine1CountryWithLine2(line1, l2))
  );
  l1 = peelCountryBleedFromLine1(optimizeLine1(peelCountryBleedFromLine1(l1), l2));

  if (!isValidTd3Line1(l1) || !isCandidateLine2(l2)) return null;

  const { checks, score } = scoreTd3Checks(l2);
  let passportNumber = l2.slice(0, 9).replace(/</g, '');
  const body8 = l2.slice(0, 8).replace(/</g, '');
  if (l2[9] && verifyCheckDigit(body8, l2[9])) {
    passportNumber = body8;
  }
  const issuingCountry = l1.slice(2, 5).replace(/</g, '') || null;
  const nationality = l2.slice(10, 13).replace(/</g, '').replace(/5/g, 'S') || null;
  const names = parseNamesFromLine1(l1);
  const surname = peelCountryBleedFromSurname(
    names.surname,
    isValidCountryCode(issuingCountry) ? issuingCountry : null,
    nationality
  );
  const givenName = names.givenName;
  let sexChar = l2[20];
  if (sexChar === '1' || sexChar === '7' || sexChar === 'I') sexChar = 'F';
  if (sexChar === '0') sexChar = 'M';
  const sex = sexChar === 'M' || sexChar === 'F' ? sexChar : null;

  const mrzValid = checks.passportNumber && checks.birthDate && checks.expiryDate;
  const birthRaw = l2.slice(13, 19);
  const expiryRaw = l2.slice(21, 27);

  return {
    format: 'TD3',
    documentCode: l1[0],
    issuingCountry,
    surname,
    givenName,
    fullName: [givenName, surname].filter(Boolean).join(' '),
    passportNumber,
    nationality,
    birthDate: formatMrzDate(
      /^\d{6}$/.test(birthRaw) ? birthRaw : normalizeOcrDateField(birthRaw)
    ),
    sex,
    expiryDate: formatMrzDate(
      /^\d{6}$/.test(expiryRaw) ? expiryRaw : normalizeOcrDateField(expiryRaw)
    ),
    mrzValid,
    checkScore: score,
    checkDigits: checks,
    mrzLines: [l1, l2],
  };
}

function slideWindows(text, len) {
  const out = [];
  for (let i = 0; i <= text.length - len; i++) {
    out.push(text.slice(i, i + len));
  }
  return out;
}

/** TD3 line 2 core layout (check-digit slots may be digit or `<`). */
const LINE2_CORE_RE =
  /[A-Z0-9<]{9}[0-9<][A-Z0-9<]{3}[A-Z0-9<]{6}[0-9<][A-Z0-9<][0-9<]{6}[0-9<]/;

/** Locate TD3 line 2 from an MRZ fragment (tolerates leading OCR garbage). */
function extractLine2FromBlob(blob) {
  const clean = cleanMrzBlob(blob);
  const m = clean.match(LINE2_CORE_RE);
  if (m) {
    const start = clean.indexOf(m[0]);
    return padMrzLine(clean.slice(start));
  }
  const idx = clean.search(/[A-Z0-9<]{9}[0-9<][A-Z0-9<]{3}[A-Z0-9<]{6}/);
  if (idx >= 0) return padMrzLine(clean.slice(idx));
  return null;
}

/** Rebuild TD3 line 1 when P< is misread but NAME<<GIVEN is visible. */
function extractLine1FromBlob(blob, line2Hint = null) {
  const clean = cleanMrzBlob(blob);
  const nationality = line2Hint?.slice(10, 13)?.replace(/</g, '').replace(/5/g, 'S') || null;

  const pIdx = clean.indexOf('P<');
  if (pIdx >= 0) {
    return padMrzLine(fixChevronMisreads(normalizeMrzFillerRuns(clean.slice(pIdx))));
  }

  if (nationality && /^[A-Z]{3}$/.test(nationality)) {
    let search = 0;
    while (search < clean.length) {
      const nIdx = clean.indexOf(nationality, search);
      if (nIdx < 0) break;
      const tail = clean.slice(nIdx);
      const m = tail.match(/^([A-Z]{3})([A-Z]{2,32})<{1,3}([A-Z0-9<]{2,38})/);
      if (m && m[2].length >= 2) {
        const givenRaw = m[3].split(/<{4,}|\d{2,}/)[0].replace(/[^A-Z<]/g, '');
        const given = normalizeMrzFillerRuns(givenRaw).replace(/[^A-Z<]/g, '');
        return padMrzLine(`P<${m[1]}${m[2]}<<${given}`);
      }
      search = nIdx + 1;
    }
  }

  const double = clean.match(/([A-Z]{2,32})<{1,3}([A-Z0-9<]{2,38})/);
  if (double && isValidCountryCode(nationality)) {
    const given = normalizeMrzFillerRuns(double[2]).replace(/[^A-Z<]/g, '');
    return padMrzLine(`P<${nationality}${double[1]}<<${given}`);
  }

  return null;
}

function extractAllLine2Candidates(blob) {
  const clean = cleanMrzBlob(blob);
  const seen = new Set();
  const out = [];

  const add = (line) => {
    const p = padMrzLine(line);
    if (!seen.has(p) && isCandidateLine2(p)) {
      seen.add(p);
      out.push(p);
    }
  };

  let m;
  const re = new RegExp(LINE2_CORE_RE.source, 'g');
  while ((m = re.exec(clean)) !== null) {
    add(clean.slice(m.index));
  }

  for (let i = 0; i < clean.length; i++) {
    if (/[A-Z0-9]/i.test(clean[i])) {
      add(clean.slice(i));
    }
  }

  return out;
}

function reconstructPairFromOcrText(text) {
  const blob = cleanMrzBlob(text);
  if (blob.length < 60) return null;

  const line2Candidates = extractAllLine2Candidates(blob);
  if (!line2Candidates.length) {
    const single = extractLine2FromBlob(blob);
    if (single) line2Candidates.push(single);
  }

  let best = null;
  let bestTotal = -1;

  for (const rawL2 of line2Candidates) {
    const rawL1 = extractLine1FromBlob(blob, rawL2);
    if (!rawL1) continue;
    const parsed = parseTd3Mrz(rawL1, rawL2);
    if (!parsed) continue;
    const line2Nat = rawL2.slice(10, 13).replace(/</g, '').toUpperCase();
    const total = parsed.checkScore + scoreLine1(parsed.mrzLines[0], line2Nat);
    if (
      total > bestTotal ||
      (total === bestTotal && parsed.mrzValid && !best?.mrzValid)
    ) {
      bestTotal = total;
      best = parsed;
    }
  }

  return best;
}

function extractLineCandidates(text) {
  const clean = sanitizeMrzText(text);
  const candidates = new Set();

  for (const rawPart of clean.split('\n').filter((l) => l.length >= 30)) {
    // Apply chevron misread fixes (PL→P<, KL→<<, etc.)
    const part = fixChevronMisreads(rawPart);
    if (part.length === TD3_LINE_LEN) candidates.add(part);
    if (part.length >= TD3_LINE_LEN) {
      for (const w of slideWindows(part, TD3_LINE_LEN)) candidates.add(w);
    }
    // Also add the raw version in case fixes break something
    if (rawPart.length === TD3_LINE_LEN) candidates.add(rawPart);
  }

  const blob = clean.replace(/\n/g, '');
  const fixedBlob = fixChevronMisreads(blob);
  if (fixedBlob.length >= TD3_LINE_LEN) {
    for (const w of slideWindows(fixedBlob, TD3_LINE_LEN)) candidates.add(w);
  }
  if (blob.length >= TD3_LINE_LEN) {
    for (const w of slideWindows(blob, TD3_LINE_LEN)) candidates.add(w);
  }

  let p = blob.indexOf('P<');
  while (p !== -1) {
    for (let offset = -3; offset <= 3; offset++) {
      const start = p + offset;
      if (start >= 0 && start + TD3_LINE_LEN <= blob.length) {
        candidates.add(blob.slice(start, start + TD3_LINE_LEN));
      }
    }
    p = blob.indexOf('P<', p + 1);
  }

  return [...candidates];
}

function findBestMrzPair(text) {
  const candidates = extractLineCandidates(text);
  const line1Pool = candidates.filter((l) => l[0] === 'P' && l[1] === '<');
  const line2Pool = candidates.filter((l) => isCandidateLine2(l));

  const looseLine1 = candidates.filter((l) => l.includes('<<') && /[A-Z]{3}[A-Z]+<<[A-Z<]+/.test(l));
  for (const l1 of looseLine1) {
    const rebuilt = extractLine1FromBlob(l1);
    if (rebuilt) line1Pool.push(rebuilt);
  }

  let best = null;
  let bestTotal = -1;

  const tryPair = (raw1, raw2) => {
    const parsed = parseTd3Mrz(raw1, raw2);
    if (!parsed) return;
    const line2Nat = raw2.slice(10, 13).replace(/</g, '').toUpperCase();
    const total = parsed.checkScore + scoreLine1(parsed.mrzLines[0], line2Nat);
    if (
      total > bestTotal ||
      (total === bestTotal && parsed.mrzValid && !best?.mrzValid)
    ) {
      bestTotal = total;
      best = parsed;
    }
  };

  // Prefer consecutive OCR lines (avoids slide-window line1/line2 bleed)
  const rawLines = (text || '')
    .toUpperCase()
    .split(/\n/)
    .map((l) => fixChevronMisreads(normalizeMrzFillerRuns(l.replace(/\s/g, ''))))
    .filter((l) => l.length >= 30);
  for (let i = 0; i < rawLines.length - 1; i++) {
    const l1 = padMrzLine(rawLines[i]);
    const l2 = padMrzLine(rawLines[i + 1]);
    if (l1[0] === 'P' && l1[1] === '<' && isCandidateLine2(l2)) {
      tryPair(l1, l2);
    }
  }

  const reconstructed = reconstructPairFromOcrText(text);
  if (reconstructed) {
    const recNat = reconstructed.nationality?.toUpperCase() || null;
    const total = reconstructed.checkScore + scoreLine1(reconstructed.mrzLines[0], recNat);
    if (
      total > bestTotal ||
      (total === bestTotal && reconstructed.mrzValid && !best?.mrzValid)
    ) {
      best = reconstructed;
      bestTotal = total;
    }
  }

  for (const l1 of line1Pool) {
    for (const l2 of line2Pool) {
      tryPair(l1, l2);
    }
  }

  if (!best && line1Pool.length && line2Pool.length) {
    tryPair(line1Pool[0], line2Pool[0]);
  }

  return best;
}

/**
 * Try parsing MRZ using mrz-fast library with error correction.
 * Returns parsed data in our format, or null if parsing fails.
 */
function tryParseMrzFast(line1, line2) {
  try {
    // Apply our OCR fixes before passing to mrz-fast
    let l1 = fixChevronMisreads(normalizeMrzFillerRuns(line1));
    let l2 = line2;
    
    // Additional fixes for common OCR errors in line 2
    // D → 0 in passport number (positions 0-8)
    // S → 5 in date fields
    l2 = l2.replace(/^([D0-9]{9})/, (m) => m.replace(/D/g, '0'));
    
    // Ensure lines are exactly 44 chars
    l1 = padMrzLine(l1);
    l2 = padMrzLine(l2);
    
    const result = parseMRZ([l1, l2], { errorCorrection: true });
    
    if (!result || !result.fields) return null;
    
    const { fields } = result;
    
    // Convert mrz-fast format to our format
    const formatDate = (yymmdd) => {
      if (!yymmdd || yymmdd.length !== 6) return null;
      const yy = parseInt(yymmdd.slice(0, 2), 10);
      const mm = yymmdd.slice(2, 4);
      const dd = yymmdd.slice(4, 6);
      const century = yy > 50 ? '19' : '20';
      return `${dd}/${mm}/${century}${yymmdd.slice(0, 2)}`;
    };
    
    const sex = fields.sex === 'male' ? 'M' : fields.sex === 'female' ? 'F' : null;
    
    // Clean names (trim and normalize spaces)
    const cleanName = (name) => name?.trim().replace(/\s+/g, ' ') || null;
    
    return {
      format: 'TD3',
      documentCode: fields.documentCode || 'P',
      issuingCountry: fields.issuingState || null,
      surname: cleanName(fields.lastName),
      givenName: cleanName(fields.firstName),
      passportNumber: fields.documentNumber || null,
      nationality: fields.nationality || null,
      birthDate: formatDate(fields.birthDate),
      sex,
      expiryDate: formatDate(fields.expirationDate),
      personalNumber: fields.personalNumber || null,
      mrzValid: result.valid,
      mrzLines: [result.lines?.line1 || l1, result.lines?.line2 || l2],
      checkScore: result.valid ? 5 : 0,
      parsedByMrzFast: true,
    };
  } catch (e) {
    return null;
  }
}

export function parseMrzFromText(text) {
  if (!text?.trim()) return null;
  
  // First, try to find the best MRZ pair using our custom logic
  const customResult = findBestMrzPair(text);
  
  // If we found MRZ lines, also try mrz-fast for potentially better parsing
  if (customResult?.mrzLines?.length === 2) {
    const mrzFastResult = tryParseMrzFast(customResult.mrzLines[0], customResult.mrzLines[1]);
    
    // Only use mrz-fast result if it's valid (all check digits pass)
    if (mrzFastResult?.mrzValid) {
      // Merge: prefer mrz-fast values but fall back to custom for nulls
      return {
        ...customResult,
        surname: mrzFastResult.surname || customResult.surname,
        givenName: mrzFastResult.givenName || customResult.givenName,
        passportNumber: mrzFastResult.passportNumber || customResult.passportNumber,
        nationality: mrzFastResult.nationality || customResult.nationality,
        birthDate: mrzFastResult.birthDate || customResult.birthDate,
        sex: mrzFastResult.sex || customResult.sex,
        expiryDate: mrzFastResult.expiryDate || customResult.expiryDate,
        mrzValid: true,
        mrzLines: mrzFastResult.mrzLines || customResult.mrzLines,
      };
    }
  }
  
  return customResult;
}

