import type { TemplateRepository } from './TemplateRepository.js';
import type { TemplateRendererService } from './TemplateRendererService.js';
import {
  validateTemplateId,
  validateTemplateUpdateBody,
  validateTemplateCreateBody,
  resolveInlineTemplate,
  resolveRenderData,
} from '../../common/utils/templateValidation.js';

export class TemplateService {
  constructor(
    private readonly repo: TemplateRepository,
    private readonly renderer: TemplateRendererService,
  ) {}

  getById(id: string) {
    return this.repo.findById(validateTemplateId(id));
  }

  create(body: unknown) {
    const { id, data } = validateTemplateCreateBody(body);
    return this.repo.create(id, data);
  }

  update(id: string, body: unknown) {
    const validId = validateTemplateId(id);
    const patch = validateTemplateUpdateBody(body);
    return this.repo.update(validId, patch);
  }

  renderInline(body: Record<string, unknown>) {
    const template = resolveInlineTemplate(body);
    const data = resolveRenderData(body);
    return this.renderer.render(template, data);
  }

  async renderById(id: string, body: Record<string, unknown>) {
    const validId = validateTemplateId(id);
    const template = await this.repo.findById(validId);
    const data = resolveRenderData(body);
    const content = this.renderer.resolveTemplateContent(template);
    return { templateId: validId, rendered: this.renderer.render(content, data) };
  }

  list() {
    return this.repo.listIds();
  }
}
