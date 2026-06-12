import { FileStorageService } from '../infrastructure/storage/FileStorageService.js';
import { OpenAIService } from '../infrastructure/ai/OpenAIService.js';
import { RedisService } from '../infrastructure/cache/RedisService.js';
import { PrismaService } from '../infrastructure/prisma/PrismaService.js';
import { QueueService } from '../infrastructure/queue/QueueService.js';
import { OCRService } from '../modules/extraction/shared/OCRService.js';
import { DocumentParserService } from '../modules/extraction/shared/DocumentParserService.js';
import { ExtractorFactory } from '../modules/extraction/shared/ExtractorFactory.js';
import { PassportExtractor } from '../modules/extraction/passport/PassportExtractor.js';
import { VisaExtractor } from '../modules/extraction/visa/VisaExtractor.js';
import { DocumentExtractor } from '../modules/extraction/document/DocumentExtractor.js';
import { ChineseBusinessLicenseExtractor } from '../modules/extraction/chinese-business-license/ChineseBusinessLicenseExtractor.js';
import { PlaceholderExtractor, FUTURE_EXTRACTOR_TYPES } from '../modules/extraction/shared/PlaceholderExtractor.js';
import { TemplateRepository } from '../modules/template/TemplateRepository.js';
import { TemplateRendererService } from '../modules/template/TemplateRendererService.js';
import { TemplateService } from '../modules/template/TemplateService.js';

export class AppContainer {
  readonly storage = new FileStorageService();
  readonly ocr = new OCRService();
  readonly documentParser = new DocumentParserService();
  readonly openai = new OpenAIService();
  readonly redis = new RedisService();
  readonly prisma = new PrismaService();
  readonly queue = new QueueService();
  readonly extractorFactory = new ExtractorFactory();
  readonly templateRenderer = new TemplateRendererService();
  readonly templates: TemplateRepository;
  readonly templateService: TemplateService;

  constructor() {
    this.templates = new TemplateRepository(this.prisma);
    this.templateService = new TemplateService(this.templates, this.templateRenderer);

    this.extractorFactory.register('passport', new PassportExtractor());
    this.extractorFactory.register('visa', new VisaExtractor(this.ocr));
    this.extractorFactory.register('document', new DocumentExtractor(this.templates));
    this.extractorFactory.register(
      'chinese-business-license',
      new ChineseBusinessLicenseExtractor(this.ocr),
    );
    for (const type of FUTURE_EXTRACTOR_TYPES) {
      this.extractorFactory.register(type, new PlaceholderExtractor(type));
    }
  }

  async init() {
    await this.storage.ensureDirs();
    await this.prisma.connect();
    await this.redis.connect();
  }

  async shutdown() {
    await this.prisma.disconnect();
  }
}

export function createContainer() {
  return new AppContainer();
}
