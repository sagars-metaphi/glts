import { normalizeChineseOcrText } from './chineseOcrNormalize.js';

const ID_CARD_SIGNALS = [/居民身份/, /公民身份/, /身份号码/, /身份证号/, /身份证号码/, /姓名/, /签发/];

function isChineseName(name) {
  return /^[\u4e00-\u9fff]{2,4}$/.test(name);
}

function hasLatinCharacters(text) {
  return /[A-Za-z]/.test(text);
}

/**
 * Detect whether OCR text looks like a Chinese national ID card.
 */
export function isChineseIdCardText(rawText) {
  const text = normalizeChineseOcrText(rawText);
  let hits = 0;
  for (const re of ID_CARD_SIGNALS) {
    if (re.test(text)) hits += 1;
  }
  if (hits >= 2) return true;
  if (/身份/.test(text) && /\d{15,18}[\dXx]?/.test(text.replace(/\s/g, ''))) return true;
  if (/\d{15,18}[\dXx]?/.test(text.replace(/\s/g, '')) && /有效期|签发/.test(text)) return true;
  return false;
}

/**
 * Extract holder name from Chinese ID card OCR text.
 * Returns null for Latin-character garbage or missing labels.
 */
export function extractChineseIdCardName(rawText) {
  const text = normalizeChineseOcrText(rawText);
  if (!isChineseIdCardText(text)) return null;

  const labelPatterns = [
    /姓\s*名\s*[:：]?\s*([\u4e00-\u9fff]{2,4})/,
    /姓名\s*[:：]?\s*([\u4e00-\u9fff]{2,4})/,
    /公民身份号码[\s\S]{0,120}?姓\s*名\s*[:：]?\s*([\u4e00-\u9fff]{2,4})/,
    /出生[\s\S]{0,80}?姓\s*名\s*[:：]?\s*([\u4e00-\u9fff]{2,4})/,
    /([\u4e00-\u9fff]{2,4})\s+性\s*别/,
    /([\u4e00-\u9fff]{2,4})\s+[^\n]{0,20}\d{4}\s*年\s*\d{1,2}\s*月/,
  ];

  for (const re of labelPatterns) {
    const match = text.match(re);
    if (!match?.[1]) continue;

    const name = match[1].trim().replace(/\s+/g, '');
    if (!isChineseName(name)) continue;
    if (hasLatinCharacters(name)) continue;
    if (/性别|民族|出生|住址|号码|身份/.test(name)) continue;
    return name;
  }

  return null;
}
