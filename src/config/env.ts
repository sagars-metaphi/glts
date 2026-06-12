import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/greencard',
  redisUrl: process.env.REDIS_URL || '',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
};
