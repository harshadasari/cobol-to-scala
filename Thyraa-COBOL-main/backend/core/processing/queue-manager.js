import Queue from 'bull';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Queue Manager
 * Manages job queue using Bull
 */
export function createAnalysisQueue() {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3
  };
  
  const analysisQueue = new Queue('analysis', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000 // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600 // Keep failed jobs for 7 days
      }
    }
  });
  
  // Handle Redis connection errors gracefully (suppress repeated errors)
  let errorLogged = false;
  let lastErrorTime = 0;
  const ERROR_LOG_INTERVAL = 30000; // Log error max once per 30 seconds
  
  analysisQueue.on('error', (error) => {
    const now = Date.now();
    if (!errorLogged || (now - lastErrorTime) > ERROR_LOG_INTERVAL) {
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        console.warn('Redis connection failed. Queue operations will not work.');
        console.warn('   The server will continue running, but analysis jobs will fail.');
        console.warn('   To enable job queue:');
        console.warn('   1. Install Docker: https://docs.docker.com/get-docker/');
        console.warn('   2. Start Redis: docker run -d -p 6379:6379 redis:latest');
        console.warn('   (This warning will not repeat for 30 seconds)\n');
        errorLogged = true;
        lastErrorTime = now;
      } else {
        // Log other errors normally
        console.error('Queue error:', error.message);
      }
    }
  });
  
  analysisQueue.on('waiting', (jobId) => {
    console.log(`Job ${jobId} is waiting`);
  });
  
  analysisQueue.on('active', (job) => {
    console.log(`Job ${job.id} is now active`);
  });
  
  analysisQueue.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });
  
  analysisQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });
  
  return analysisQueue;
}

export default createAnalysisQueue;

