import type { Extractor, ExtractorContext } from '../shared/Extractor.js';
import type { TemplateRepository } from '../../template/TemplateRepository.js';
import { ValidationError } from '../../../common/exceptions/AppError.js';
import { paths } from '../../../config/paths.js';
import { runDocumentExtraction } from '../document/lib/run-extraction.js';

export class DocumentExtractor implements Extractor {
  readonly type = 'document';

  constructor(
    private readonly templates: TemplateRepository,
    private readonly outputDir = paths.output,
  ) {}

  async extract(file: Buffer, context?: ExtractorContext): Promise<unknown> {
    const templateId = context?.templateId;
    if (!templateId) throw new ValidationError('templateId is required for document extraction');

    const template = await this.templates.findById(templateId);
    return runDocumentExtraction({
      buffer: file,
      filename: context?.filename || 'document.pdf',
      mimeType: context?.mimeType,
      template,
      outputDir: this.outputDir,
      saveOutput: context?.saveOutput !== false,
    });
  }
}
