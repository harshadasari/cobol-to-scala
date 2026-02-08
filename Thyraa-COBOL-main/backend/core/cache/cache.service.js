import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Cache Service
 * Centralized caching service using Redis
 */
export class CacheService {
  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 3) {
          return null;
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      showFriendlyErrorStack: false
    };
    
    this.memoryCache = new Map();
    this.defaultTTL = parseInt(process.env.CACHE_TTL || '3600');
    this.redis = null;
    this.redisErrorLogged = false;
    this.redisConnected = false;
    
    try {
      this.redis = new Redis(redisConfig);
      
      this.redis.on('error', (err) => {
        if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
          if (!this.redisErrorLogged) {
            console.warn('Redis connection unavailable, using in-memory cache only');
            this.redisErrorLogged = true;
          }
          this.redisConnected = false;
        }
      });
      
      this.redis.on('connect', () => {
        this.redisConnected = true;
        this.redisErrorLogged = false;
      });
      
      this.redis.on('ready', () => {
        this.redisConnected = true;
        this.redisErrorLogged = false;
      });
      
      this.redis.on('close', () => {
        this.redisConnected = false;
      });
    } catch (error) {
      this.redis = null;
      this.redisConnected = false;
    }
  }

  /**
   * Get cached value
   */
  async get(key) {
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        return this.memoryCache.get(key) || null;
      }
    }
    return this.memoryCache.get(key) || null;
  }

  /**
   * Set cached value
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (this.redis) {
      try {
        await this.redis.setex(key, ttl, JSON.stringify(value));
      } catch (error) {
        this.memoryCache.set(key, value);
        setTimeout(() => this.memoryCache.delete(key), ttl * 1000);
      }
    } else {
      this.memoryCache.set(key, value);
      setTimeout(() => this.memoryCache.delete(key), ttl * 1000);
    }
  }

  /**
   * Delete cached value
   */
  async delete(key) {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        this.memoryCache.delete(key);
      }
    } else {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Generate cache key for analysis result
   */
  getAnalysisKey(repoUrl, branch) {
    return `analysis:${Buffer.from(`${repoUrl}:${branch}`).toString('base64')}`;
  }

  /**
   * Generate cache key for job status
   */
  getJobKey(jobId) {
    return `job:${jobId}`;
  }

  /**
   * Clear all cache (only cache keys, not Bull queue keys)
   * Only clears keys that match our cache patterns: analysis:* and github:*
   */
  async clearAll() {
    if (this.redis) {
      try {
        // Only clear our cache keys, not Bull queue keys
        // Bull uses keys like bull:analysis:* for queue management
        const cacheKeys = await this.redis.keys('analysis:*');
        const githubKeys = await this.redis.keys('github:*');
        const allCacheKeys = [...cacheKeys, ...githubKeys];
        
        if (allCacheKeys.length > 0) {
          // Delete in batches to avoid overload
          const batchSize = 100;
          for (let i = 0; i < allCacheKeys.length; i += batchSize) {
            const batch = allCacheKeys.slice(i, i + batchSize);
            await this.redis.del(...batch);
          }
        }
        console.log(`Cleared ${allCacheKeys.length} cache keys from Redis (preserved queue keys)`);
        return { cleared: allCacheKeys.length, type: 'redis' };
      } catch (error) {
        console.error('Redis clear error:', error);
      }
    }
    // Clear in-memory cache
    const memoryKeys = Array.from(this.memoryCache.keys());
    memoryKeys.forEach(key => this.memoryCache.delete(key));
    console.log(`Cleared ${memoryKeys.length} cache keys from memory`);
    return { cleared: memoryKeys.length, type: 'memory' };
  }
}

export default CacheService;

