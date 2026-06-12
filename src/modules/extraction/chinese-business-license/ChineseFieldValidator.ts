import type { OcrConfusionConfig } from './ChineseOcrConfusionResolver.js';
import defaultConfig from './config/chinese-ocr-confusion.json' with { type: 'json' };

export interface FieldValidationResult {
  valid: boolean;
  score: number;
  message?: string;
  requiresReview: boolean;
  signals: string[];
}

const CHINESE_NAME_RE = /^[\u4e00-\u9fff·]{2,4}$/;
const LATIN_RE = /[A-Za-z]/;
const MIXED_SYMBOL_RE = /[#@$%^&*<>{}[\]\\|`~]/;
const ADDRESS_ALLOWED_RE = /^[\u4e00-\u9fff\dA-Za-z()（）\-—、,，.。;；\s]+$/u;

function suffixScore(value: string, suffixes: string[]): number {
  for (const suffix of suffixes) {
    if (value.endsWith(suffix)) return 1;
  }
  return 0;
}

export class ChineseFieldValidator {
  private readonly suffixes: string[];
  private readonly companyTypeTemplates: string[];

  constructor(config: OcrConfusionConfig = defaultConfig as OcrConfusionConfig) {
    this.suffixes = config.companyNameSuffixes || [
      '股份有限公司',
      '集团有限公司',
      '有限责任公司',
      '有限公司',
    ];
    this.companyTypeTemplates = config.companyTypeTemplates || ['有限责任公司', '股份有限公司'];
  }

  validateCompanyName(value: string | null | undefined): FieldValidationResult {
    const text = String(value || '').trim();
    const signals: string[] = [];
    if (!text) return { valid: false, score: 0, requiresReview: true, message: 'empty', signals };

    const hasSuffix = suffixScore(text, this.suffixes) > 0;
    if (hasSuffix) signals.push('valid_suffix');
    const reasonableLength = text.length >= 4 && text.length <= 80;
    if (reasonableLength) signals.push('reasonable_length');
    if (LATIN_RE.test(text)) signals.push('contains_latin');

    let score = 0.3;
    if (hasSuffix) score += 0.45;
    if (reasonableLength) score += 0.15;
    if (!LATIN_RE.test(text)) score += 0.1;

    return {
      valid: hasSuffix && reasonableLength && !LATIN_RE.test(text),
      score: Math.min(1, score),
      requiresReview: !hasSuffix || LATIN_RE.test(text),
      signals,
    };
  }

  validateLegalRepresentative(value: string | null | undefined): FieldValidationResult {
    const text = String(value || '').trim();
    const signals: string[] = [];
    if (!text) return { valid: false, score: 0, requiresReview: true, message: 'empty', signals };

    const chineseOnly = CHINESE_NAME_RE.test(text);
    const hasLatin = LATIN_RE.test(text);
    const hasSymbols = MIXED_SYMBOL_RE.test(text);

    if (chineseOnly) signals.push('chinese_name');
    if (hasLatin) signals.push('contains_latin');
    if (hasSymbols) signals.push('contains_symbols');

    let score = 0.2;
    if (chineseOnly) score += 0.65;
    if (!hasLatin) score += 0.1;
    if (!hasSymbols) score += 0.05;

    return {
      valid: chineseOnly && !hasLatin && !hasSymbols,
      score: Math.min(1, score),
      requiresReview: !chineseOnly || hasLatin || hasSymbols,
      signals,
    };
  }

  validateCompanyType(value: string | null | undefined): FieldValidationResult {
    const text = String(value || '').trim();
    const signals: string[] = [];
    if (!text) return { valid: false, score: 0, requiresReview: true, message: 'empty', signals };

    const templateHit = this.companyTypeTemplates.find((t) => text.includes(t));
    if (templateHit) signals.push(`template:${templateHit}`);

    const hasCompanyWord = /公司|企业|合伙/.test(text);
    if (hasCompanyWord) signals.push('company_keyword');

    let score = 0.25;
    if (templateHit) score += 0.5;
    if (hasCompanyWord) score += 0.15;
    if (text.length >= 4 && text.length <= 80) score += 0.1;

    return {
      valid: Boolean(templateHit) && hasCompanyWord,
      score: Math.min(1, score),
      requiresReview: !templateHit,
      signals,
    };
  }

  validateAddress(value: string | null | undefined): FieldValidationResult {
    const text = String(value || '').trim();
    const signals: string[] = [];
    if (!text) return { valid: false, score: 0, requiresReview: true, message: 'empty', signals };

    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const hasGarbage = MIXED_SYMBOL_RE.test(text) || /[^\u4e00-\u9fff\dA-Za-z()（）\-—、,，.。;；\s]/u.test(text);
    const allowedChars = ADDRESS_ALLOWED_RE.test(text);
    const hasAdminMarkers = /[省市区县镇乡村路街道号]/u.test(text);

    if (hasChinese) signals.push('has_chinese');
    if (hasGarbage) signals.push('ocr_garbage');
    if (allowedChars) signals.push('allowed_charset');
    if (hasAdminMarkers) signals.push('admin_markers');

    let score = 0.35;
    if (hasChinese) score += 0.25;
    if (allowedChars) score += 0.15;
    if (!hasGarbage) score += 0.1;
    if (text.length >= 8) score += 0.05;
    if (hasAdminMarkers) score += 0.15;

    const incomplete = !hasAdminMarkers || text.length < 8;

    return {
      valid: hasChinese && allowedChars && text.length >= 2 && hasAdminMarkers,
      score: Math.min(1, score),
      requiresReview: hasGarbage || text.length < 4 || incomplete,
      signals,
    };
  }

  validateBusinessScope(value: string | null | undefined): FieldValidationResult {
    const text = String(value || '').trim();
    const signals: string[] = [];
    if (!text) return { valid: false, score: 0, requiresReview: true, message: 'empty', signals };

    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const hasGarbage = MIXED_SYMBOL_RE.test(text);
    const reasonableLength = text.length >= 4;

    if (hasChinese) signals.push('has_chinese');
    if (hasGarbage) signals.push('ocr_garbage');
    if (reasonableLength) signals.push('reasonable_length');

    let score = 0.3;
    if (hasChinese) score += 0.35;
    if (reasonableLength) score += 0.2;
    if (!hasGarbage) score += 0.15;

    return {
      valid: hasChinese && reasonableLength,
      score: Math.min(1, score),
      requiresReview: hasGarbage || !reasonableLength,
      signals,
    };
  }
}

let defaultValidator: ChineseFieldValidator | null = null;

export function getDefaultFieldValidator(): ChineseFieldValidator {
  if (!defaultValidator) defaultValidator = new ChineseFieldValidator();
  return defaultValidator;
}
