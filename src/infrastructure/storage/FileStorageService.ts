import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import multer from 'multer';
import type { Request } from 'express';
import { paths } from '../../config/paths.js';

export class FileStorageService {
  constructor(private readonly baseDir = paths.upload) {}

  async ensureDirs(...dirs: string[]) {
    await fs.mkdir(this.baseDir, { recursive: true });
    for (const dir of dirs) await fs.mkdir(dir, { recursive: true });
  }

  multer(fieldName = 'file', maxMb = 25) {
    const storage = multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, this.baseDir),
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    });
    return multer({ storage, limits: { fileSize: maxMb * 1024 * 1024 } });
  }

  memoryMulter(fieldName = 'file', maxMb = 50, multiple = false) {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024 } });
    return multiple ? upload.array(fieldName, 50) : upload.single(fieldName);
  }

  async readUpload(req: Request): Promise<{ buffer: Buffer; filename: string; mimeType?: string }> {
    if (req.file?.buffer) {
      return { buffer: req.file.buffer, filename: req.file.originalname, mimeType: req.file.mimetype };
    }
    if (req.file?.path) {
      const buffer = await fs.readFile(req.file.path);
      return { buffer, filename: req.file.originalname, mimeType: req.file.mimetype };
    }
    throw new Error('No file uploaded');
  }

  async cleanup(req: Request) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
  }

  async writeTemp(buffer: Buffer, filename: string): Promise<string> {
    const dir = path.join(os.tmpdir(), 'greencard');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${filename}`);
    await fs.writeFile(filePath, buffer as Uint8Array);
    return filePath;
  }

  async remove(filePath: string) {
    await fs.unlink(filePath).catch(() => {});
  }
}
