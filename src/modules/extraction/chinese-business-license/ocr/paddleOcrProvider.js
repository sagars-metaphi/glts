import sharp from 'sharp';
import { PaddleOcrService } from 'ppu-paddle-ocr';
import { CanvasProcessor } from 'ppu-ocv/canvas';

const PADDLE_MAX_EDGE = 1600;

async function resizeForPaddle(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxEdge = Math.max(width, height);
  if (!maxEdge || maxEdge <= PADDLE_MAX_EDGE) return buffer;
  const scale = PADDLE_MAX_EDGE / maxEdge;
  return sharp(buffer)
    .resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: sharp.kernel.lanczos3,
    })
    .jpeg({ quality: 92 })
    .toBuffer();
}

const MODEL_BASE =
  'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/refs/heads/main';
const DICT_BASE =
  'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/refs/heads/main';

/** Chinese models — mobile det + v4 Chinese mobile rec (CPU-friendly). */
const CHINESE_DOC_MODELS = {
  detection: `${MODEL_BASE}/detection/PP-OCRv5_mobile_det_infer.ort`,
  recognition: `${MODEL_BASE}/recognition/PP-OCRv4_mobile_rec_infer.onnx`,
  charactersDictionary: `${DICT_BASE}/recognition/ppocrv4_dict.txt`,
};

let service = null;
let initPromise = null;

async function getPaddleService() {
  if (service?.isInitialized()) return service;
  if (!initPromise) {
    initPromise = (async () => {
      const paddle = new PaddleOcrService({
        model: CHINESE_DOC_MODELS,
        processing: { engine: 'opencv' },
        detection: {
          maxSideLength: 1600,
          minimumAreaThreshold: 20,
        },
        recognition: {
          charactersDictionary: [],
          strategy: 'per-line',
          imageHeight: 48,
        },
        debugging: { verbose: false },
      });
      await paddle.initialize();
      service = paddle;
      return service;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * Run PaddleOCR on an image buffer.
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, confidence: number, engine: 'paddle' }>}
 */
export async function runPaddleOcr(buffer) {
  const paddle = await getPaddleService();
  const sized = await resizeForPaddle(buffer);
  const arrayBuffer = sized.buffer.slice(sized.byteOffset, sized.byteOffset + sized.byteLength);
  const canvas = await CanvasProcessor.prepareCanvas(arrayBuffer);
  const result = await paddle.recognize(canvas);
  const confidence = (result.confidence ?? 0) * 100;
  return {
    text: (result.text || '').trim(),
    confidence,
    engine: 'paddle',
  };
}

export async function destroyPaddleOcr() {
  if (service) {
    await service.destroy();
    service = null;
    initPromise = null;
  }
}
