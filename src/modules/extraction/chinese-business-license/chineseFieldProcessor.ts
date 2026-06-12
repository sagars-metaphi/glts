import {
  ChineseOcrConfusionResolver,
  getDefaultConfusionResolver,
  type CharReplacement,
  type ConfusionCandidate,
} from './ChineseOcrConfusionResolver.js';
import {
  ChineseFieldNormalizer,
  getDefaultFieldNormalizer,
  hasUncommonCharacters,
} from './ChineseFieldNormalizer.js';
import {
  ChineseFieldValidator,
  getDefaultFieldValidator,
} from './ChineseFieldValidator.js';
import { computeFieldConfidence } from './ChineseFieldConfidence.js';
import { extractCreditCode } from './creditCodeExtract.js';
import { normalizeRegisteredCapitalValue, parseChineseCapitalToYuan } from './chineseNumberParse.js';
import { normalizeChineseDate } from './ChineseBusinessLicenseValidators.js';

export interface ExtractedFieldResult {
  rawValue: string | null;
  normalizedValue: string | null;
  /** Optional confusion-resolved candidate; raw OCR is never overwritten. */
  normalizedCandidate?: string | null;
  /** @deprecated use normalizedValue */
  value: string | null;
  /** @deprecated use rawValue */
  raw: string | null;
  confidence: number;
  requiresReview: boolean;
  checksumValid?: boolean;
  confusionCorrections: CharReplacement[];
  validationSignals: string[];
}

export interface ProcessedExtractionResult {
  fields: Record<string, ExtractedFieldResult>;
  totalConfusionCorrections: number;
}

interface ProcessContext {
  ocrConfidence: number;
  boundaryExtracted: boolean;
  labelFound: boolean;
  fullText: string;
  fuzzyLabelUsed?: boolean;
  ocrCorruptionDetected?: boolean;
  scopeFallbackUsed?: boolean;
}

function pickConfusionCandidate(
  raw: string,
  resolver: ChineseOcrConfusionResolver,
  validator: ChineseFieldValidator,
  field: 'legalRepresentative' | 'companyType',
): ConfusionCandidate {
  const scorer = (candidate: string, replacements: CharReplacement[]) => {
    const validation =
      field === 'legalRepresentative'
        ? validator.validateLegalRepresentative(candidate)
        : validator.validateCompanyType(candidate);

    const replacementPenalty = replacements.length * 0.08;
    return validation.score - replacementPenalty;
  };

  return resolver.resolveBest(raw, scorer);
}

function buildFieldResult(
  raw: string | null,
  normalized: string | null,
  ctx: ProcessContext,
  options: {
    validationScore: number;
    requiresReview: boolean;
    checksumValid?: boolean;
    patternValid?: boolean;
    confusionCorrections?: CharReplacement[];
    validationSignals?: string[];
    artifactsRemoved?: boolean;
    candidateReconstructed?: boolean;
  },
): ExtractedFieldResult {
  const confusionCorrections = options.confusionCorrections || [];
  const { confidence, requiresReview } = computeFieldConfidence({
    ocrConfidence: ctx.ocrConfidence,
    boundaryExtracted: ctx.boundaryExtracted,
    labelFound: ctx.labelFound,
    validationScore: options.validationScore,
    checksumValid: options.checksumValid,
    patternValid: options.patternValid,
    confusionCorrections: confusionCorrections.length,
    uncommonChars: hasUncommonCharacters(normalized),
    artifactsRemoved: Boolean(options.artifactsRemoved),
    fieldRequiresReview: options.requiresReview,
    fuzzyLabelUsed: ctx.fuzzyLabelUsed,
    ocrCorruptionDetected: ctx.ocrCorruptionDetected,
    candidateReconstructed: options.candidateReconstructed,
    scopeFallbackUsed: ctx.scopeFallbackUsed,
  });

  return {
    rawValue: raw,
    normalizedValue: normalized,
    value: normalized,
    raw,
    confidence,
    requiresReview: requiresReview || options.requiresReview,
    checksumValid: options.checksumValid,
    confusionCorrections,
    validationSignals: options.validationSignals || [],
  };
}

export class ChineseFieldProcessor {
  constructor(
    private readonly resolver = getDefaultConfusionResolver(),
    private readonly normalizer = getDefaultFieldNormalizer(),
    private readonly validator = getDefaultFieldValidator(),
  ) {}

