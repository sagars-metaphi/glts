const CN_DIGIT: Record<string, number> = {
  零: 0, 〇: 0,
  一: 1, 壹: 1, 幺: 1,
  二: 2, 贰: 2, 两: 2,
  三: 3, 叁: 3,
  四: 4, 肆: 4,
  五: 5, 伍: 5,
  六: 6, 陆: 6,
  七: 7, 柒: 7,
  八: 8, 捌: 8,
  九: 9, 玖: 9,
};

const CN_UNIT: Record<string, number> = {
  十: 10, 拾: 10,
  百: 100, 佰: 100,
  千: 1000, 仟: 1000,
};

const CN_NUMERAL_CHARS = /[零〇壹贰叁肆伍陆柒捌玖拾佰仟万亿萬億两一二三四五六七八九十百千]/;

/** Parse Chinese financial numerals without 万/亿 suffix (e.g. 贰仟壹佰 → 2100). */
export function parseChineseNumerals(input: string): number | null {
  const str = String(input || '').replace(/\s/g, '');
  if (!str) return null;

  let total = 0;
  let section = 0;
  let num = 0;

  for (const ch of str) {
    if (ch in CN_DIGIT) {
      num = CN_DIGIT[ch];
    } else if (ch in CN_UNIT) {
      section += (num || 1) * CN_UNIT[ch];
      num = 0;
    } else if (ch === '零' || ch === '〇') {
      section += num;
      num = 0;
    } else if (ch === '万' || ch === '萬' || ch === '亿' || ch === '億') {
      return null;
    } else {
      return null;
    }
  }

  return total + section + num;
}

/** Parse full Chinese capital expression to yuan (e.g. 贰仟壹佰万 → 21000000). */
export function parseChineseCapitalToYuan(input: string): number | null {
  const str = String(input || '').replace(/\s/g, '');
  if (!str || !CN_NUMERAL_CHARS.test(str)) return null;

  let total = 0;
  let section = 0;
  let num = 0;

  for (const ch of str) {
    if (ch in CN_DIGIT) {
      num = CN_DIGIT[ch];
    } else if (ch in CN_UNIT) {
      section += (num || 1) * CN_UNIT[ch];
      num = 0;
    } else if (ch === '零' || ch === '〇') {
      section += num;
      num = 0;
    } else if (ch === '万' || ch === '萬') {
      section += num;
      total += section * 10000;
      section = 0;
      num = 0;
    } else if (ch === '亿' || ch === '億') {
      section += num;
      total += section * 100000000;
      section = 0;
      num = 0;
    } else {
      return null;
    }
  }

  return total + section + num;
}

function formatYuanAsCapital(yuan: number): string {
  if (yuan >= 100000000 && yuan % 100000000 === 0) {
    return `${yuan / 100000000}亿元人民币`;
  }
  if (yuan >= 10000 && yuan % 10000 === 0) {
    return `${yuan / 10000}万元人民币`;
  }
  if (yuan >= 10000) {
    return `${Math.round(yuan / 10000)}万元人民币`;
  }
  return `${yuan}元人民币`;
}

/** Convert capital segment; rejects bare years (e.g. 2005年). */
export function normalizeRegisteredCapitalValue(raw: string | null | undefined): string | null {
  const segment = String(raw || '').trim();
  if (!segment) return null;

  if (/^\d{4}\s*年/.test(segment) && !/[万亿萬元圆圓]/.test(segment)) {
    return null;
  }

  const arabic = segment.match(/^([\d,.]+)\s*(万|亿)?\s*(元|人民币|RMB|CNY)?/i);
  if (arabic) {
    const amount = arabic[1].replace(/,/g, '');
    const unit = arabic[2] || '';
    const currency = /万元|万人民币|元人民币|元/.test(segment) ? '元' : '';
    if (unit === '万') return `${amount}万元人民币`;
    if (unit === '亿') return `${amount}亿元人民币`;
    return currency ? `${amount}元人民币` : amount;
  }

  const cnCore = segment
    .replace(/(?:元|圆|圓|人民币|RMB|CNY).*$/i, '')
    .replace(/整$/u, '')
    .trim();

  const cnMatch = cnCore.match(
    /^([零〇壹贰叁肆伍陆柒捌玖拾佰仟万亿萬億两一二三四五六七八九十百千]+)/u,
  );
  if (cnMatch) {
    const yuan = parseChineseCapitalToYuan(cnMatch[1]);
    if (yuan != null && yuan > 0) {
      return formatYuanAsCapital(yuan);
    }

    const amount = parseChineseNumerals(cnMatch[1]);
    if (amount != null) {
      if (/万元|万人民币/.test(segment) || /万$/.test(cnMatch[1])) {
        return `${amount}万元人民币`;
      }
      if (/亿元/.test(segment) || /亿$/.test(cnMatch[1])) {
        return `${amount}亿元人民币`;
      }
      return `${amount}元人民币`;
    }
  }

  return segment;
}
