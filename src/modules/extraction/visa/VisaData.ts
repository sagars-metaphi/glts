export type VisaSex = 'M' | 'F' | 'U';

export interface VisaData {
  visaNumber: string | null;
  visaType: string | null;
  visaCategory: string | null;
  issuingCountry: string | null;
  issuingAuthority: string | null;
  surname: string | null;
  givenNames: string | null;
  nationality: string | null;
  passportNumber: string | null;
  sex: VisaSex | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  entries: string | null;
  durationOfStay: string | null;
  remarks: string | null;
  controlNumber: string | null;
  personalNumber: string | null;
  visaLabelNumber: string | null;
  documentNumber: string | null;
  hostReference: string | null;
  sponsor: string | null;
  employer: string | null;
  purposeOfTravel: string | null;
  placeOfIssue: string | null;
  machineReadableZone: string | null;
  mrzValid: boolean;
  confidence: number;
  rawText: string | null;
}

export interface VisaExtractionMetrics {
  fieldExtractionRate: number;
  ocrConfidence: number;
  mrzConfidence: number;
  populatedFields: string[];
  missingFields: string[];
  totalFields: number;
}

export interface VisaExtractionResult {
  success: boolean;
  type: 'visa';
  detectedAsVisa: boolean;
  mrzValid: boolean;
  mrzInvalidReason: string | null;
  visa: VisaData;
  metrics: VisaExtractionMetrics;
  /** @deprecated use visa + metrics */
  mrzData: {
    documentType: string;
    documentCode: string | null;
    mrzValid: boolean;
    mrzInvalidReason: string | null;
    format: string | null;
    fields: Record<string, unknown>;
  } | null;
  visaParsed: Record<string, unknown> | null;
  visaOcrFields: Record<string, unknown> | null;
  rawText: string | null;
}

export const VISA_CORE_FIELDS: (keyof VisaData)[] = [
  'visaNumber',
  'surname',
  'givenNames',
  'nationality',
  'passportNumber',
  'sex',
  'dateOfBirth',
  'issueDate',
  'expiryDate',
  'entries',
  'issuingCountry',
  'documentNumber',
  'controlNumber',
  'personalNumber',
  'mrzValid',
];

export function emptyVisaData(): VisaData {
  return {
    visaNumber: null,
    visaType: null,
    visaCategory: null,
    issuingCountry: null,
    issuingAuthority: null,
    surname: null,
    givenNames: null,
    nationality: null,
    passportNumber: null,
    sex: null,
    dateOfBirth: null,
    placeOfBirth: null,
    issueDate: null,
    expiryDate: null,
    entries: null,
    durationOfStay: null,
    remarks: null,
    controlNumber: null,
    personalNumber: null,
    visaLabelNumber: null,
    documentNumber: null,
    hostReference: null,
    sponsor: null,
    employer: null,
    purposeOfTravel: null,
    placeOfIssue: null,
    machineReadableZone: null,
    mrzValid: false,
    confidence: 0,
    rawText: null,
  };
}
