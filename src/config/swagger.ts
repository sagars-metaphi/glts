export const swaggerSpec = {
  openapi: '3.0.3',
  info: { title: 'GreenCard API', version: '3.0.0' },
  servers: [{ url: 'http://localhost:3001' }],
  paths: {
    '/api/extraction/passport': { post: { summary: 'Extract passport fields' } },
    '/api/extraction/visa': { post: { summary: 'Extract visa MRZ' } },
    '/api/extraction/document': { post: { summary: 'Extract document by templateId' } },
    '/api/extraction/chinese-business-license': {
      post: { summary: 'Extract Chinese business license (营业执照) fields' },
    },
    '/api/extraction/{type}': { post: { summary: 'Dynamic extractor' } },
    '/api/classification/classify-batch': { post: { summary: 'Batch classify documents' } },
    '/api/templates/{id}': { get: { summary: 'Get template' }, put: { summary: 'Update template' } },
    '/api/templates/render': { post: { summary: 'Render template body' } },
    '/api/templates/{id}/render': { post: { summary: 'Render stored template' } },
  },
};
