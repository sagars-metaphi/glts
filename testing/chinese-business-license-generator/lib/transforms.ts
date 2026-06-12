import sharp from 'sharp';

export type StyleDegradation =
  | 'none'
  | 'low_dpi'
  | 'watermark'
  | 'rotate_90'
  | 'rotate_180'
  | 'stamp'
  | 'blur'
  | 'noise'
  | 'mixed_lang'
  | 'multi_page';

async function addWatermark(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1200;
  const h = meta.height || 1700;
  const overlay = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
    font-size="72" fill="rgba(196,30,58,0.18)" font-family="Microsoft YaHei, sans-serif"
    transform="rotate(-30 ${w / 2} ${h / 2})">样本 SAMPLE</text>
</svg>`);
  return sharp(buf).composite([{ input: overlay, blend: 'over' }]).png().toBuffer();
}

async function addStamp(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1200;
  const stamp = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="220" height="220" xmlns="http://www.w3.org/2000/svg">
  <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(196,30,58,0.55)" stroke-width="6"/>
  <text x="110" y="118" text-anchor="middle" font-size="28" fill="rgba(196,30,58,0.55)" font-family="Microsoft YaHei, sans-serif">登记专用章</text>
</svg>`);
  return sharp(buf)
    .composite([{ input: stamp, left: Math.floor(w * 0.55), top: 320, blend: 'over' }])
    .png()
    .toBuffer();
}

async function addNoise(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export async function applyStyleTransform(buf: Buffer, degradation: StyleDegradation): Promise<Buffer> {
  let out = buf;

  switch (degradation) {
    case 'low_dpi':
      out = await sharp(out).resize(600, 850, { fit: 'inside' }).resize(1200, 1700, { kernel: 'nearest' }).png().toBuffer();
      break;
    case 'watermark':
      out = await addWatermark(out);
      break;
    case 'rotate_90':
      out = await sharp(out).rotate(90, { background: '#faf8f2' }).png().toBuffer();
      break;
    case 'rotate_180':
      out = await sharp(out).rotate(180, { background: '#faf8f2' }).png().toBuffer();
      break;
    case 'stamp':
      out = await addStamp(out);
      break;
    case 'blur':
      out = await sharp(out).blur(2.5).png().toBuffer();
      break;
    case 'noise':
      out = await addNoise(out);
      break;
    case 'mixed_lang':
    case 'multi_page':
    case 'none':
    default:
      break;
  }

  return out;
}
