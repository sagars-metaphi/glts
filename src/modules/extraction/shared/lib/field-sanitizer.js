const LABEL_WORDS = new Set([
  'PASSPORT', 'PASSEPORT', 'PASAPORTE', 'SURNAME', 'NOM', 'APELLIDOS',
  'GIVEN', 'NAMES', 'PRENOMS', 'PRENOM', 'NOMBRES', 'NATIONALITY', 'NATIONALITE', 'NACIONALIDAD',
  'SEX', 'SEXE', 'SEXO', 'GENDER', 'BIRTH', 'NAISSANCE', 'NACIMIENTO',
  'ISSUE', 'DELIVRANCE', 'EXPEDICION', 'EXPIRY', 'EXPIRATION', 'DATE',
  'AUTHORITY', 'AUTORITE', 'AUTORIT', 'AUTORIDAD', 'PLACE', 'LIEU', 'LUGAR',
  'SIGNATURE', 'HUSBAND', 'WIFE', 'FATHER', 'MOTHER', 'DOCUMENT', 'NUMBER', 'NO',
  'WARGANEGARA', 'TARIKH', 'LAHIR', 'TEMPAT', 'JANTINA', 'DIKELUARKAN',
  'FECHA', 'FACIMIENTO', 'NAFSSAPCE',
]);

/**
 * Cross-validate MRZ name with visual OCR name and full page text.
 * MRZ often has OCR noise (chevrons read as S, L, C, K, etc.).
 * 
 * Strategy:
 * 1. If visual matches MRZ exactly → use it
 * 2. If MRZ has trailing S and name-without-S appears in fullText → strip S
 * 3. If visual is cleaner version of MRZ → use visual
 * 4. Otherwise use MRZ
 */
