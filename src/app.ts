import express from 'express';
import cors from 'cors';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { createContainer } from './config/container.js';
import { createExtractionRoutes } from './modules/extraction/shared/extraction.routes.js';
import { createClassificationRoutes } from './modules/extraction/shared/classification.routes.js';
import { createTemplateRoutes } from './modules/template/template.routes.js';
import { errorHandler } from './common/middleware/errorHandler.js';
import { securityHeaders } from './common/middleware/securityHeaders.js';
import { rateLimit } from './common/middleware/rateLimit.js';
import { paths } from './config/paths.js';
import { swaggerSpec } from './config/swagger.js';
import { sendSuccess } from './common/utils/response.js';

export async function createApp() {
  const container = createContainer();
  await container.storage.ensureDirs(paths.templates, paths.output);
  await container.init();

  const app = express();
  app.use(cors());
  app.use(compression());
  app.use(securityHeaders);
  app.use(rateLimit());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => sendSuccess(res, { status: 'ok', service: 'GreenCard API' }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  app.use('/extraction', createExtractionRoutes(container.extractorFactory, container.storage));
  app.use('/api/extraction', createExtractionRoutes(container.extractorFactory, container.storage));
  app.use('/api/classification', createClassificationRoutes(container.storage));
  app.use('/templates', createTemplateRoutes(container.templateService));
  app.use('/api/templates', createTemplateRoutes(container.templateService));

  app.get('/', (_req, res) => {
    sendSuccess(res, {
      name: 'GreenCard Extraction API',
      extraction: '/api/extraction/{passport|visa|document|:type}',
      classification: '/api/classification/classify-batch',
      templates: '/api/templates/:id',
      docs: '/api/docs',
      extractors: container.extractorFactory.types(),
    });
  });

  app.use(errorHandler);
  return { app, container };
}
