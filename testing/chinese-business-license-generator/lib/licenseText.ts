import type { FieldKey } from './constants.js';

export interface GroundTruthFields {
  companyName: string;
  creditCode: string;
  legalRepresentative: string;
  companyType: string;
  registeredCapital: string;
  establishmentDate: string;
  businessTerm: string;
  address: string;
  businessScope: string;
  registrationAuthority: string;
}

export interface LicenseTextOptions {
  mixedLanguage?: boolean;
}

export function formatLicenseText(fields: GroundTruthFields, options: LicenseTextOptions = {}): string {
  const labels = options.mixedLanguage
    ? {
        title: 'Business License 营业执照',
        creditCode: 'USCC 统一社会信用代码',
        companyName: 'Name 名称',
        registeredCapital: 'Capital 注册资本',
        companyType: 'Type 类型',
        establishmentDate: 'Date 成立日期',
        legalRepresentative: 'Legal Rep 法定代表人',
        address: 'Address 住所',
        businessTerm: 'Term 营业期限',
        businessScope: 'Scope 经营范围',
        registrationAuthority: 'Authority 登记机关',
      }
    : {
        title: '营业执照',
        creditCode: '统一社会信用代码',
        companyName: '名称',
        registeredCapital: '注册资本',
        companyType: '类型',
        establishmentDate: '成立日期',
        legalRepresentative: '法定代表人',
        address: '住所',
        businessTerm: '营业期限',
        businessScope: '经营范围',
        registrationAuthority: '登记机关',
      };

  const [y, mo, d] = fields.establishmentDate.split('-');
  const estChinese = `${y}年${mo}月${d}日`;

  return [
    labels.title,
    `${labels.creditCode} ${fields.creditCode}`,
    `${labels.companyName}${fields.companyName}${labels.registeredCapital}${fields.registeredCapital}`,
    `${labels.companyType}${fields.companyType}${labels.establishmentDate}${estChinese}`,
    `${labels.legalRepresentative}${fields.legalRepresentative}${labels.address}${fields.address}`,
    `${labels.businessTerm}${fields.businessTerm}`,
    `${labels.businessScope}${fields.businessScope}`,
    `${labels.registrationAuthority}${fields.registrationAuthority}`,
  ].join('\n');
}

export function formatIdCardText(legalRepresentative: string, idNumber?: string): string {
  const id = idNumber || '440681198501011234';
  return [
    '居民身份证',
    `姓名 ${legalRepresentative}`,
    '性别 男',
    '民族 汉',
    '出生 1985年01月01日',
    `公民身份号码 ${id}`,
    '签发机关 佛山市公安局',
    '有效期限 2020.01.01-2040.01.01',
  ].join('\n');
}

export function fieldsToRecord(fields: GroundTruthFields): Record<FieldKey, string> {
  return { ...fields };
}
