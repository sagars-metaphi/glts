export interface FieldConfidenceInput {
  ocrConfidence: number;
  boundaryExtracted: boolean;
  labelFound: boolean;
  validationScore: number;
  checksumValid?: boolean;
  patternValid?: boolean;
  confusionCorrections: number;
  uncommonChars: boolean;
  artifactsRemoved: boolean;
  fieldRequiresReview: boolean;
  fuzzyLabelUsed?: boolean;
  ocrCorruptionDetected?: boolean;
  candidateReconstructed?: boolean;
  scopeFallbackUsed?: boolean;
}

export interface FieldConfidenceResult {
  confidence: number;
  requiresReview: boolean;
}

const REVIEW_THRESHOLD = 0.65;

export function computeFieldConfidence(input: FieldConfidenceInput): FieldConfidenceResult {
  const ocrFactor = Math.min(1, Math.max(0, input.ocrConfidence / 100));
  let score = ocrFactor * 0.28 + input.validationScore * 0.35 + 0.2;

  if (input.boundaryExtracted) score += 0.1;
  if (input.labelFound) score += 0.05;
  if (input.checksumValid) score += 0.15;
  if (input.patternValid) score += 0.06;
  if (input.fuzzyLabelUsed) score -= 0.06;
  if (input.ocrCorruptionDetected) score -= 0.08;
  if (input.candidateReconstructed) score -= 0.05;
  if (input.scopeFallbackUsed) score -= 0.07;
  if (input.confusionCorrections > 0) {
    score -= Math.min(0.22, input.confusionCorrections * 0.04);
  }
  if (input.uncommonChars) score -= 0.1;
  if (input.artifactsRemoved) score -= 0.04;
  if (!input.labelFound && !input.scopeFallbackUsed) score -= 0.12;
  if (ocrFactor < 0.75) score -= 0.08;

  const confidence = Math.round(Math.min(0.99, Math.max(0.05, score)) * 1000) / 1000;
  const requiresReview =
    input.fieldRequiresReview
    || confidence < REVIEW_THRESHOLD
    || (input.checksumValid === false && input.checksumValid !== undefined);

  return { confidence, requiresReview };
}
