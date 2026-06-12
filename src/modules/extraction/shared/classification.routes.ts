import { Router, type Request, type Response, type NextFunction } from 'express';
import type { FileStorageService } from '../../../infrastructure/storage/FileStorageService.js';
import { ValidationError } from '../../../common/exceptions/AppError.js';
import { sendSuccess } from '../../../common/utils/response.js';
import { extractMRZ } from './lib/mrz-extract.js';
import { classifyDocumentFromMRZ } from './lib/classifier.js';

export function createClassificationRoutes(storage: FileStorageService) {
  const router = Router();
  const single = storage.memoryMulter('document', 50, false);
  const batch = storage.memoryMulter('documents', 50, true);

  router.post('/classify', single, async (req, res, next) => {
    try {
      const { buffer } = await storage.readUpload(req);
      const extraction = await extractMRZ(buffer);
      sendSuccess(res, { classification: classifyDocumentFromMRZ(extraction.mrzData, extraction.rawText), extraction });
    } catch (err) {
      next(err);
    }
  });

  router.post('/classify-batch', batch, async (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files?.length) throw new ValidationError('Upload files as "documents"');
      const results = await Promise.all(
        files.map(async (f) => {
          const extraction = await extractMRZ(f.buffer);
          return {
            filename: f.originalname,
            classification: classifyDocumentFromMRZ(extraction.mrzData, extraction.rawText),
            extraction,
          };
        }),
      );
      sendSuccess(res, { total: results.length, results });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
