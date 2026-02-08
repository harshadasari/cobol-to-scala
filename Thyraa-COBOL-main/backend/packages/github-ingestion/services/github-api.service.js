import { Octokit } from '@octokit/rest';
import { apiConfig } from '../config/api.config.js';
import { RateLimiter } from '../config/rate-limiter.js';

/**
 * GitHub REST API service
 * Handles all REST API calls with rate limiting and retry logic
 */
export class GitHubAPIService {
  constructor(token) {
    this.octokit = new Octokit({ 
      auth: token || apiConfig.github.token,
      baseUrl: apiConfig.github.baseUrl,
      request: {
        timeout: apiConfig.github.timeout
      }
    });
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Make a request with retry logic
   */
  async request(method, endpoint, options = {}) {
    let lastError;
    
    for (let attempt = 0; attempt < apiConfig.github.retries; attempt++) {
      try {
        await this.rateLimiter.waitIfNeeded();
        
        const response = await this.octokit.request(method, endpoint, options);
        this.rateLimiter.recordRequest();
        
        return response;
      } catch (error) {
        lastError = error;
        
        // If rate limited, wait and retry
        if (error.status === 403 && error.response?.headers['x-ratelimit-remaining'] === '0') {
          const resetTime = parseInt(error.response.headers['x-ratelimit-reset']) * 1000;
          const waitTime = resetTime - Date.now();
          if (waitTime > 0) {
            console.log(`Rate limit exceeded. Waiting ${waitTime}ms...`);
            await this.sleep(waitTime);
            continue;
          }
        }
        
        // Retry on server errors
        if (error.status >= 500 && attempt < apiConfig.github.retries - 1) {
          const delay = apiConfig.github.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Get repository tree
   */
  async getTree(owner, repo, branch, recursive = false) {
    try {
      // First, try to get the branch ref
      let branchSha;
      try {
        const refResponse = await this.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
          owner,
          repo,
          ref: `heads/${branch}`
        });
        branchSha = refResponse.data.object.sha;
      } catch (refError) {
        if (refError.status === 404) {
          // Branch doesn't exist, try to get default branch
          const repoInfo = await this.getRepository(owner, repo);
          const defaultBranch = repoInfo.default_branch || 'main';
          
          if (defaultBranch === branch) {
            // Already tried default branch, throw original error
            throw new Error(`Branch '${branch}' not found. Default branch is '${defaultBranch}'`);
          }
          
          // Try default branch
          const defaultRefResponse = await this.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner,
            repo,
            ref: `heads/${defaultBranch}`
          });
          branchSha = defaultRefResponse.data.object.sha;
          
          // Warn that we're using default branch
          console.warn(`Branch '${branch}' not found, using default branch '${defaultBranch}'`);
        } else {
          throw refError;
        }
      }
      
      // Get tree using branch SHA
      const treeResponse = await this.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner,
        repo,
        tree_sha: branchSha,
        recursive: recursive ? 1 : undefined
      });
      
      return treeResponse.data;
    } catch (error) {
      // Improve error message
      if (error.status === 404) {
        throw new Error(`Repository or branch not found: ${owner}/${repo}@${branch}. Please check the repository URL and branch name.`);
      }
      throw error;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(owner, repo, path, ref = 'main') {
    const response = await this.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path,
      ref
    });
    
    // Decode base64 content
    if (response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    return null;
  }

  /**
   * Get repository metadata
   */
  async getRepository(owner, repo) {
    const response = await this.request('GET /repos/{owner}/{repo}', {
      owner,
      repo
    });
    return response.data;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default GitHubAPIService;