  processCreditCode(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const extracted = extractCreditCode(segment, ctx.fullText);
    return buildFieldResult(
      segment.trim() || null,
      extracted.value,
      ctx,
      {
        validationScore: extracted.checksumValid ? 1 : 0.2,
        requiresReview: !extracted.checksumValid,
        checksumValid: extracted.checksumValid,
        patternValid: extracted.checksumValid,
        candidateReconstructed: extracted.reconstructed,
      },
    );
  }

  processCompanyName(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const base = this.normalizer.normalizeCompanyName(segment.trim());
    const validation = this.validator.validateCompanyName(base.normalized);
    const hasValidSuffix = validation.signals.includes('valid_suffix');

    const result = buildFieldResult(
      base.raw,
      base.normalized,
      ctx,
      {
        validationScore: validation.score,
        requiresReview: validation.requiresReview || !hasValidSuffix,
        patternValid: hasValidSuffix,
        confusionCorrections: [],
        validationSignals: validation.signals,
        artifactsRemoved: base.artifactsRemoved,
      },
    );

    return result;
  }

  processLegalRepresentative(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const base = this.normalizer.normalizeLegalRepresentative(segment);
    const resolved = pickConfusionCandidate(base.normalized, this.resolver, this.validator, 'legalRepresentative');
    const rawValidation = this.validator.validateLegalRepresentative(base.normalized);
    const candidateValidation = this.validator.validateLegalRepresentative(resolved.normalized);
    const candidateDiffers = resolved.normalized !== base.normalized;

    const result = buildFieldResult(
      base.raw,
      base.normalized,
      ctx,
      {
        validationScore: rawValidation.score,
        requiresReview: rawValidation.requiresReview,
        patternValid: rawValidation.valid,
        confusionCorrections: candidateDiffers ? resolved.replacements : [],
        validationSignals: rawValidation.signals,
        artifactsRemoved: base.artifactsRemoved,
      },
    );

    if (candidateDiffers) {
      result.normalizedCandidate = resolved.normalized;
      if (!rawValidation.valid && candidateValidation.valid) {
        result.validationSignals = [...result.validationSignals, 'candidate_available'];
      }
    }

    return result;
  }

  processCompanyType(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const base = this.normalizer.normalizeCompanyType(segment);
    const resolved = pickConfusionCandidate(base.normalized, this.resolver, this.validator, 'companyType');
    const validation = this.validator.validateCompanyType(resolved.normalized);

    return buildFieldResult(
      base.raw,
      resolved.normalized,
      ctx,
      {
        validationScore: validation.score,
        requiresReview: validation.requiresReview,
        patternValid: validation.valid,
        confusionCorrections: resolved.replacements,
        validationSignals: validation.signals,
        artifactsRemoved: base.artifactsRemoved,
      },
    );
  }

  processAddress(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const base = this.normalizer.normalizeAddress(segment);
    const validation = this.validator.validateAddress(base.normalized);

    return buildFieldResult(
      base.raw,
      base.normalized,
      ctx,
      {
        validationScore: validation.score,
        requiresReview: validation.requiresReview,
        patternValid: validation.valid,
        validationSignals: validation.signals,
        artifactsRemoved: base.artifactsRemoved,
      },
    );
  }

  processBusinessScope(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const base = this.normalizer.normalizeBusinessScope(segment);
    const validation = this.validator.validateBusinessScope(base.normalized);

    return buildFieldResult(
      base.raw,
      base.normalized,
      ctx,
      {
        validationScore: validation.score,
        requiresReview: validation.requiresReview,
        patternValid: validation.valid,
        validationSignals: validation.signals,
        artifactsRemoved: base.artifactsRemoved,
      },
    );
  }

  processRegisteredCapital(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const trimmed = segment.trim();
    const resolved = this.resolver.resolveBest(trimmed, (candidate, replacements) => {
      const cnCore = candidate.replace(/(?:元|圆|圓|人民币|RMB|CNY).*$/i, '').trim();
      const yuan = parseChineseCapitalToYuan(cnCore);
      const penalty = replacements.length * 0.08;
      if (yuan != null && yuan > 0) return 0.92 - penalty;

      const fallback = normalizeRegisteredCapitalValue(candidate);
      if (fallback && /万元|亿元/.test(fallback)) return 0.45 - penalty;
      return 0.1 - penalty;
    });
    const normalized = normalizeRegisteredCapitalValue(resolved.normalized);

    return buildFieldResult(
      trimmed || null,
      normalized,
      ctx,
      {
        validationScore: normalized ? 0.85 : 0.2,
        requiresReview: !normalized,
        patternValid: Boolean(normalized),
        confusionCorrections: resolved.replacements,
      },
    );
  }

