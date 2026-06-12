const OCR_ARTIFACT_RE = /[#@$%^&*<>{}[\]\\|`~]+/g;
const TRAILING_GARBAGE_RE = /[^\u4e00-\u9fff\dA-Za-z()（）\-—、,，.。;；\s]+$/u;
const TRAILING_LATIN_JUNK_RE = /[A-Za-z]{1,4}$/;

export interface NormalizationResult {
  raw: string;
  normalized: string;
  artifactsRemoved: boolean;
  punctuationNormalized: boolean;
}

function normalizePunctuation(text: string): string {
  return text
    .replace(/[：:]/g, '：')
    .replace(/[，,]/g, '，')
    .replace(/[；;]/g, '；')
    .replace(/\s+/g, '')
    .trim();
}

function removeOcrArtifacts(text: string): { text: string; removed: boolean } {
  const before = text;
  let cleaned = text.replace(OCR_ARTIFACT_RE, '');
  cleaned = cleaned.replace(TRAILING_GARBAGE_RE, '');
  cleaned = cleaned.replace(TRAILING_LATIN_JUNK_RE, '');
  return { text: cleaned.trim(), removed: cleaned !== before };
}

export class ChineseFieldNormalizer {
  normalizeCompanyName(raw: string): NormalizationResult {
    const trimmed = raw.trim();
    const withoutArtifacts = trimmed.replace(OCR_ARTIFACT_RE, '').trim();
    const removed = withoutArtifacts !== trimmed;
    const normalized = normalizePunctuation(withoutArtifacts);
    return {
      raw: trimmed,
      normalized,
      artifactsRemoved: removed,
      punctuationNormalized: normalized !== withoutArtifacts,
    };
  }

  normalizeLegalRepresentative(raw: string): NormalizationResult {
    const trimmed = raw.trim().replace(/住所.*/s, '').replace(/注册资本.*/s, '').trim();
    const name = trimmed.match(/^[\u4e00-\u9fff·]{2,4}/)?.[0] || trimmed;
    const { text: withoutArtifacts, removed } = removeOcrArtifacts(name);
    return {
      raw: trimmed,
      normalized: withoutArtifacts,
      artifactsRemoved: removed,
      punctuationNormalized: false,
    };
  }

  normalizeCompanyType(raw: string): NormalizationResult {
    const trimmed = raw.trim().split(/成立日期/)[0]?.trim() || raw.trim();
    const { text: withoutArtifacts, removed } = removeOcrArtifacts(trimmed);
    const normalized = normalizePunctuation(withoutArtifacts).slice(0, 80);
    return {
      raw: trimmed,
      normalized,
      artifactsRemoved: removed,
      punctuationNormalized: normalized !== withoutArtifacts,
    };
  }

  /**
   * Address normalization never invents missing parts.
   * Only removes OCR garbage and normalizes punctuation.
   */
  normalizeAddress(raw: string): NormalizationResult {
    const trimmed = raw.trim().split(/经营范围/)[0]?.trim() || raw.trim();
    const { text: withoutArtifacts, removed } = removeOcrArtifacts(trimmed);
    const normalized = normalizePunctuation(withoutArtifacts).slice(0, 200);
    return {
      raw: trimmed,
      normalized,
      artifactsRemoved: removed,
      punctuationNormalized: normalized !== withoutArtifacts,
    };
  }

  normalizeBusinessScope(raw: string): NormalizationResult {
    const trimmed = raw.trim().split(/登记机关/)[0]?.trim() || raw.trim();
    const { text: withoutArtifacts, removed } = removeOcrArtifacts(trimmed);
    const normalized = withoutArtifacts
      .replace(/\s+/g, '')
      .replace(/[;；]/g, '；')
      .slice(0, 800);
    return {
      raw: trimmed,
      normalized,
      artifactsRemoved: removed,
      punctuationNormalized: true,
    };
  }

  normalizeFreeText(raw: string, maxLength = 100): NormalizationResult {
    const trimmed = raw.trim();
    const { text: withoutArtifacts, removed } = removeOcrArtifacts(trimmed);
    const normalized = withoutArtifacts.slice(0, maxLength);
    return {
      raw: trimmed,
      normalized,
      artifactsRemoved: removed,
      punctuationNormalized: false,
    };
  }
}

let defaultNormalizer: ChineseFieldNormalizer | null = null;

export function getDefaultFieldNormalizer(): ChineseFieldNormalizer {
  if (!defaultNormalizer) defaultNormalizer = new ChineseFieldNormalizer();
  return defaultNormalizer;
}

export function hasUncommonCharacters(value: string | null | undefined): boolean {
  if (!value) return false;
  return OCR_ARTIFACT_RE.test(value)
    || /[^\u4e00-\u9fff\w\s()（）\-—、,，.。:：;；/￥¥元万亿佰仟拾壹贰叁肆伍陆柒捌玖零〇]/u.test(value);
}
