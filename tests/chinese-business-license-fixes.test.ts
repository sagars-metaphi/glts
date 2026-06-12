import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBestLabelMatchInText } from '../src/modules/extraction/chinese-business-license/fuzzyLabelMatch.js';
import { extractCreditCode } from '../src/modules/extraction/chinese-business-license/creditCodeExtract.js';
import { extractByLabelSegments } from '../src/modules/extraction/chinese-business-license/chineseLabelSegmentExtract.js';
import { extractChineseBusinessLicenseFields } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js';

test('fuzzy label matching tolerates 统一社会佰用代码', () => {
  const text = '统一社会佰用代码 91420100825128376G 名称测试公司';
  const match = findBestLabelMatchInText(text, '统一社会信用代码');
  assert.ok(match);
  assert.equal(match?.canonical, '统一社会信用代码');
  assert.ok(match!.levenshteinDistance <= 2);
});

test('fuzzy label matching tolerates 注册责本 and 经范围', () => {
  const capital = findBestLabelMatchInText('类型有限责任公司注册责本壹佰万元', '注册资本');
  assert.ok(capital);
  assert.equal(capital?.matchedText, '注册责本');

  const scope = findBestLabelMatchInText('经范围家具制造;家具销售', '经营范围');
  assert.ok(scope);
});

test('credit code selects checksum-valid candidate after punctuation removal', () => {
  const segment = '9142 01008251.28376G';
  const result = extractCreditCode(segment, segment);
  assert.equal(result.value, '91420100825128376G');
  assert.equal(result.checksumValid, true);
  assert.equal(result.reconstructed, true);
});

test('credit code handles colon separator', () => {
  const segment = '9142:0100825128376G';
  const result = extractCreditCode(segment, segment);
  assert.equal(result.value, '91420100825128376G');
  assert.equal(result.checksumValid, true);
  assert.equal(result.reconstructed, true);
});

test('company name preserves full segment between labels', async () => {
  const text = [
    '营业执照',
    '统一社会信用代码 91330100899329938M',
    '名称西安金鼎投资股份有很公司注册资本壹亿元人民币',
    '类型有限责任公司成立日期2001年12月14日',
    '法定代表人徐明住所佛山市江汉区建设大道18号',
    '经营范围软件开发；技术咨询；技术服务',
    '登记机关上海市市场监督管理局',
  ].join('\n');

  const result = await extractChineseBusinessLicenseFields(text, 79);
  assert.equal(result.fields.companyName.value, '西安金鼎投资股份有很公司');
  assert.equal(result.fields.companyName.raw, '西安金鼎投资股份有很公司');
});

test('fuzzy labels recover corrupted license text', async () => {
  const text = [
    '营业执照',
    '统一社会佰用代码 9111#0000475478019G',
    '名称北京星辰传媒有限公司注册责本壹仟万元人民币',
    '类型有限责任公司成立日期2010年10月25日',
    '法定代表人朱雪保住所西安市海淀区中关村大街168号',
    '营业期很2010年10月25日至长期',
    '经范围医疗器械销售；健康咨询服务',
    '登记机关杭州市市场监督管理局',
  ].join('\n');

  const { segments } = extractByLabelSegments(text);
  assert.ok(segments.creditCode.labelFound);
  assert.ok(segments.registeredCapital.labelFound);
  assert.ok(segments.businessTerm.labelFound);
  assert.ok(segments.businessScope.rawSegment.includes('医疗器械'));

  const result = await extractChineseBusinessLicenseFields(text, 72);
  assert.equal(result.fields.creditCode.checksumValid, true);
  assert.ok(result.fields.businessScope.value?.includes('医疗器械'));
});

test('business scope fallback extracts block before registration authority', async () => {
  const text = [
    '营业执照',
    '统一社会信用代码 914406067778330440',
    '名称测试公司注册资本壹佰万元',
    '类型有限责任公司成立日期2010年01月01日',
    '法定代表人张三住所北京市海淀区',
    '营业期限2010年01月01日至长期',
    '一般项目:家具制造;家具销售',
    '登记机关北京市市场监督管理局',
  ].join('\n');

  const { segments } = extractByLabelSegments(text);
  assert.equal(segments.businessScope.scopeFallbackUsed, true);
  assert.ok(segments.businessScope.rawSegment.includes('家具'));
});
