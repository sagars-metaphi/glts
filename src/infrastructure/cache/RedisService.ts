import { env } from '../../config/env.js';
import { logger } from '../../common/logger/logger.js';

export class RedisService {
  constructor(private readonly url = env.redisUrl) {}

  async connect() {
    if (!this.url) logger.info('Redis disabled');
  }
}
