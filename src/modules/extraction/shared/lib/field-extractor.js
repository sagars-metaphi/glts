const LABEL_STOP_WORDS = new Set([
  'PASSPORT', 'PASSEPORT', 'PASAPORTE', 'SURNAME', 'NOM', 'NAZWISKO', 'IMIONA', 'IMIE',
  'APELLIDOS', 'GIVEN', 'NAMES', 'PRENOMS', 'NOMBRES', 'NATIONALITY', 'NATIONALITE', 'NACIONALIDAD',
  'SEX', 'SEXE', 'SEXO', 'GENDER', 'BIRTH', 'NAISSANCE', 'NACIMIENTO',
  'ISSUE', 'DELIVRANCE', 'EXPEDICION', 'EXPIRY', 'EXPIRATION', 'DATE',
  'AUTHORITY', 'AUTORITE', 'AUTORIDAD', 'PLACE', 'LIEU', 'LUGAR',
  'SIGNATURE', 'HUSBAND', 'WIFE', 'FATHER', 'MOTHER', 'DOCUMENT', 'NUMBER', 'NO',
  'WARGANEGARA', 'TARIKH', 'LAHIR', 'TEMPAT', 'JANTINA', 'DIKELUARKAN',
  'AUTORIT', 'AUTORITE', 'AUTHORITY', 'FECHA', 'FACIMIENTO', 'NAFSSAPCE', 'PRENOM',
]);

function isLabelJunk(value) {
  if (!value) return true;
  const v = String(value).trim().toUpperCase();
  const words = v.split(/[\s/\-.:,]+/);
  return words.every(w => LABEL_STOP_WORDS.has(w) || w.length < 2 || /^\d+$/.test(w));
}

function cleanOcrField(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  if (isLabelJunk(cleaned)) return null;
  return cleaned;
}

function pick(regex, text, group = 1) {
  const m = text.match(regex);
  return m?.[group]?.trim() || null;
}

function pickAll(regex, text, group = 1) {
  return [...text.matchAll(new RegExp(regex.source, regex.flags.includes('i') ? 'gi' : 'g'))].map(
    (m) => (m[group] ?? m[0])?.trim()
  ).filter(Boolean);
}

function cleanValue(value) {
  if (value == null) return null;
  return String(value).split(/\n/)[0].replace(/\s+/g, ' ').trim() || null;
}

function trimAtNextLabel(value) {
  if (!value) return null;
  return value
    .split(/\b(?:Tarikh|Date\s*of|Nationality|Warganegara|Sex|Passport|Place|Issuing|Control|Entries)\b/i)[0]
    .trim();
}

function isPlausibleDocId(value) {
  if (!value) return false;
  const v = String(value).replace(/\s/g, '').toUpperCase();
  if (v.length < 6 || v.length > 12) return false;
  if (!/\d/.test(v)) return false;
  if (/^(NATIONALITY|PASSPORT|NUMBER|NAME|CONTROL|ISSUING|SIGNATURE|DOCUMENT)$/i.test(v)) return false;
  if (isLabelJunk(v)) return false;
  if (/^[A-Z]{7,}$/.test(v) && !/\d/.test(v)) return false;
  return /^[A-Z0-9]+$/.test(v);
}

