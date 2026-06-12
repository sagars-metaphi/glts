import sharp from 'sharp';
import type { GroundTruthFields } from './licenseText.js';
import { formatLicenseText, formatIdCardText } from './licenseText.js';

const WIDTH = 1200;
const HEIGHT = 1700;

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapField(label: string, value: string, y: number): string {
  return `
    <text x="80" y="${y}" font-size="22" fill="#333" font-family="Microsoft YaHei, SimHei, Noto Sans SC, sans-serif">${esc(label)}</text>
    <text x="280" y="${y}" font-size="22" fill="#111" font-weight="600" font-family="Microsoft YaHei, SimHei, Noto Sans SC, sans-serif">${esc(value)}</text>
  `;
}

export function renderLicenseSvg(fields: GroundTruthFields, mixedLanguage = false): string {
  const text = formatLicenseText(fields, { mixedLanguage });
  const lines = text.split('\n').slice(1);
  const fieldRows = lines.map((line, i) => {
    const y = 260 + i * 52;
    const m = line.match(/^(.+?)(统一社会信用代码|USCC|名称|Name|注册资本|类型|成立日期|法定代表人|住所|营业期限|经营范围|登记机关)(.*)$/);
    if (!m) return `<text x="80" y="${y}" font-size="20" font-family="Microsoft YaHei, SimHei, sans-serif">${esc(line)}</text>`;
    return wrapField(m[1] + m[2], m[3].trim(), y);
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#faf8f2"/>
  <rect x="40" y="40" width="1120" height="1620" fill="#fff" stroke="#c41e3a" stroke-width="8" rx="12"/>
  <text x="600" y="120" text-anchor="middle" font-size="52" fill="#c41e3a" font-weight="700" font-family="Microsoft YaHei, SimHei, sans-serif">营业执照</text>
  <text x="600" y="170" text-anchor="middle" font-size="18" fill="#888" font-family="Arial, sans-serif">BUSINESS LICENSE</text>
  ${fieldRows}
  <text x="600" y="1620" text-anchor="middle" font-size="14" fill="#999" font-family="Microsoft YaHei, sans-serif">国家企业信用信息公示系统</text>
</svg>`;
}

export function renderIdCardSvg(legalRepresentative: string): string {
  const text = formatIdCardText(legalRepresentative);
  const lines = text.split('\n');
  const rows = lines.map((line, i) =>
    `<text x="80" y="${180 + i * 48}" font-size="24" font-family="Microsoft YaHei, SimHei, sans-serif">${esc(line)}</text>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${Math.round(HEIGHT * 0.55)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#e8f0f8"/>
  <rect x="30" y="30" width="1140" height="820" fill="#fff" stroke="#336699" stroke-width="4" rx="8"/>
  <text x="600" y="100" text-anchor="middle" font-size="36" fill="#336699" font-family="Microsoft YaHei, SimHei, sans-serif">居民身份证</text>
  ${rows}
</svg>`;
}

export async function renderLicensePng(fields: GroundTruthFields, mixedLanguage = false): Promise<Buffer> {
  const svg = renderLicenseSvg(fields, mixedLanguage);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderIdCardPng(legalRepresentative: string): Promise<Buffer> {
  const svg = renderIdCardSvg(legalRepresentative);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
