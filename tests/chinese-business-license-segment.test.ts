import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import { extractByLabelSegments } from '../src/modules/extraction/chinese-business-license/chineseLabelSegmentExtract.js';
import {
  parseChineseCapitalToYuan,
  parseChineseNumerals,
  normalizeRegisteredCapitalValue,
} from '../src/modules/extraction/chinese-business-license/chineseNumberParse.js';
import { extractCreditCode } from '../src/modules/extraction/chinese-business-license/creditCodeExtract.js';
import { extractChineseBusinessLicenseFields } from '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js';
import { extractChineseIdCardName } from '../src/modules/extraction/chinese-business-license/chineseIdCardExtract.js';
import { ChineseOcrConfusionResolver } from '../src/modules/extraction/chinese-business-license/ChineseOcrConfusionResolver.js';
import { ChineseFieldValidator } from '../src/modules/extraction/chinese-business-license/ChineseFieldValidator.js';
import { getDefaultFieldProcessor } from '../src/modules/extraction/chinese-business-license/chineseFieldProcessor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_OCR_FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures/chinese-business-license-ocr-sample.txt'),
  'utf8',
);

const COMPANIES = [
  {
    name: '北京示例科技有限公司',
    ocrName: '北京示例科技有限公司',
    rep: '张三',
    ocrRep: '张三',
    province: '北京市海淀区中关村大街1号',
    type: '有限责任公司',
    ocrType: '有限资任公司',
    scope: '技术开发、技术咨询、技术服务',
  },
  {
    name: '上海浦东物流股份有限公司',
    ocrName: '上海浦东物流股份有限公司',
    rep: '李明',
    ocrRep: '李明',
    province: '上海市浦东新区张江路88号',
    type: '股份有限公司',
    ocrType: '股份有限公司',
    scope: '道路货物运输；仓储服务',
  },
  {
    name: '深圳创新电子有限公司',
    ocrName: '深圳创新电子有限公司',
    rep: '王芳',
    ocrRep: '王芳',
    province: '广东省深圳市南山区科技园',
    type: '有限责任公司(自然人投资或控股)',
    ocrType: '有限资任公司(自然人投资或控股)',
    scope: '电子产品销售；货物进出口',
  },
];

function buildLicenseText(company: typeof COMPANIES[number], creditCode: string) {
  return [
    '营业执照',
    `统一社会信用代码 ${creditCode}`,
    `名称${company.ocrName}注册资本壹仟万元人民币`,
    `类型${company.ocrType}成立日期2018年06月15日`,
    `法定代表人${company.ocrRep}住所${company.province}`,
    `经营范围${company.scope}`,
    '登记机关市场监督管理局',
  ].join('');
}

test('label-to-label segments companyName before 注册资本', () => {
  const input = '名称广东创金家具有限公司注册资本贰仟壹佰万元人民币';
  const { segments } = extractByLabelSegments(input);
  assert.equal(segments.companyName.rawSegment, '广东创金家具有限公司');
  assert.equal(segments.companyName.nextLabel, '注册资本');
});

test('parseChineseNumerals converts 贰仟壹佰 to 2100', () => {
  assert.equal(parseChineseNumerals('贰仟壹佰'), 2100);
  assert.equal(normalizeRegisteredCapitalValue('贰仟壹佰万元人民币'), '2100万元人民币');
});

test('parseChineseCapitalToYuan handles 壹亿零伍万元', () => {
  assert.equal(parseChineseCapitalToYuan('壹亿零伍万'), 100050000);
  assert.equal(normalizeRegisteredCapitalValue('壹亿零伍万元人民币'), '10005万元人民币');
  assert.equal(normalizeRegisteredCapitalValue('壹仟万元'), '1000万元人民币');
});

test('credit code extraction preserves order and validates checksum', () => {
  const segment = '#!V:1 914406067778330440(副本)(5本号:1-1)';
  const fullText = `统一社会信用代码 ${segment} 名称测试`;
  const result = extractCreditCode(segment, fullText);

  assert.equal(result.value, '914406067778330440');
  assert.equal(result.checksumValid, true);
  assert.notEqual(result.value, '191440606777833044');
});

test('OCR confusion resolver generates scored candidates without hardcoded company names', () => {
  const resolver = new ChineseOcrConfusionResolver();
  const validator = new ChineseFieldValidator();
  const ranked = resolver.resolveCandidates('有限资任公司', (candidate, replacements) => {
    const validation = validator.validateCompanyType(candidate);
    return validation.score - replacements.length * 0.08;
  });

  assert.ok(ranked.some((c) => c.normalized === '有限责任公司'));
  assert.ok(ranked[0].normalized === '有限责任公司' || ranked[0].score > 0.5);
});