function isPlausiblePersonName(value) {
  if (!value) return false;
  const v = cleanValue(value);
  if (!v || v.length < 2) return false;
  if (isLabelJunk(v)) return false;
  return /^[A-Z\s.'-]+$/i.test(v) && !/^(PASSPORT|SURNAME|GIVEN|NAME|DATE|ISSUING|PLACE|COUNTRY|AUTHORITY|SIGNATURE|HUSBAND|WIFE|FATHER|MOTHER)$/i.test(v);
}

// Clean and normalize dates to DD/MM/YYYY
function normalizeDate(rawDate) {
  if (!rawDate) return null;
  
  // Clean string
  const clean = rawDate.replace(/\s+/g, ' ').trim().toUpperCase();

  // Try to find a date matching: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const numericMatch = clean.match(/\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})\b/);
  if (numericMatch) {
    const day = numericMatch[1].padStart(2, '0');
    const month = numericMatch[2].padStart(2, '0');
    let year = numericMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) >= 50 ? `19${year}` : `20${year}`;
    }
    return `${day}/${month}/${year}`;
  }

  // Try to find a date matching: DD MMM YYYY (e.g. 23 SEP 1959)
  const monthNames = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', JUNE: '06',
    JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12'
  };
  const textMonthMatch = clean.match(/\b(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})\b/);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const monthWord = textMonthMatch[2];
    const month = monthNames[monthWord];
    if (month) {
      let year = textMonthMatch[3];
      if (year.length === 2) {
        year = parseInt(year, 10) >= 50 ? `19${year}` : `20${year}`;
      }
      return `${day}/${month}/${year}`;
    }
  }

  return null;
}

function isPlausibleRawDate(raw) {
  if (!raw) return false;
  return /\b\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\b/.test(raw) ||
    /\b\d{1,2}\s+[A-Z]{3,9}\s+\d{2,4}\b/i.test(raw);
}

