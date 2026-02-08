import { GitHubAPIService } from './github-api.service.js';
import { GitHubGraphQLService } from './github-graphql.service.js';
import { parseGitHubUrl } from '../utils/url-parser.js';
import { CacheManager } from '../utils/cache-manager.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Repository service
 * High-level service for repository operations
 */
export class RepositoryService {
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
   * Parse GitHub URL
   */
  parseUrl(repoUrl) {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed.valid) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }
    return parsed;
  }

  /**
   * Get repository tree (always fresh - no caching)
   * Returns both files and resolved branch
   */
  async getRepositoryTree(owner, repo, branch = 'main', recursive = true) {
    // First, verify repository exists
    let resolvedBranch = branch;
    try {
      const repoInfo = await this.getMetadata(owner, repo);
      
      // If branch not specified or doesn't exist, use default branch
      if (branch && branch !== repoInfo.default_branch) {
        // Try to verify the branch exists by calling the ref API
        try {
          await this.apiService.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner,
            repo,
            ref: `heads/${branch}`
          });
        } catch (refError) {
          if (refError.status === 404) {
            // Branch doesn't exist, use default
            const defaultBranch = repoInfo.default_branch || 'main';
            console.warn(`Branch '${branch}' not found, using default branch: ${defaultBranch}`);
            resolvedBranch = defaultBranch;
          } else {
            throw refError;
          }
        }
      } else if (!branch) {
        // No branch specified, use default
        resolvedBranch = repoInfo.default_branch || 'main';
      } else {
        // Branch is already the default branch
        resolvedBranch = branch;
      }
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repo}. Please check the repository URL.`);
      }
      throw error;
    }
    
    // Always fetch fresh data from GitHub (no cache)
    const tree = await this.apiService.getTree(owner, repo, resolvedBranch, recursive);
    
    // Filter only blob files (not directories)
    const files = tree.tree.filter(item => item.type === 'blob');
    
    return { files, branch: resolvedBranch };
  }

  /**
   * Get repository metadata
   */
  async getMetadata(owner, repo) {
    return this.apiService.getRepository(owner, repo);
  }

  /**
   * Filter COBOL files
   */
  filterCobolFiles(files) {
    const cobolExtensions = /\.(cbl|cob|cpy|jcl|jclproc)$/i;
    return files.filter(file => cobolExtensions.test(file.path));
  }
}

export default RepositoryService;

