import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
  server: {
    port: process.env.PORT || 3002, // Changed to 3002 to avoid conflicts
    env: process.env.NODE_ENV || 'development'
  },
  github: {
    token: process.env.GITHUB_TOKEN || ''
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600')
  },
  processing: {
    workerSize: parseInt(process.env.WORKER_SIZE || '4'),
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1000')
  }
};

export default appConfig;

