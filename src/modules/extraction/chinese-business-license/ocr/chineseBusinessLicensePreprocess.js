import sharp from 'sharp';

/** Target long-edge ~1600px (~300 DPI for A4 after PDF rasterization). */
const TARGET_OCR_EDGE = 1600;
const ORIENTATIONS = [0, 90, 180, 270];

/** Normalize resolution for OCR engines (min detail, max canvas size). */
export async function upscaleTo300Dpi(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxEdge = Math.max(width, height);
  const minEdge = Math.min(width, height);
  if (!maxEdge) return buffer;

  let scale = 1;
  if (maxEdge > TARGET_OCR_EDGE) {
    scale = TARGET_OCR_EDGE / maxEdge;
  } else if (minEdge < TARGET_OCR_EDGE * 0.75) {
    scale = TARGET_OCR_EDGE / maxEdge;
  }

  if (Math.abs(scale - 1) < 0.02) return buffer;

  return sharp(buffer)
    .resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

/** Estimate skew via horizontal projection variance across small angles. */
export async function deskewImage(buffer) {
  const angles = [-3, -2, -1, 0, 1, 2, 3];
  let bestAngle = 0;
  let bestScore = -1;

  for (const angle of angles) {
    const rotated =
      angle === 0
        ? buffer
        : await sharp(buffer).rotate(angle, { background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
    const { data, info } = await sharp(rotated).grayscale().raw().toBuffer({ resolveWithObject: true });
    const score = horizontalProjectionScore(data, info.width, info.height);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  if (bestAngle === 0) return { buffer, deskewAngle: 0 };
  const deskewed = await sharp(buffer)
    .rotate(bestAngle, { background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  return { buffer: deskewed, deskewAngle: bestAngle };
}

function horizontalProjectionScore(data, width, height) {
  const rowSums = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      sum += data[row + x] < 200 ? 1 : 0;
    }
    rowSums[y] = sum;
  }
  const mean = rowSums.reduce((a, b) => a + b, 0) / height;
  let variance = 0;
  for (let i = 0; i < height; i += 1) {
    variance += (rowSums[i] - mean) ** 2;
  }
  return variance / height;
}

/** Reduce semi-transparent watermark patterns via background division. */
export async function removeWatermark(buffer) {
  const blurred = await sharp(buffer).grayscale().blur(12).toBuffer();
  const { data: orig, info } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const { data: blur } = await sharp(blurred).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(orig.length);

  for (let i = 0; i < orig.length; i += 1) {
    const bg = Math.max(blur[i], 30);
    const val = Math.min(255, Math.round((orig[i] / bg) * 180));
    out[i] = val;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}

/** Denoise + adaptive local contrast. */
export async function denoiseAndAdaptiveThreshold(buffer) {
  return sharp(buffer)
    .grayscale()
    .median(3)
    .normalize()
    .linear(1.6, -(128 * 0.25))
    .png()
    .toBuffer();
}

/** Full pre-OCR pipeline: EXIF rotate, upscale, deskew, mild denoise (watermark handled per-variant). */
export async function preprocessForChineseOcr(buffer) {
  let img = await sharp(buffer).rotate().png().toBuffer();
  img = await upscaleTo300Dpi(img);
  const { buffer: deskewed, deskewAngle } = await deskewImage(img);
  img = await denoiseAndAdaptiveThreshold(deskewed);
  return { buffer: img, deskewAngle };
}

export async function rotateOrientation(buffer, degrees) {
  if (!degrees) return buffer;
  return sharp(buffer).rotate(degrees, { background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
}

/** Four OCR preprocessing variants from a normalized base image. */
export async function buildOcrVariants(baseBuffer) {
  const [grayscale, highContrast, sharpened] = await Promise.all([
    sharp(baseBuffer).grayscale().normalize().png().toBuffer(),
    sharp(baseBuffer)
      .grayscale()
      .normalize()
      .linear(2.0, -(128 * 0.4))
      .png()
      .toBuffer(),
    sharp(baseBuffer).grayscale().normalize().sharpen({ sigma: 2.8, m1: 1.2, m2: 0.5 }).png().toBuffer(),
  ]);

  return {
    original: baseBuffer,
    grayscale,
    highContrast,
    sharpened,
    watermarkRemoved: await removeWatermark(baseBuffer),
  };
}

export { ORIENTATIONS };
