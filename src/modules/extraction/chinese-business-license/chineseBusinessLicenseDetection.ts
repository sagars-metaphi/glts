import { normalizeChineseOcrText } from './chineseOcrNormalize.js';

const DETECTION_SIGNALS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /营业\s*执照/, weight: 0.35, label: '营业执照' },
  { pattern: /统一\s*社会\s*信用\s*代码/, weight: 0.3, label: '统一社会信用代码' },
  { pattern: /法定\s*代表\s*人/, weight: 0.2, label: '法定代表人' },
  { pattern: /注册\s*资本/, weight: 0.15, label: '注册资本' },
  { pattern: /登记\s*机关/, weight: 0.1, label: '登记机关' },
  { pattern: /经营\s*范围/, weight: 0.1, label: '经营范围' },
];

const DETECTION_THRESHOLD = 0.45;

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  matchedSignals: string[];
}

export function detectChineseBusinessLicense(rawText: string): DetectionResult {
  const text = normalizeChineseOcrText(rawText);
  const matchedSignals: string[] = [];
  let confidence = 0;

  for (const signal of DETECTION_SIGNALS) {
    if (signal.pattern.test(text)) {
      confidence += signal.weight;
      matchedSignals.push(signal.label);
    }
  }

  // Credit code pattern alone is a weak but useful signal
  if (/[0-9A-Z]{18}/.test(text.replace(/\s/g, ''))) {
    confidence += 0.08;
    if (!matchedSignals.includes('统一社会信用代码')) {
      matchedSignals.push('18-char code pattern');
    }
  }

  return {
    detected: confidence >= DETECTION_THRESHOLD,
    confidence: Math.min(0.99, confidence),
    matchedSignals,
  };
}