function crossValidateName(mrzName, visualName, fullText = '', isGivenName = false, surnameHint = null) {
  // If MRZ name is missing but visual has it, use visual
  if (!mrzName && visualName) return visualName;
  
  // If both are missing but we can find a name in fullText, try to use it
  if (!mrzName && !visualName && fullText && isGivenName) {
    const text = fullText.toUpperCase();
    // Find all capitalized words that could be person names
    // Require at least 5 chars, must have vowels, no repeated chars patterns
    const cleanNames = [...new Set(
      (text.match(/\b[A-Z]{5,15}\b/g) || [])
        .filter(w => !LABEL_WORDS.has(w))
        .filter(w => !/^(UNITED|STATES|AMERICA|PASSPORT|PASSEPORT|REPUBLIC|DEPARTMENT|SIGNATURE|INDONESIA|NATIONALITY|BIRTHDATE|AUTHORITY|EXPIRY|ISSUE|PLACE|AUTORIT|CONTROL|ENTRIES|ISSUING)$/i.test(w))
        // Exclude surname if we know it
        .filter(w => !surnameHint || w !== surnameHint.toUpperCase())
        // Must have at least one vowel (person names do)
        .filter(w => /[AEIOU]/.test(w))
        // No repeated char patterns (ESIIEE has II and EE, LLLLLL has multiple L's)
        // Count total repeated pairs - if more than 1, likely garbage
        .filter(w => {
          const pairs = (w.match(/(.)\1/g) || []).length;
          return pairs <= 1; // Allow at most 1 double letter (common in names like GARRETT)
        })
        // Must look like a name (not just random letters)
        .filter(w => w.length >= 5 && w.length <= 12)
    )];
    
    // For given names, prefer names that appear after the surname in the text
    // or near "Given Names" / "Prénoms" labels
    const lines = text.split('\n');
    let foundSurname = false;
    for (const line of lines) {
      if (surnameHint && line.includes(surnameHint.toUpperCase())) {
        foundSurname = true;
        continue;
      }
      if (foundSurname || /\bgiven|prenoms?\b/i.test(line)) {
        for (const name of cleanNames) {
          if (line.includes(name)) {
            return name;
          }
        }
      }
    }
  }
  
  if (!mrzName) return visualName || null;
  
  const mrz = mrzName.toUpperCase().replace(/\s+/g, ' ').trim();
  const vis = visualName?.toUpperCase().replace(/\s+/g, ' ').trim() || '';
  const text = fullText.toUpperCase();
  
  // Exact match with visual
  if (vis && mrz === vis) return mrz;
  
  // Count occurrences - use simple includes/indexOf for reliability
  // (word boundary \b can fail with OCR text containing special chars)
  const countOccurrences = (str, name) => {
    let count = 0;
    let pos = 0;
    const upperStr = str.toUpperCase();
    const upperName = name.toUpperCase();
    while ((pos = upperStr.indexOf(upperName, pos)) !== -1) {
      // Check if it's a "word" - not part of a longer name
      const before = pos > 0 ? upperStr[pos - 1] : ' ';
      const after = pos + upperName.length < upperStr.length ? upperStr[pos + upperName.length] : ' ';
      const isWordBefore = !/[A-Z]/.test(before);
      const isWordAfter = !/[A-Z]/.test(after);
      if (isWordBefore && isWordAfter) {
        count++;
      }
      pos++;
    }
    return count;
  };

  // Check if MRZ name has trailing OCR noise character (S, Z, K, L are common < misreads)
  // Look for evidence in the full page text
  const trailingNoiseChars = ['S', 'Z', 'K', 'L'];
  const lastChar = mrz.slice(-1);
  if (mrz.length >= 4 && trailingNoiseChars.includes(lastChar)) {
    const withoutTrailing = mrz.slice(0, -1);
    
    const withCount = countOccurrences(text, mrz);
    const withoutCount = countOccurrences(text, withoutTrailing);
    
    // If name-without-trailing-char appears in the document, prefer it
    // This catches OBAMAS→OBAMA, MICHELLEZ→MICHELLE, etc.
    if (withoutCount > 0 && withoutCount >= withCount) {
      return withoutTrailing;
    }
    
    // If visual OCR found the name without trailing noise char
    if (vis === withoutTrailing) {
      return withoutTrailing;
    }
  }
  
  // Handle trailing double noise chars (SS, ZZ, KK, LL - double chevron misread)
  const doubleNoisePattern = /^(.+?)([SZKL])\2$/;
  const doubleMatch = mrz.match(doubleNoisePattern);
  if (doubleMatch && mrz.length >= 5) {
    const withoutDouble = doubleMatch[1];
    const withoutDoubleCount = countOccurrences(text, withoutDouble);
    if (withoutDoubleCount > 0) {
      return withoutDouble;
    }
  }
  
  // Handle CALLIE → CALLESS (IE becomes ESS)
  if (mrz.endsWith('ESS') && mrz.length >= 6) {
    const ieVersion = mrz.slice(0, -3) + 'IE';
    const ieCount = countOccurrences(text, ieVersion);
    if (ieCount > 0) {
      return ieVersion;
    }
    if (vis === ieVersion) {
      return ieVersion;
    }
  }
  
  // Search full text for clean names that might be the correct version of corrupted MRZ name
  // This handles cases like TAHARREANDRAKCE where TAHAR is at the start but the rest is garbage
  if (text && mrz.length >= 8) {
    // Find all capitalized words (4-20 chars) in the full text
    const cleanNames = [...new Set(
      (text.match(/\b[A-Z]{4,20}\b/g) || [])
        .filter(w => !LABEL_WORDS.has(w))
        .filter(w => !/^(UNITED|STATES|AMERICA|PASSPORT|PASSEPORT|REPUBLIC|INDONESIA|DEPARTMENT|SIGNATURE)$/i.test(w))
    )];
    
    // If MRZ starts with a clean name from the text, use that clean name
    // BUT only if the rest is actual garbage (no spaces = compound name part)
    for (const cleanName of cleanNames) {
      if (mrz.startsWith(cleanName) && cleanName.length >= 4 && cleanName.length < mrz.length) {
        // The MRZ starts with this clean name
        const rest = mrz.slice(cleanName.length);
        // If rest starts with space, it's a compound name (DANIEL FREDERICK), keep full MRZ
        if (rest.startsWith(' ')) {
          continue; // Skip - this is a compound name, not garbage
        }
        if (rest.length >= 3 && /[^AEIOU]/.test(rest[0])) {
          // Rest starts with consonant (no space) - likely garbage, not part of the name
          return cleanName;
        }
      }
    }
  }
  
  // MRZ has trailing OCR noise that visual doesn't have
  if (vis) {
    const ocrNoisePattern = /^(.+?)[SLCKIOZK]{1,3}$/;
    const mrzMatch = mrz.match(ocrNoisePattern);
    if (mrzMatch && mrzMatch[1] === vis) {
      return vis;
    }
    
    // If visual is a clean subset of MRZ
    if (mrz.startsWith(vis) && mrz.length > vis.length) {
      const extra = mrz.slice(vis.length);
      if (/^[SLCKIOZK]{1,4}$/.test(extra)) {
        return vis;
      }
    }
  }
  
  // Default: use MRZ
  return mrz;
}

import { peelCountryBleedFromSurname } from './mrz-parser.js';

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function isLabelWord(value) {
  if (!value) return true;
  const words = String(value).trim().toUpperCase().split(/[\s/\-.,]+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => LABEL_WORDS.has(w) || w.length < 2);
}

function isFillerWord(word) {
  if (!word || word.length < 4) return false;
  if (/^([A-Z])\1{3,}$/i.test(word)) return true;
  const counts = {};
  for (const ch of word.toUpperCase()) counts[ch] = (counts[ch] || 0) + 1;
  return Math.max(...Object.values(counts)) / word.length >= 0.75;
}

