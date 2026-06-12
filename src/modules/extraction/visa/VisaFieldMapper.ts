import { emptyVisaData, type VisaData } from './VisaData.js';
import type { OcrPartial } from './VisaOcrExtractor.js';

type MrzFields = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

function normalizeSex(v: unknown): 'M' | 'F' | 'U' | null {
  const s = str(v)?.toUpperCase();
  if (!s) return null;
  if (s.startsWith('M')) return 'M';
  if (s.startsWith('F')) return 'F';
  return 'U';
}

export function mapMrzToVisaData(mrz: MrzFields, mrzValid: boolean, mrzBlob: string): Partial<VisaData> {
  return {
    visaNumber: str(mrz.visaNumber) || str(mrz.controlNumber) || str(mrz.documentNumber),
    visaType: str(mrz.visaType),
    issuingCountry: str(mrz.issuingCountry),
    issuingAuthority: str(mrz.issuingPost),
    surname: str(mrz.surname),
    givenNames: str(mrz.givenName) || str(mrz.givenNames),
    nationality: str(mrz.nationality),
    passportNumber: str(mrz.passportNumber),
    sex: normalizeSex(mrz.sex),
    dateOfBirth: str(mrz.birthDate),
    issueDate: str(mrz.issueDate),
    expiryDate: str(mrz.expiryDate),
    entries: str(mrz.entries),
    controlNumber: str(mrz.controlNumber),
    documentNumber: str(mrz.passportNumber) || str(mrz.documentNumber),
    placeOfIssue: str(mrz.issuingPost),
    machineReadableZone: mrzBlob || null,
    mrzValid,
  };
}

export function mapOcrToVisaData(ocr: OcrPartial): Partial<VisaData> {
  return {
    surname: ocr.surname ?? null,
    givenNames: ocr.givenNames ?? null,
    nationality: ocr.nationality ?? null,
    passportNumber: ocr.passportNumber ?? null,
    sex: (ocr.sex as VisaData['sex']) ?? null,
    dateOfBirth: ocr.dateOfBirth ?? null,
    placeOfBirth: ocr.placeOfBirth ?? null,
    issueDate: ocr.issueDate ?? null,
    expiryDate: ocr.expiryDate ?? null,
    entries: ocr.entries ?? null,
    durationOfStay: ocr.durationOfStay ?? null,
    remarks: ocr.remarks ?? null,
    controlNumber: ocr.controlNumber ?? null,
    personalNumber: ocr.personalNumber ?? null,
    visaLabelNumber: ocr.visaLabelNumber ?? null,
    visaNumber: ocr.visaNumber ?? ocr.controlNumber ?? null,
    documentNumber: ocr.documentNumber ?? ocr.passportNumber ?? null,
    hostReference: ocr.hostReference ?? null,
    sponsor: ocr.sponsor ?? null,
    employer: ocr.employer ?? null,
    purposeOfTravel: ocr.purposeOfTravel ?? null,
    placeOfIssue: ocr.placeOfIssue ?? null,
    visaType: ocr.visaType ?? null,
    visaCategory: ocr.visaCategory ?? null,
    issuingCountry: ocr.issuingCountry ?? null,
  };
}

export function mergeVisaData(
  mrz: Partial<VisaData>,
  ocr: Partial<VisaData>,
  rawText: string,
  confidence: number,
): VisaData {
  const base = emptyVisaData();
  const keys = Object.keys(base) as (keyof VisaData)[];

  for (const key of keys) {
    const m = mrz[key];
    const o = ocr[key];
    if (m != null && m !== '') (base as unknown as Record<string, unknown>)[key] = m;
    else if (o != null && o !== '') (base as unknown as Record<string, unknown>)[key] = o;
  }

  base.rawText = rawText;
  base.confidence = confidence;
  return base;
}

export function toLegacyMrzFields(visa: VisaData): Record<string, unknown> {
  return {
    documentCode: 'V',
    issuingCountry: visa.issuingCountry,
    nationality: visa.nationality,
    visaNumber: visa.visaNumber,
    passportNumber: visa.passportNumber,
    surname: visa.surname,
    givenName: visa.givenNames,
    birthDate: visa.dateOfBirth,
    sex: visa.sex,
    expiryDate: visa.expiryDate,
    issueDate: visa.issueDate,
    visaType: visa.visaType,
    controlNumber: visa.controlNumber,
    entries: visa.entries,
    issuingPost: visa.placeOfIssue,
  };
}
