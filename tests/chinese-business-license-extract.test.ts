import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractChineseBusinessLicenseFields } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js';
import { compareChineseNames } from '../src/modules/extraction/chinese-business-license/ChineseBusinessLicenseValidators.js';

const SAMPLE_OCR = `
营业执照
统一社会信用代码: 914406067778330440
名称: 北京示例科技有限公司
类型: 有限责任公司
法定代表人: 张三
注册资本: 1000万元
成立日期: 2015年3月15日
营业期限: 2015年3月15日至长期
住所: 北京市海淀区中关村大街1号
经营范围: 技术开发、技术咨询、技术服务
登记机关: 北京市市场监督管理局
`;

test('extractChineseBusinessLicenseFields parses clean OCR text', async () => {
  const result = await extractChineseBusinessLicenseFields(SAMPLE_OCR, 85);
  assert.equal(result.fields.companyName.value, '北京示例科技有限公司');
  assert.equal(result.fields.legalRepresentative.value, '张三');
  assert.equal(result.fields.establishmentDate.value, '2015-03-15');
  assert.ok(result.fields.creditCode.confidence > 0.5);
  assert.ok(result.fields.companyName.confidence > 0.5);
});

test('compareChineseNames validates legal representative against ID card name', () => {
  assert.equal(compareChineseNames('张三', '张三'), true);
});
