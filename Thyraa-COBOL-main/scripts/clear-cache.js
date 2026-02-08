import { CacheService } from '../backend/core/cache/cache.service.js';
import { CacheManager } from '../backend/packages/github-ingestion/utils/cache-manager.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../backend/.env') });

async function clearCache() {
  console.log('Clearing all cache...\n');
  
  const cacheService = new CacheService();
  const cacheManager = new CacheManager({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  });

  try {
    const cacheResult = await cacheService.clearAll();
    const githubCacheResult = await cacheManager.clearAll();
    
    console.log('✓ Backend cache cleared:', cacheResult);
    console.log('✓ GitHub cache cleared:', githubCacheResult);
    console.log('\nCache cleared successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error clearing cache:', error);
    process.exit(1);
  }
}

clearCache();