export function stripMrzPadding(name) {
  if (!name) return null;
  const words = String(name)
    .replace(/</g, ' ')
    .replace(/[^A-Za-z\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => {
      // Allow single letters (middle initials like "G" in "KUMAR G")
      if (w.length === 1 && /^[A-Z]$/.test(w)) return true;
      // For longer words, require at least 2 chars and not be filler/label
      return w.length >= 2 && !isFillerWord(w) && !LABEL_WORDS.has(w);
    });

  const cleaned = words.join(' ').trim();
  return cleaned.length >= 1 ? cleaned : null;
}

export function sanitizePersonName(name, countryHint = null, peelBleed = false) {
  const stripped = stripMrzPadding(name);
  if (!stripped || !countryHint || !peelBleed) return stripped;
  return peelCountryBleedFromSurname(stripped, countryHint) || stripped;
}

export function sanitizePassportNumber(value) {
  if (!value) return null;
  let v = String(value).replace(/\s/g, '').toUpperCase();
  if (v.length === 10 && /^[A-Z0-9]{9}\d$/.test(v)) {
    v = v.slice(0, 9);
  }
  if (v.length < 6 || v.length > 12) return null;
  if (LABEL_WORDS.has(v) || isLabelWord(v)) return null;
  if (!/^[A-Z0-9]+$/.test(v)) return null;
  return v;
}

export function sanitizeNationality(value) {
  if (!value) return null;
  const v = String(value).replace(/[^A-Za-z]/g, '').toUpperCase();
  if (v.length !== 3 || isLabelWord(v)) return null;
  return v;
}

export function sanitizeDate(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!DATE_RE.test(v)) return null;
  const [dd, mm, yyyy] = v.split('/').map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return v;
}

export function sanitizeSex(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'M' || v === 'MALE') return 'M';
  if (v === 'F' || v === 'FEMALE') return 'F';
  return null;
}

export function sanitizePlace(value) {
  if (!value) return null;
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (v.length < 3 || isLabelWord(v)) return null;
  if (/^(AUTORIT|AUTHORITY|PLACE|ISSUING)/i.test(v)) return null;
  return v;
}

const MRZ_FIELD_KEYS = ['passportNumber', 'surname', 'givenName', 'nationality', 'birthDate', 'sex', 'expiryDate'];
const OCR_EXTRA_KEYS = ['issueDate', 'placeOfBirth', 'placeOfIssue'];

function sanitizeOne(key, value) {
  switch (key) {
    case 'passportNumber':
      return sanitizePassportNumber(value);
    case 'surname':
    case 'givenName':
      return sanitizePersonName(value);
    case 'nationality':
      return sanitizeNationality(value);
    case 'birthDate':
    case 'expiryDate':
    case 'issueDate':
      return sanitizeDate(value);
    case 'sex':
      return sanitizeSex(value);
    case 'placeOfBirth':
    case 'placeOfIssue':
      return sanitizePlace(value);
    default:
      return value ?? null;
  }
}

export function sanitizeMrzFields(fields = {}) {
  const countryHint = fields.nationality || null;
  const out = {};
  for (const key of MRZ_FIELD_KEYS) {
    if (key === 'surname') {
      out[key] = sanitizePersonName(fields[key], countryHint, true);
    } else if (key === 'givenName') {
      out[key] = sanitizePersonName(fields[key], countryHint, false);
    } else {
      out[key] = sanitizeOne(key, fields[key]);
    }
  }
  return out;
}

/**
 * Merge visual OCR fields with MRZ fields.
 * For names: cross-validate using full page text to fix MRZ OCR errors (OBAMAS→OBAMA).
 * For other fields: prefer MRZ when available, visual OCR fills gaps.
 */
export function mergeOcrWithMrz(ocrRaw = {}, mrzSanitized = {}, { mrzValid = false, fullText = '' } = {}) {
  const countryHint = mrzSanitized.nationality || ocrRaw.nationality || null;
  const merged = {};
  
  for (const key of [...MRZ_FIELD_KEYS, ...OCR_EXTRA_KEYS]) {
    let ocrVal = sanitizeOne(key, ocrRaw[key]);
    let mrzVal = mrzSanitized[key] ?? null;
    
    if (key === 'surname') {
      ocrVal = sanitizePersonName(ocrRaw[key], countryHint, true);
      mrzVal = sanitizePersonName(mrzSanitized[key], countryHint, true);
      // Cross-validate surname using full page text to detect OCR errors
      merged[key] = crossValidateName(mrzVal, ocrVal, fullText);
    } else if (key === 'givenName') {
      ocrVal = sanitizePersonName(ocrRaw[key], countryHint, false);
      mrzVal = sanitizePersonName(mrzSanitized[key], countryHint, false);
      // Cross-validate given name (pass isGivenName=true and surname hint for better search)
      merged[key] = crossValidateName(mrzVal, ocrVal, fullText, true, merged.surname);
    } else if (MRZ_FIELD_KEYS.includes(key)) {
      // For non-name fields: prefer MRZ whenever present (more reliable structure)
      merged[key] = mrzVal ?? ocrVal ?? null;
    } else {
      // Extra fields (issueDate, places): only from visual OCR
      merged[key] = ocrVal ?? mrzVal ?? null;
    }
  }
  return merged;
}
