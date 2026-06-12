export interface ConfidentField {
  rawValue: string | null;
  normalizedValue: string | null;
  normalizedCandidate?: string | null;
  /** @deprecated use normalizedValue */
  value: string | null;
  /** @deprecated use rawValue */
  raw?: string | null;
  confidence: number;
  requiresReview?: boolean;
  checksumValid?: boolean;
}

export interface ChineseBusinessLicenseFields {
  companyName: ConfidentField;
  creditCode: ConfidentField;
  legalRepresentative: ConfidentField;
  companyType: ConfidentField;
  registeredCapital: ConfidentField;
  establishmentDate: ConfidentField;
  businessTerm: ConfidentField;
  address: ConfidentField;
  businessScope: ConfidentField;
  registrationAuthority: ConfidentField;
}

export interface ExtractionDebugEntry {
  field: string;
  startLabel: string;
  nextLabel: string | null;
  rawSegment: string;
  raw: string | null;
  finalValue: string | null;
  confidence: number;
  requiresReview: boolean;
  checksumValid?: boolean;
  confusionCorrections: Array<{ index: number; from: string; to: string }>;
  validationSignals: string[];
  boundaryExtracted: boolean;
  labelFound: boolean;
}

export interface OcrDebugInfo {
  ocrPasses: unknown[];
  bestPass: string;
  bestConfidence: number;
  orientation: number;
  deskewAngle?: number;
  engine?: string;
  keywordHits?: string[];
  rawChineseText: string;
}

export interface ChineseBusinessLicenseResult {
  success: boolean;
  type: 'chinese-business-license';
  detected: boolean;
  detectionConfidence: number;
  matchedSignals: string[];
  ocrUsed: boolean;
  ocrConfidence: number;
  ocrWarning: {
    type: string;
    message: string;
    confidence: number;
    recommendation?: string;
  } | null;
  ocrDebug: OcrDebugInfo;
  extractionDebug: ExtractionDebugEntry[];
  savedOcrPath: string | null;
  pageCount: number;
  validation: {
    valid: boolean;
    requiredPresent: boolean;
    creditValid: boolean;
    fieldValidation: Record<string, unknown>;
  };
  fields: ChineseBusinessLicenseFields;
  requiresManualReview: boolean;
  reviewReasons: string[];
  legalRepresentativeVerified: boolean | null;
  idCardPresent: boolean;
  idCardName: string | null;
  rawTextLength: number;
}
