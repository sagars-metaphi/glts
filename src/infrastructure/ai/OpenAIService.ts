import { env } from '../../config/env.js';
import { logger } from '../../common/logger/logger.js';

export class OpenAIService {
  constructor(private readonly apiKey = env.openAiApiKey) {}

  get enabled() {
    return Boolean(this.apiKey);
  }

  async complete(_prompt: string): Promise<string> {
    if (!this.enabled) throw new Error('OpenAI is not configured');
    logger.warn('OpenAIService.complete is not implemented');
    throw new Error('OpenAI integration pending');
  }
}