  processEstablishmentDate(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const datePart =
      segment.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?|\d{4}[./-]\d{1,2}[./-]\d{1,2})/)?.[1]
      || segment.trim();
    const parsed = normalizeChineseDate(datePart);
    const normalized = parsed.valid ? (parsed.normalized ?? null) : datePart.trim();

    return buildFieldResult(
      segment.trim() || null,
      normalized,
      ctx,
      {
        validationScore: parsed.valid ? 0.95 : 0.35,
        requiresReview: !parsed.valid,
        patternValid: parsed.valid,
      },
    );
  }

  processBusinessTerm(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    let normalized: string | null = null;
    if (/长期/.test(segment)) normalized = '长期';
    else {
      const range = segment.match(
        /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*[至到\-—]\s*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|长期))/,
      );
      normalized = range ? range[1].trim() : segment.trim();
    }

    return buildFieldResult(
      segment.trim() || null,
      normalized,
      ctx,
      {
        validationScore: normalized ? 0.8 : 0.2,
        requiresReview: !normalized,
        patternValid: Boolean(normalized),
      },
    );
  }

  processRegistrationAuthority(segment: string, ctx: ProcessContext): ExtractedFieldResult {
    const base = this.normalizer.normalizeFreeText(segment, 100);
    return buildFieldResult(
      base.raw,
      base.normalized,
      ctx,
      {
        validationScore: base.normalized ? 0.75 : 0.2,
        requiresReview: !base.normalized,
        artifactsRemoved: base.artifactsRemoved,
      },
    );
  }

  processField(
    field: string,
    segment: string,
    ctx: ProcessContext,
  ): ExtractedFieldResult {
    switch (field) {
      case 'creditCode':
        return this.processCreditCode(segment, ctx);
      case 'companyName':
        return this.processCompanyName(segment, ctx);
      case 'legalRepresentative':
        return this.processLegalRepresentative(segment, ctx);
      case 'companyType':
        return this.processCompanyType(segment, ctx);
      case 'address':
        return this.processAddress(segment, ctx);
      case 'businessScope':
        return this.processBusinessScope(segment, ctx);
      case 'registeredCapital':
        return this.processRegisteredCapital(segment, ctx);
      case 'establishmentDate':
        return this.processEstablishmentDate(segment, ctx);
      case 'businessTerm':
        return this.processBusinessTerm(segment, ctx);
      case 'registrationAuthority':
        return this.processRegistrationAuthority(segment, ctx);
      default:
        return buildFieldResult(segment, segment, ctx, { validationScore: 0.5, requiresReview: true });
    }
  }
}

let defaultProcessor: ChineseFieldProcessor | null = null;

export function getDefaultFieldProcessor(): ChineseFieldProcessor {
  if (!defaultProcessor) defaultProcessor = new ChineseFieldProcessor();
  return defaultProcessor;
}

export function processExtractedSegments(
  segments: Record<string, {
    rawSegment: string;
    boundaryExtracted: boolean;
    labelFound: boolean;
    fuzzyLabelUsed?: boolean;
    matchedLabelText?: string | null;
    scopeFallbackUsed?: boolean;
  }>,
  fullText: string,
  ocrConfidence: number,
  processor: ChineseFieldProcessor = getDefaultFieldProcessor(),
): ProcessedExtractionResult {
  const fields: Record<string, ExtractedFieldResult> = {};
  let totalConfusionCorrections = 0;

  for (const [field, meta] of Object.entries(segments)) {
    const ctx: ProcessContext = {
      ocrConfidence,
      boundaryExtracted: meta.boundaryExtracted,
      labelFound: meta.labelFound,
      fullText,
      fuzzyLabelUsed: meta.fuzzyLabelUsed,
      ocrCorruptionDetected: meta.fuzzyLabelUsed,
      scopeFallbackUsed: meta.scopeFallbackUsed,
    };
    const result = processor.processField(field, meta.rawSegment, ctx);
    fields[field] = result;
    totalConfusionCorrections += result.confusionCorrections.length;
  }

  return { fields, totalConfusionCorrections };
}
