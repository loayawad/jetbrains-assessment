import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'scheduler',
    user: process.env.POSTGRES_USER || 'scheduler',
    password: process.env.POSTGRES_PASSWORD || 'scheduler123',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  scheduler: {
    tickInterval: parseInt(process.env.SCHEDULER_TICK_INTERVAL || '1000', 10),
    lockTTL: parseInt(process.env.LOCK_TTL || '30000', 10), // 30 seconds
  },
  retry: {
    maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
    backoffBase: parseInt(process.env.RETRY_BACKOFF_BASE || '1000', 10),
  },
};
