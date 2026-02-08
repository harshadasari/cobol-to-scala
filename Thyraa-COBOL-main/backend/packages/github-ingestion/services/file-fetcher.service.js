import { GitHubAPIService } from './github-api.service.js';
import { GitHubGraphQLService } from './github-graphql.service.js';
import { CacheManager } from '../utils/cache-manager.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * File fetcher service
 * Handles fetching file contents with different strategies
 */
export class FileFetcherService {
  constructor(token) {
    this.token = token || process.env.GITHUB_TOKEN;
    this.apiService = new GitHubAPIService(this.token);
    this.graphqlService = new GitHubGraphQLService(this.token);
    this.cache = new CacheManager({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    });
  }

  /**
   * Fetch files using specified strategy
   */
  async fetchFiles(files, strategy, options = {}) {
    const { owner, repo, branch } = options;
    
    switch (strategy) {
      case 'small-repo':
        return this.fetchSmallRepo(files, owner, repo, branch);
      case 'medium-repo':
        return this.fetchMediumRepo(files, owner, repo, branch);
      case 'large-repo':
        return this.fetchLargeRepo(files, owner, repo, branch);
      default:
        return this.fetchSmallRepo(files, owner, repo, branch);
    }
  }

  /**
   * Small repo strategy: REST API, sequential batches
   */
  async fetchSmallRepo(files, owner, repo, branch) {
    const results = [];
    const batchSize = 20;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(file => this.fetchSingleFile(owner, repo, branch, file))
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Medium repo strategy: GraphQL batches, parallel
   */
  async fetchMediumRepo(files, owner, repo, branch) {
    const results = [];
    const batchSize = 50;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(file => this.fetchSingleFile(owner, repo, branch, file, true))
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Large repo strategy: GraphQL with streaming
   */
  async fetchLargeRepo(files, owner, repo, branch) {
    // Similar to medium but with progress tracking
    return this.fetchMediumRepo(files, owner, repo, branch);
  }

  /**
   * Fetch a single file (always fresh - no caching)
   */
  async fetchSingleFile(owner, repo, branch, file, useGraphQL = false) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'file-fetcher.service.js:89',message:'fetchSingleFile entry',data:{filePath:file.path,useGraphQL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Always fetch fresh data from GitHub (no cache)
    let content;
    if (useGraphQL) {
      content = await this.graphqlService.getFileContent(owner, repo, branch, file.path);
    } else {
      content = await this.apiService.getFileContent(owner, repo, file.path, branch);
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'file-fetcher.service.js:106',message:'fetched from github',data:{filePath:file.path,contentLength:content?.length||0,contentLines:content?.split('\n').length||0,hasContent:!!content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return {
      ...file,
      content: content || ''
    };
  }
}

export default FileFetcherService;

