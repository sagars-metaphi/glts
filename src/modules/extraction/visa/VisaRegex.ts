/** ISO 3166 alpha-3 country codes commonly seen on visas */
export const ISO_ALPHA3 = new Set([
  'USA', 'GBR', 'CAN', 'AUS', 'DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'CHE',
  'IND', 'CHN', 'JPN', 'KOR', 'SGP', 'MYS', 'THA', 'PHL', 'IDN', 'VNM',
  'ARE', 'SAU', 'QAT', 'KWT', 'BHR', 'OMN', 'EGY', 'ZAF', 'BRA', 'MEX',
  'RUS', 'UKR', 'POL', 'SWE', 'NOR', 'DNK', 'FIN', 'IRL', 'PRT', 'GRC',
  'TUR', 'ISR', 'NZL', 'HKG', 'TWN', 'PAK', 'BGD', 'LKA', 'NPL', 'KEN',
]);

export const DATE_PATTERNS = [
  /\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})\b/g,
  /\b(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})\b/gi,
  /\b(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})\b/g,
];

export const MRZ_LINE1 = /^V<[A-Z<]{42,}$/;
export const MRZ_LINE2_44 = /^[A-Z0-9<]{42,44}$/;
export const MRZ_LINE2_36 = /^[A-Z0-9<]{34,36}$/;

export interface VisaLabelRule {
  field: string;
  labels: string[];
  maxLen?: number;
  pattern?: RegExp;
}

/** Multilingual label variants for OCR matching */
export const VISA_LABEL_RULES: VisaLabelRule[] = [
  { field: 'surname', labels: ['SURNAME', 'FAMILY NAME', 'NOM', 'APELLIDOS', '姓', 'اللقب'] },
  { field: 'givenNames', labels: ['GIVEN NAMES', 'GIVEN NAME', 'VEN NAMES', 'FIRST NAME', 'PRENOM', 'PRÉNOM', '名', 'الاسم'] },
  { field: 'nationality', labels: ['NATIONALITY', 'ATIONALITY', 'NATIONALITE', 'NACIONALIDAD', '国籍', 'الجنسية'] },
  { field: 'passportNumber', labels: ['PASSPORT NO', 'PASSPORT NUMBER', 'SSPORT NO', 'A\\SSPORT NO', 'PASSPORT #', 'رقم الجواز'] },
  { field: 'dateOfBirth', labels: ['DATE OF BIRTH', 'ATE OF BIRTH', 'DOB', 'BIRTH DATE', 'DATE DE NAISSANCE', 'تاريخ الميلاد'] },
  { field: 'issueDate', labels: ['ISSUE DATE', 'SUE DATE', 'DATE OF ISSUE', 'DATE DE DELIVRANCE', 'تاريخ الإصدار'] },
  { field: 'expiryDate', labels: ['EXPIRY DATE', 'XPIRY DATE', 'EXPIRATION DATE', 'DATE OF EXPIRY', 'VALID UNTIL', 'تاريخ الانتهاء'] },
  { field: 'entries', labels: ['ENTRIES', 'NTRIES', 'NUMBER OF ENTRIES', 'ENTRÉES', 'عدد الدخول'] },
  { field: 'controlNumber', labels: ['CONTROL NO', 'ONTROL NO', 'CONTROL NUMBER', 'VISA CONTROL'] },
  { field: 'placeOfIssue', labels: ['PLACE OF ISSUE', 'ACE OF ISSUE', 'ISSUED AT', 'LIEU DE DELIVRANCE', 'مكان الإصدار'] },
  { field: 'visaType', labels: ['VISA TYPE', 'SA TYPE', 'VISA CLASS', 'TYPE DE VISA'] },
  { field: 'durationOfStay', labels: ['DURATION OF STAY', 'STAY', 'DURÉE DE SÉJOUR', 'مدة الإقامة'] },
  { field: 'purposeOfTravel', labels: ['PURPOSE', 'PURPOSE OF TRAVEL', 'MOTIF', 'OBJET DU VOYAGE'] },
  { field: 'sponsor', labels: ['SPONSOR', 'HOST', 'INVITING PARTY', 'الكفيل'] },
  { field: 'employer', labels: ['EMPLOYER', 'COMPANY', 'ORGANISATION'] },
  { field: 'personalNumber', labels: ['PERSONAL NO', 'PERSONAL NUMBER', 'NATIONAL ID'] },
  { field: 'remarks', labels: ['REMARKS', 'ANNOTATIONS', 'OBSERVATIONS'] },
];

export function buildLabelRegex(label: string, maxLen = 64): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?!\\w)\\s*[:：\\/\\.\\-]?\\s*([^\\n]{1,${maxLen}})`, 'i');
}

export function fuzzyCountryCode(token: string): string | null {
  const s = String(token || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 3 && ISO_ALPHA3.has(s)) return s;
  const aliases: Record<string, string> = {
    US: 'USA', UK: 'GBR', GB: 'GBR', UAE: 'ARE', IN: 'IND', CN: 'CHN',
    DE: 'DEU', FR: 'FRA', AU: 'AUS', CA: 'CAN', JP: 'JPN', KR: 'KOR',
  };
  return aliases[s] || null;
}