test('company type confusion resolves 股份有很公司 to 股份有限公司', () => {
  const processor = getDefaultFieldProcessor();
  const result = processor.processCompanyType('股份有很公司(上市)', {
    ocrConfidence: 80,
    boundaryExtracted: true,
    labelFound: true,
    fullText: '',
  });
  assert.equal(result.value, '股份有限公司(上市)');
  assert.ok(result.confusionCorrections.length > 0);
});

test('address never hallucinates missing parts', () => {
  const processor = getDefaultFieldProcessor();
  const result = processor.processAddress('佛山划入什', {
    ocrConfidence: 75,
    boundaryExtracted: true,
    labelFound: true,
    fullText: '',
  });
  assert.equal(result.raw, '佛山划入什');
  assert.equal(result.value, '佛山划入什');
  assert.equal(result.requiresReview, true);
});

test('legal representative rejects Latin garbage', () => {
  const processor = getDefaultFieldProcessor();
  const result = processor.processLegalRepresentative('tHRRuR', {
    ocrConfidence: 70,
    boundaryExtracted: true,
    labelFound: true,
    fullText: '',
  });
  assert.equal(result.requiresReview, true);
});

test('ID card name rejects Latin garbage', () => {
  assert.equal(extractChineseIdCardName('姓名 tHRRuR 公民身份号码 440681198001011234'), null);
  assert.equal(extractChineseIdCardName('姓名 王芳 性别 女 公民身份号码 440681198001011234'), '王芳');
});

const VALID_CREDIT_CODE = '914406067778330440';

for (const [index, company] of COMPANIES.entries()) {
  test(`extracts unseen company ${index + 1}: ${company.name}`, async () => {
    const creditCode = VALID_CREDIT_CODE;
    const text = buildLicenseText(company, creditCode);
    const result = await extractChineseBusinessLicenseFields(text, 82);

    assert.equal(result.fields.companyName.value, company.name);
    assert.equal(result.fields.legalRepresentative.value, company.rep);
    assert.equal(result.fields.companyType.value, company.type);
    assert.equal(result.fields.address.value, company.province);
    assert.equal(result.fields.creditCode.checksumValid, true);
    assert.ok(result.fields.companyName.raw);
    assert.ok(result.fields.companyName.confidence > 0.5);
  });
}

test('noisy OCR fixture extracts credit code and preserves raw values', async () => {
  const result = await extractChineseBusinessLicenseFields(PDF_OCR_FIXTURE, 79);

  assert.equal(result.fields.creditCode.value, '914406067778330440');
  assert.equal(result.fields.creditCode.checksumValid, true);
  assert.equal(result.fields.companyName.value, '广东省创述家具有限公司');
  assert.equal(result.fields.companyName.raw, '广东省创述家具有限公司');
  assert.equal(result.fields.companyName.confusionCorrections?.length ?? 0, 0);
  assert.equal(result.fields.address.value, '佛山划入什');
  assert.equal(result.fields.address.requiresReview, true);
  assert.equal(result.fields.registeredCapital.value, '2100万元人民币');
  assert.equal(result.fields.registeredCapital.raw, '贰仟壹信万元人民币');
  assert.ok(result.extractionDebug.find((d) => d.field === 'creditCode')?.checksumValid);
});

test('companyName preserves OCR characters without confusion substitutions', async () => {
  const input = '名称广东省创述家具有限公司注册资本壹仟万元人民币';
  const result = await extractChineseBusinessLicenseFields(input, 81);

  assert.equal(result.fields.companyName.raw, '广东省创述家具有限公司');
  assert.equal(result.fields.companyName.value, '广东省创述家具有限公司');
  assert.notEqual(result.fields.companyName.value, '广东省创金家具有限公司');
  assert.equal(result.extractionDebug.find((d) => d.field === 'companyName')?.confusionCorrections.length, 0);
  assert.ok(result.fields.companyName.confidence > 0.5);
});

test('watermarked noisy OCR marks manual review when corrections exceed threshold', async () => {
  const noisy = [
    '统一社会信用代码 #!V:1 914406067778330440(副本)',
    '名称广东省创述家具有限公司注册资本贰仟壹信万元人民币',
    '类型有限资任公司(自然人投资或控股)成立日期2005年07月08日',
    '法定代表人朱当保住所佛山划入什',
    '经营范围一般项目:家具制造;家具销售',
    '登记机关佛山市顺德区市场监督管理局',
  ].join('');
  const result = await extractChineseBusinessLicenseFields(noisy, 72);

  assert.equal(result.fields.creditCode.checksumValid, true);
  assert.ok(result.requiresManualReview);
  assert.ok(result.reviewReasons.length > 0);
});
