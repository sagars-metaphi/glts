import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChineseOcrConfusionResolver } from '../src/modules/extraction/chinese-business-license/ChineseOcrConfusionResolver.js';
import { ChineseFieldValidator } from '../src/modules/extraction/chinese-business-license/ChineseFieldValidator.js';
import { computeManualReview } from '../src/modules/extraction/chinese-business-license/chineseManualReview.js';
import type { ExtractedFieldResult } from '../src/modules/extraction/chinese-business-license/chineseFieldProcessor.js';

test('confusion resolver keeps raw value and ranks normalized candidates', () => {
  const resolver = new ChineseOcrConfusionResolver();
  const ranked = resolver.resolveCandidates('有限资任公司', () => 0);

  assert.equal(ranked[0].raw, '有限资任公司');
  assert.ok(ranked.some((c) => c.normalized === '有限责任公司'));
});

test('manual review triggers on low OCR confidence and failed checksum', () => {
  const fields: Record<string, ExtractedFieldResult> = {
    companyName: { rawValue: '测试有限公司', normalizedValue: '测试有限公司', value: '测试有限公司', raw: '测试有限公司', confidence: 0.8, requiresReview: false, confusionCorrections: [], validationSignals: [] },
    creditCode: { rawValue: 'INVALID', normalizedValue: 'INVALID', value: 'INVALID', raw: 'INVALID', confidence: 0.4, requiresReview: true, checksumValid: false, confusionCorrections: [], validationSignals: [] },
    legalRepresentative: { rawValue: '李四', normalizedValue: '李四', value: '李四', raw: '李四', confidence: 0.8, requiresReview: false, confusionCorrections: [], validationSignals: [] },
    businessScope: { rawValue: '销售', normalizedValue: '销售', value: '销售', raw: '销售', confidence: 0.6, requiresReview: true, confusionCorrections: [], validationSignals: [] },
  };

  const review = computeManualReview(fields, 70, 2);
  assert.equal(review.requiresManualReview, true);
  assert.ok(review.reviewReasons.some((r) => r.startsWith('ocr_confidence_below_75')));
  assert.ok(review.reviewReasons.includes('credit_checksum_failed'));
});

test('company name validator uses suffix not hardcoded names', () => {
  const validator = new ChineseFieldValidator();
  const good = validator.validateCompanyName('杭州西湖云计算有限公司');
  const bad = validator.validateCompanyName('杭州西湖云计算');

  assert.equal(good.valid, true);
  assert.equal(bad.requiresReview, true);
});
