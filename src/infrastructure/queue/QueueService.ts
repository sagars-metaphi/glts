import { logger } from '../../common/logger/logger.js';

export class QueueService {
  async enqueue(name: string, payload: unknown): Promise<string> {
    logger.debug(`Queue stub: ${name}`, payload);
    return `job-${Date.now()}`;
  }
}
