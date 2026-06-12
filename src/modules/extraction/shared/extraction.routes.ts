import { Router, type Request, type Response, type NextFunction } from 'express';
import type { ExtractorFactory } from './ExtractorFactory.js';
import type { FileStorageService } from '../../../infrastructure/storage/FileStorageService.js';
import { ValidationError } from '../../../common/exceptions/AppError.js';
import { sendSuccess } from '../../../common/utils/response.js';

export function createExtractionRoutes(factory: ExtractorFactory, storage: FileStorageService) {
  const router = Router();
  const upload = storage.multer('file', 25);

  async function handle(type: string, req: Request, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, mimeType } = await storage.readUpload(req);
      const data = await factory.get(type).extract(buffer, {
        templateId: String(req.body.templateId || req.query.templateId || ''),
        mimeType,
        filename,
        saveOutput: req.body.saveOutput !== 'false',
      });
      sendSuccess(res, { type, data });
    } catch (err) {
      next(err);
    } finally {
      await storage.cleanup(req);
    }
  }

  router.post('/passport', upload.single('file'), (req, res, next) => handle('passport', req, res, next));
  router.post('/visa', upload.single('file'), (req, res, next) => handle('visa', req, res, next));
  router.post('/document', upload.single('file'), (req, res, next) => handle('document', req, res, next));
  router.post('/:type', upload.single('file'), (req, res, next) => {
    const type = String(req.params.type || '');
    if (!type) return next(new ValidationError('type is required'));
    return handle(type, req, res, next);
  });

  return router;
}
