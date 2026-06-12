import { PrismaClient } from '@prisma/client';
import { env } from '../../config/env.js';
import { logger } from '../../common/logger/logger.js';

export class PrismaService {
  readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({ datasources: { db: { url: env.databaseUrl } } });
  }

  async connect() {
    try {
      await this.client.$connect();
      logger.info('PostgreSQL connected');
    } catch (err) {
      logger.warn('Database connection failed — file fallback active', err);
    }
  }

  async disconnect() {
    await this.client.$disconnect();
  }
}
