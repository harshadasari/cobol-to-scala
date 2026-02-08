import Redis from 'ioredis';

/**
 * Cache manager for repository data
 * Uses Redis for caching repository trees and file contents
 */
export class CacheManager {
  constructor(redisConfig = {}) {
    this.redis = redisConfig.host ? new Redis(redisConfig) : null;
    this.memoryCache = new Map(); // Fallback if Redis not available
    this.defaultTTL = 3600; // 1 hour
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
        console.error('Redis get error:', error);
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
        console.error('Redis set error:', error);
        this.memoryCache.set(key, value);
      }
    } else {
      this.memoryCache.set(key, value);
      // Simple TTL for memory cache
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
        console.error('Redis delete error:', error);
        this.memoryCache.delete(key);
      }
    } else {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Generate cache key for repository tree
   */
  getTreeKey(owner, repo, branch) {
    return `repo:tree:${owner}:${repo}:${branch}`;
  }

  /**
   * Generate cache key for file content
   */
  getFileKey(owner, repo, branch, path) {
    return `repo:file:${owner}:${repo}:${branch}:${path}`;
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    if (this.redis) {
      try {
        const keys = await this.redis.keys('repo:*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        console.log(`Cleared ${keys.length} cache keys from Redis`);
      } catch (error) {
        console.error('Redis clear error:', error);
      }
    }
    // Clear in-memory cache
    const memoryKeys = Array.from(this.memoryCache.keys()).filter(key => key.startsWith('repo:'));
    memoryKeys.forEach(key => this.memoryCache.delete(key));
    if (memoryKeys.length > 0) {
      console.log(`Cleared ${memoryKeys.length} cache keys from memory`);
    }
  }
}

export default CacheManager;

