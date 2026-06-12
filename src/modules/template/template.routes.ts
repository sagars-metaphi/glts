import { Router, type Request, type Response, type NextFunction } from 'express';
import type { TemplateService } from './TemplateService.js';
import { validateTemplateUpdateBody } from '../../common/utils/templateValidation.js';
import { sendSuccess } from '../../common/utils/response.js';

export function createTemplateRoutes(service: TemplateService) {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      sendSuccess(res, { templates: await service.list() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const template = await service.create(req.body);
      sendSuccess(res, { template }, 201);
    } catch (err) {
      next(err);
    }
  });

  // A. Render inline body — no DB lookup
  router.post('/render', async (req, res, next) => {
    try {
      const body = validateTemplateUpdateBody(req.body);
      sendSuccess(res, { rendered: service.renderInline(body) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      sendSuccess(res, { template: await service.getById(String(req.params.id)) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const body = validateTemplateUpdateBody(req.body);
      sendSuccess(res, { template: await service.update(id, body) });
    } catch (err) {
      next(err);
    }
  });

  // B. Render stored template by id
  router.post('/:id/render', async (req, res, next) => {
    try {
      const body = validateTemplateUpdateBody(req.body ?? {});
      sendSuccess(res, await service.renderById(String(req.params.id), body));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
