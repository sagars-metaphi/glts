/** Fuzzy keyword targets for OCR pass selection and detection recovery. */
export const CHINESE_LICENSE_KEYWORDS = [
  { canonical: '营业执照', patterns: [/营业\s*执照/, /营\s*业\s*执\s*照/, /营业执照/] },
  {
    canonical: '统一社会信用代码',
    patterns: [/统一\s*社会\s*信用\s*代码/, /社会\s*信用\s*代码/, /信用\s*代码/],
  },
  { canonical: '法定代表人', patterns: [/法定\s*代表\s*人/, /法人\s*代表/, /法定代表/] },
  { canonical: '注册资本', patterns: [/注册\s*资本/, /注册\s*资金/] },
  { canonical: '名称', patterns: [/名\s*称\s*[:：]/, /^名\s*称/m] },
  { canonical: '成立日期', patterns: [/成立\s*日期/, /成立\s*时间/, /设立\s*日期/] },
];

/**
 * Score OCR text for Chinese business license keyword presence.
 * @returns {{ keywordScore: number, keywordHits: string[], detectionConfidence: number }}
 */
export function scoreChineseLicenseKeywords(text) {
  const keywordHits = [];
  let keywordScore = 0;

  for (const kw of CHINESE_LICENSE_KEYWORDS) {
    for (const pattern of kw.patterns) {
      if (pattern.test(text)) {
        keywordScore += kw.canonical === '营业执照' ? 0.22 : 0.14;
        keywordHits.push(kw.canonical);
        break;
      }
    }
  }

  if (/[0-9A-Z]{18}/.test(String(text).replace(/\s/g, ''))) {
    keywordScore += 0.08;
    if (!keywordHits.includes('统一社会信用代码')) {
      keywordHits.push('credit-code-pattern');
    }
  }

  return {
    keywordScore: Math.min(1, keywordScore),
    keywordHits,
    detectionConfidence: Math.min(0.99, keywordScore),
  };
}

/**
 * Combined pass score: OCR engine confidence + keyword recovery.
 */
export function scoreOcrPassResult(text, ocrConfidencePercent, engine = 'paddle') {
  const { keywordScore, keywordHits, detectionConfidence } = scoreChineseLicenseKeywords(text);
  const ocrNorm = Math.min(1, Math.max(0, ocrConfidencePercent / 100));
  const engineBoost = engine === 'paddle' ? 0.05 : 0;
  const composite =
    ocrNorm * 0.35 + keywordScore * 0.55 + engineBoost + (text.length > 80 ? 0.05 : 0);

  return {
    compositeScore: Math.min(0.99, composite),
    keywordScore,
    keywordHits,
    detectionConfidence,
    ocrConfidence: ocrConfidencePercent,
  };
}
