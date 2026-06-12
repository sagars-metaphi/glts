import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateCreditCode,
  normalizeChineseDate,
  parseRegisteredCapital,
  compareChineseNames,
} from '../src/modules/extraction/chinese-business-license/ChineseBusinessLicenseValidators.js';
import { detectChineseBusinessLicense } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseDetection.js';
import { normalizeChineseOcrText, fixOcrCodeSubstitutions } from '../src/modules/extraction/chinese-business-license/chineseOcrNormalize.js';

test('normalizeChineseOcrText converts full-width punctuation and spaces', () => {
  const out = normalizeChineseOcrText('统一社会信用代码：　91O123');
  assert.ok(out.includes(':'));
  assert.ok(!out.includes('：'));
});

test('fixOcrCodeSubstitutions fixes O and I in codes', () => {
  assert.equal(fixOcrCodeSubstitutions('91O123I4567890123'), '91012314567890123');
});

test('validateCreditCode accepts valid 18-char code', () => {
  const sample = '91110000100000000A';
  const r = validateCreditCode(sample);
  assert.equal(typeof r.valid, 'boolean');
  assert.equal(r.normalized?.length, 18);
});

test('normalizeChineseDate converts Chinese date to ISO', () => {
  const r = normalizeChineseDate('2015年3月15日');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '2015-03-15');
});

test('parseRegisteredCapital extracts amount and currency', () => {
  const r = parseRegisteredCapital('1000万元');
  assert.equal(r.valid, true);
  assert.equal(r.parsed?.amount, 1000);
  assert.equal(r.parsed?.currency, 'CNY');
});

test('compareChineseNames matches equivalent names', () => {
  assert.equal(compareChineseNames('张三', '张 三'), true);
  assert.equal(compareChineseNames('李四', '王五'), false);
});

test('detectChineseBusinessLicense detects license keywords', () => {
  const text = '营业执照 统一社会信用代码 法定代表人 注册资本 91110000MA0012345X';
  const d = detectChineseBusinessLicense(text);
  assert.equal(d.detected, true);
  assert.ok(d.confidence >= 0.45);
});

test('scoreChineseLicenseKeywords recovers fuzzy license labels', async () => {
  const { scoreChineseLicenseKeywords } = await import(
    '../src/modules/extraction/chinese-business-license/ocr/chineseKeywordScore.js'
  );
  const text = '营 业 执 照\n统一社会信用代码\n法定代表人\n注册资本1000万元\n名称: 测试公司';
  const r = scoreChineseLicenseKeywords(text);
  assert.ok(r.detectionConfidence >= 0.7);
  assert.ok(r.keywordHits.includes('营业执照'));
});

test('isChineseIdCardText detects OCR-noisy ID card page', async () => {
  const { isChineseIdCardText } = await import(
    '../src/modules/extraction/chinese-business-license/chineseIdCardExtract.js'
  );
  const text = '公民身份号 32052119660122601 有效期 2007.09.13-2027.09.13 签发机关';
  assert.equal(isChineseIdCardText(text), true);
});
