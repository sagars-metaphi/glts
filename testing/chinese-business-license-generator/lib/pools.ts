const CITY_PREFIXES = ['北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '苏州', '佛山', '东莞', '重庆', '西安', '天津'];
const COMPANY_CORES = [
  '华腾科技', '创联电子', '浦东物流', '智云软件', '恒信贸易', '嘉诚建筑', '明德教育',
  '远航海运', '星辰传媒', '瑞丰生物', '中联制造', '海纳信息', '盛世咨询', '金鼎投资',
  '博雅文化', '宏图工程', '新纪元能源', '天宇通信', '绿洲农业', '万象零售',
];
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗'];
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英', '建华', '雪保', '志强'];
const DISTRICTS = ['海淀区中关村大街', '朝阳区建国路', '浦东新区张江路', '南山区科技园南路', '天河区体育西路', '西湖区文三路', '武侯区天府大道', '江汉区建设大道'];
const STREET_SUFFIXES = ['1号', '8号', '18号', '66号', '88号', '100号', '168号', '200号'];
const SCOPES = [
  '软件开发；技术咨询；技术服务',
  '家具制造；家具销售；家居用品制造',
  '电子产品销售；货物进出口；技术进出口',
  '信息技术服务；数据处理服务；云计算服务',
  '道路货物运输；仓储服务；装卸搬运',
  '建筑工程施工；装饰材料销售',
  '教育咨询服务；会议及展览服务',
  '医疗器械销售；健康咨询服务',
  '食品销售；农产品零售；餐饮服务',
  '广告设计；市场营销策划；品牌管理',
];
const COMPANY_TYPES = [
  '有限责任公司',
  '有限责任公司(自然人投资或控股)',
  '股份有限公司',
  '有限责任公司(自然人独资)',
];
const AUTHORITIES = [
  '北京市市场监督管理局',
  '上海市市场监督管理局',
  '深圳市市场监督管理局',
  '广州市市场监督管理局',
  '杭州市市场监督管理局',
  '佛山市顺德区市场监督管理局',
  '成都市市场监督管理局',
  '南京市市场监督管理局',
];
const CAPITAL_OPTIONS = [
  '壹佰万元人民币',
  '伍佰万元人民币',
  '壹仟万元人民币',
  '贰仟壹佰万元人民币',
  '叁仟万元人民币',
  '伍仟万元人民币',
  '壹亿元人民币',
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickSuffix(rng: () => number): '有限公司' | '股份有限公司' {
  return rng() > 0.85 ? '股份有限公司' : '有限公司';
}

export interface RandomPools {
  rng: () => number;
}

export function randomCompanyName({ rng }: RandomPools): string {
  const city = pick(CITY_PREFIXES, rng);
  const core = pick(COMPANY_CORES, rng);
  const suffix = pickSuffix(rng);
  return `${city}${core}${suffix}`;
}

export function randomLegalRepresentative({ rng }: RandomPools): string {
  return pick(SURNAMES, rng) + pick(GIVEN_NAMES, rng);
}

export function randomAddress({ rng }: RandomPools): string {
  const city = pick(CITY_PREFIXES, rng);
  const district = pick(DISTRICTS, rng);
  const street = pick(STREET_SUFFIXES, rng);
  return `${city}市${district}${street}`;
}

export function randomCompanyType({ rng }: RandomPools): string {
  return pick(COMPANY_TYPES, rng);
}

export function randomBusinessScope({ rng }: RandomPools): string {
  return pick(SCOPES, rng);
}

export function randomRegistrationAuthority({ rng }: RandomPools): string {
  return pick(AUTHORITIES, rng);
}

export function randomRegisteredCapital({ rng }: RandomPools): string {
  return pick(CAPITAL_OPTIONS, rng);
}

export function randomEstablishmentDate({ rng }: RandomPools): { iso: string; chinese: string } {
  const year = 2000 + Math.floor(rng() * 24);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const chinese = `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日`;
  return { iso, chinese };
}

export function randomBusinessTerm(est: { chinese: string }, { rng }: RandomPools): string {
  return rng() > 0.3 ? `${est.chinese}至长期` : `${est.chinese}至2035年12月31日`;
}