export function extractFieldsFromOcrText(rawText) {
  const text = (rawText || '').replace(/\r/g, '\n');
  const result = {};

  // 1. Passport Number
  const idCandidates = [
    pick(/\bpassport\s*number\b[^A-Z0-9]{0,15}([A-Z0-9]{6,15})/i, text),
    pick(/\bpassport\s*no\.?\b[^A-Z0-9]{0,15}([A-Z0-9]{6,15})/i, text),
    pick(/\bdocument\s*no\.?\b[^A-Z0-9]{0,15}([A-Z0-9]{6,15})/i, text),
    pick(/\bno\.?\s*pengenalan\b[^A-Z0-9]{0,20}([A-Z0-9]{5,15})/i, text),
    pick(/\bpassport\s*number\b[^\n]*\n\s*([0-9]{8,10})/i, text),
    pick(/\b(\d{9})\d?[A-Z]{3}\d{6}/i, text),
  ];
  // Add generic alphanumeric tokens from text that could be passport numbers
  const genericTokens = (text.match(/\b[A-Z0-9]{7,9}\b/g) || []).filter(
    (t) => !LABEL_STOP_WORDS.has(t.toUpperCase())
  );
  idCandidates.push(...genericTokens);

  for (const c of idCandidates) {
    if (isPlausibleDocId(c)) {
      result.passportNumber = String(c).replace(/\s/g, '').toUpperCase();
      break;
    }
  }

  // 2. Surname / Family Name
  // Look for names near "Surname" label, handling noisy OCR
  const surnameCandidates = [
    pick(/\bsurname\b[^\n]{0,50}\n\s*([A-Za-z'-]{2,40})/i, text),
    pick(/\bnom\s*\/\s*surname\b[^\n]{0,50}\n\s*([A-Za-z'-]{2,40})/i, text),
    pick(/\bsurname\b\s*[=:\-]?\s*([A-Za-z'-]{2,40})/i, text),
    pick(/\bfamily\s*name\b\s*[=:\-]?\s*([A-Za-z'-]{2,40})/i, text),
    pick(/\bnazwisko\b[^\n]*\n?\s*([A-Za-z'-]{2,40})/i, text),
    pick(/\bnazwisko\s*\/\s*surname\b[^\n]{0,50}\n\s*([A-Za-z'-]{2,40})/i, text),
    pick(/\n[^\n]*\b([A-Z]{4,24})\s*\n\s*[A-Z][A-Z\s]{2,35}\s*:/m, text),
  ];
  
  // Also look for clean capitalized words (4-15 chars) after surname-related labels
  // This handles noisy OCR like "FE oS eT NELSONS" where NELSON is embedded in garbage
  const surnameLineMatch = text.match(/surname[^\n]*\n([^\n]*)/i);
  if (surnameLineMatch) {
    const lineAfterSurname = surnameLineMatch[1];
    // Find capitalized words that look like surnames
    const capsWords = lineAfterSurname.match(/\b([A-Z]{4,15})\b/g) || [];
    for (const word of capsWords) {
      if (!LABEL_STOP_WORDS.has(word) && isPlausiblePersonName(word)) {
        // Strip trailing S if it looks like OCR noise (OBAMAS → OBAMA)
        // Only if the word ends in vowel+S pattern common in OCR errors
        let cleaned = word;
        if (/[AEIOU]S$/i.test(word) && word.length >= 5) {
          // Keep the S for now, let cross-validation decide
        }
        surnameCandidates.unshift(cleaned);
      }
    }
  }
  
  for (const c of surnameCandidates) {
    const cleaned = trimAtNextLabel(cleanValue(c));
    if (cleaned && isPlausiblePersonName(cleaned)) {
      result.surname = cleaned.toUpperCase();
      break;
    }
  }

  // 3. Given Name
  const givenCandidates = [
    pick(/\bgiven\s*names?\b[^A-Za-z]{0,12}([A-Za-z\s]+)/i, text),
    pick(/\bfirst\s*names?\b[^A-Za-z]{0,12}([A-Za-z\s]+)/i, text),
    pick(/\bimiona?\b[^\n]*\n?\s*([A-Za-z\s]+)/i, text),
    pick(/\bnama\s*\/\s*name\b[^\n]*\n?\s*([A-Za-z\s]+)/i, text),
    pick(/\bnazwisko\b[^\n]*\n[^\n]*\n\s*([A-Za-z\s]{2,40})/i, text),
    pick(/\n[^\n]*\b[A-Z]{4,24}\s*\n\s*([A-Z][A-Z\s]{2,35})\s*:/m, text),
  ];
  
  // Look for capitalized words after "Given Names" or "Prénoms" labels  
  const givenLineMatch = text.match(/(?:given\s*names?|pr[eé]noms?|nombres)[^\n]*\n([^\n]*)/i);
  if (givenLineMatch) {
    const lineAfterGiven = givenLineMatch[1];
    const capsWords = lineAfterGiven.match(/\b([A-Z]{3,15})\b/g) || [];
    for (const word of capsWords) {
      if (!LABEL_STOP_WORDS.has(word) && isPlausiblePersonName(word)) {
        givenCandidates.unshift(word);
      }
    }
  }
  
  for (const c of givenCandidates) {
    const cleaned = trimAtNextLabel(cleanValue(c));
    if (cleaned && isPlausiblePersonName(cleaned)) {
      result.givenName = cleaned.toUpperCase();
      break;
    }
  }

  // Fallback Full Name
  if (!result.givenName && !result.surname) {
    const nameMatch = pick(/\bname\b\s*[:\-]?\s*([A-Za-z\s]+)/i, text);
    const cleanedName = trimAtNextLabel(cleanValue(nameMatch));
    if (cleanedName && isPlausiblePersonName(cleanedName)) {
      result.fullName = cleanedName.toUpperCase();
      const parts = result.fullName.split(/\s+/);
      if (parts.length > 1) {
        result.surname = parts[parts.length - 1];
        result.givenName = parts.slice(0, -1).join(' ');
      } else {
        result.givenName = result.fullName;
      }
    }
  } else {
    result.fullName = [result.givenName, result.surname].filter(Boolean).join(' ');
  }

  // 4. Nationality
  const nationalityCandidates = [
    pick(/\bnationality\b\s*[:\-]?\s*([A-Za-z]+)/i, text),
    pick(/\bwarganegara\b\s*[:\-]?\s*([A-Za-z]+)/i, text),
  ];
  // Add common country adjectives/nationalities if mentioned in text
  const commonNationalities = ['INDIAN', 'AMERICAN', 'BRITISH', 'CANADIAN', 'AUSTRALIAN', 'MALAYSIAN', 'FRENCH', 'GERMAN', 'POLISH', 'ITALIAN', 'SPANISH'];
  for (const nat of commonNationalities) {
    if (text.toUpperCase().includes(nat)) {
      nationalityCandidates.push(nat);
    }
  }
  for (const c of nationalityCandidates) {
    const cleaned = trimAtNextLabel(cleanValue(c));
    if (cleaned && cleaned.length >= 3 && !/^(NATIONALITY|WARGANEGARA|PASSPORT)$/i.test(cleaned)) {
      result.nationality = cleaned.toUpperCase();
      break;
    }
  }

  // 5. Sex / Gender
  const sexMatch = pick(/\b(?:sex|gender|jantina)\b[^A-Za-z]{0,12}([MF]|MALE|FEMALE)\b/i, text);
  if (sexMatch) {
    const cleanSex = sexMatch.trim().toUpperCase();
    if (cleanSex.startsWith('M')) result.sex = 'M';
    else if (cleanSex.startsWith('F')) result.sex = 'F';
  } else {
    // Loose lookup
    const rawSex = text.toUpperCase();
    if (/\bMALE\b/.test(rawSex) || /\bM\b/.test(rawSex)) result.sex = 'M';
    else if (/\bFEMALE\b/.test(rawSex) || /\bF\b/.test(rawSex)) result.sex = 'F';
  }

  // 6. Dates (Birth, Issue, Expiry)
  const dobMatch = 
    pick(/\bdate\s*of\s*birth\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bdate\s*of\s*birth[^\n]*\n\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\btarikh\s*lahir\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bdob\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bdata\s*urodzenia\b[^\n]*\n?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\n\s*(\d{1,2}\s+[A-Z]{3}\/?[A-Z]{0,3}\s+\d{4})/i, text);
  result.birthDate = isPlausibleRawDate(dobMatch) ? normalizeDate(dobMatch) : null;

  const expiryMatch = 
    pick(/\bdate\s*of\s*expiry\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bdate\s*of\s*expiry[^\n]*\n\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\btarikh\s*tamat\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bexpiry\s*date\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bvalid\s*until\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bdata\s*waznosci\b[^\n]*\n?\s*([\d\w\s.\-/]+)/i, text);
  const expiryDates = pickAll(/\b(\d{1,2}\s+[A-Z]{3}\/?[A-Z]{0,3}\s+\d{4})\b/gi, text);
  const expiryFromList = expiryDates.length >= 2 ? expiryDates[expiryDates.length - 1] : null;
  const expiryRaw = expiryMatch || expiryFromList;
  result.expiryDate = isPlausibleRawDate(expiryRaw) ? normalizeDate(expiryRaw) : null;

  const issueMatch = 
    pick(/\bdate\s*of\s*issue\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bdate\s*of\s*issue[^\n]*\n\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\btarikh\s*dikeluarkan\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text) ||
    pick(/\bissue\s*date\b\s*[:\-]?\s*([\d\w\s.\-/]+)/i, text);
  result.issueDate = isPlausibleRawDate(issueMatch) ? normalizeDate(issueMatch) : null;

  // 7. Place of Birth
  const pobMatch = 
    pick(/\bplace\s*of\s*birth\b\s*[:\-]?\s*([A-Za-z\s,.\-]+)/i, text) ||
    pick(/\btempat\s*lahir\b\s*[:\-]?\s*([A-Za-z\s,.\-]+)/i, text);
  result.placeOfBirth = trimAtNextLabel(cleanValue(pobMatch));

  // 8. Place of Issue / Authority
  const poiMatch = 
    pick(/\bplace\s*of\s*issue\b\s*[:\-]?\s*([A-Za-z\s,.\-]+)/i, text) ||
    pick(/\bauthority\b\s*[:\-]?\s*([A-Za-z\s,.\-]+)/i, text) ||
    pick(/\bpejabat\s*pengeluar\b\s*[:\-]?\s*([A-Za-z\s,.\-]+)/i, text);
  result.placeOfIssue = trimAtNextLabel(cleanValue(poiMatch));

  // Remove null/junk properties
  return Object.fromEntries(
    Object.entries(result)
      .map(([k, v]) => [k, cleanOcrField(v)])
      .filter(([, v]) => v != null && v !== '')
  );
}
