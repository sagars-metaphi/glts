import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareField } from '../testing/chinese-business-license-generator/lib/compare.js';
import { buildAccuracyAttribution } from '../testing/chinese-business-license-generator/lib/dualAccuracyReport.js';
import { buildConfidenceCalibration } from '../testing/chinese-business-license-generator/lib/confidenceCalibration.js';
import { extractChineseBusinessLicenseFields } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js';
import { ChineseFieldValidator } from '../src/modules/extraction/chinese-business-license/ChineseFieldValidator.js';

test('companyName OCR corruption is extraction match but not business match', () => {
  const comparison = compareField(
    'companyName',
    '南京宏图工程有限公司',
    {
      rawValue: '南京宏图工程有很公司',
      normalizedValue: '南京宏图工程有很公司',
      confidence: 0.72,
      requiresReview: true,
    },
    '南京宏图工程有很公司',
  );

  assert.equal(comparison.extractionMatch, true);
  assert.equal(comparison.businessMatch, false);
});

test('companyName with invalid suffix requires review and lower validation score', async () => {
  const text = [
    '营业执照',
    '统一社会信用代码 91330100899329938M',
    '名称南京宏图工程有很公司注册资本壹佰万元',
    '类型有限责任公司成立日期2010年01月01日',
    '法定代表人张三住所北京市海淀区',
    '经营范围软件开发',
    '登记机关北京市市场监督管理局',
  ].join('\n');

  const result = await extractChineseBusinessLicenseFields(text, 75);
  const field = result.fields.companyName;

  assert.equal(field.rawValue, '南京宏图工程有很公司');
  assert.equal(field.normalizedValue, '南京宏图工程有很公司');
  assert.equal(field.requiresReview, true);

  const validation = new ChineseFieldValidator().validateCompanyName(field.normalizedValue);
  assert.equal(validation.requiresReview, true);
  assert.ok(field.confidence < 0.9);
});

test('legalRepresentative preserves OCR and exposes normalizedCandidate', async () => {
  const text = [
    '营业执照',
    '统一社会信用代码 91330100899329938M',
    '名称测试有限公司注册资本壹佰万元',
    '类型有限责任公司成立日期2010年01月01日',
    '法定代表人朱雪傈住所北京市海淀区',
    '经营范围软件开发',
    '登记机关北京市市场监督管理局',
  ].join('\n');

  const result = await extractChineseBusinessLicenseFields(text, 80);
  const field = result.fields.legalRepresentative;

  assert.equal(field.rawValue, '朱雪傈');
  assert.equal(field.normalizedValue, '朱雪傈');
  if (field.normalizedCandidate) {
    assert.notEqual(field.normalizedValue, field.normalizedCandidate);
  }
});

test('accuracy attribution separates OCR vs extraction failures', () => {
  const comparisons = [{
    documentId: 'doc-1',
    style: 'style-b',
    fields: [
      compareField('companyName', '南京宏图工程有限公司', {
        rawValue: '南京宏图工程有很公司',
        normalizedValue: '南京宏图工程有很公司',
        confidence: 0.7,
        requiresReview: true,
      }, '南京宏图工程有很公司'),
      compareField('creditCode', '91420100825128376G', {
        rawValue: '91420100825128376G',
        normalizedValue: '91420100825128376G',
        confidence: 0.95,
        requiresReview: false,
      }, '91420100825128376G'),
    ],
    exactMatches: 1,
    businessMatches: 1,
    extractionMatches: 2,
    fieldTotal: 2,
  }];

  const attribution = buildAccuracyAttribution(comparisons);
  assert.equal(attribution.extractionMatches, 2);
  assert.equal(attribution.businessMatches, 1);
  assert.equal(attribution.ocrAttributedFailures, 1);
  assert.equal(attribution.extractionAttributedFailures, 0);
});

test('confidence calibration uses updated buckets', () => {
  const comparisons = [{
    documentId: 'doc-1',
    style: 'style-a',
    fields: [
      compareField('companyName', '测试有限公司', {
        normalizedValue: '测试有限公司',
        confidence: 0.92,
        requiresReview: false,
      }, '测试有限公司'),
      compareField('creditCode', '91420100825128376G', {
        normalizedValue: '91420100825128376G',
        confidence: 0.55,
        requiresReview: true,
      }, '91420100825128376G'),
    ],
    exactMatches: 2,
    businessMatches: 2,
    extractionMatches: 2,
    fieldTotal: 2,
  }];

  const calibration = buildConfidenceCalibration(comparisons);
  assert.equal(calibration.buckets.length, 5);
  assert.equal(calibration.buckets[0].label, '0.0-0.5');
  assert.equal(calibration.buckets[4].label, '0.9-1.0');
  const high = calibration.buckets.find((b) => b.min >= 0.9);
  assert.equal(high?.predicted, 1);
  assert.equal(high?.businessCorrect, 1);
});
