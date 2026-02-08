import { RepositoryService } from './services/repository.service.js';
import { FileFetcherService } from './services/file-fetcher.service.js';
import { selectStrategy } from './strategies/strategy-selector.js';

/**
 * Main entry point for GitHub ingestion
 * All GitHub operations are centralized here
 */
export class GitHubIngestion {
  constructor(token) {
    this.repositoryService = new RepositoryService(token);
    this.fileFetcherService = new FileFetcherService(token);
  }

  /**
   * Discover all COBOL files in repository
   * @param {string} repoUrl - GitHub repository URL
   * @param {string} branch - Branch name (default: 'main')
   * @returns {Promise<Object>} Discovery result with files and resolved branch
   */
  async discoverRepository(repoUrl, branch = 'main') {
    const { owner, repo } = this.repositoryService.parseUrl(repoUrl);
    const { files: tree, branch: resolvedBranch } = await this.repositoryService.getRepositoryTree(owner, repo, branch);
    const cobolFiles = this.repositoryService.filterCobolFiles(tree);
    
    return {
      files: cobolFiles,
      totalFiles: tree.length,
      cobolFiles: cobolFiles.length,
      owner,
      repo,
      branch: resolvedBranch
    };
  }

  /**
   * Fetch file contents using appropriate strategy
   * @param {Array} files - Array of file objects
   * @param {string} repoUrl - Repository URL
   * @param {string} branch - Branch name
   * @returns {Promise<Array>} Array of files with content
   */
  async fetchFiles(files, repoUrl, branch = 'main') {
    const { owner, repo } = this.repositoryService.parseUrl(repoUrl);
    const strategy = selectStrategy(files.length);
    
    return this.fileFetcherService.fetchFiles(files, strategy, {
      owner,
      repo,
      branch
    });
  }

  /**
   * Get repository metadata
   * @param {string} repoUrl - GitHub repository URL
   * @returns {Promise<Object>} Repository metadata
   */
  async getRepositoryMetadata(repoUrl) {
    const { owner, repo } = this.repositoryService.parseUrl(repoUrl);
    return this.repositoryService.getMetadata(owner, repo);
  }
}

export default GitHubIngestion;

