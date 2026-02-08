import { graphql } from '@octokit/graphql';
import { apiConfig } from '../config/api.config.js';
import { RateLimiter } from '../config/rate-limiter.js';

/**
 * GitHub GraphQL service
 * Handles GraphQL queries for efficient batch fetching
 */
export class GitHubGraphQLService {
  constructor(token) {
    this.client = graphql.defaults({
      headers: {
        authorization: `token ${token || apiConfig.github.token}`,
      },
    });
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Execute GraphQL query
   */
  async query(query, variables = {}) {
    await this.rateLimiter.waitIfNeeded();
    
    try {
      const result = await this.client(query, variables);
      this.rateLimiter.recordRequest();
      return result;
    } catch (error) {
      if (error.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(error.errors)}`);
      }
      throw error;
    }
  }

  /**
   * Batch fetch multiple files
   * More efficient than REST API for multiple files
   */
  async batchFetchFiles(owner, repo, ref, paths) {
    // GraphQL query to fetch multiple files
    const query = `
      query GetFiles($owner: String!, $repo: String!, $ref: String!, $paths: [String!]!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $ref) {
            ... on Tree {
              entries {
                path
                object {
                  ... on Blob {
                    text
                  }
                }
              }
            }
          }
        }
      }
    `;

    // For large batches, split into chunks
    const chunkSize = 100;
    const chunks = [];
    
    for (let i = 0; i < paths.length; i += chunkSize) {
      chunks.push(paths.slice(i, i + chunkSize));
    }

    const results = [];
    
    for (const chunk of chunks) {
      // Note: GraphQL doesn't support filtering by path array directly
      // We'll need to fetch the tree and filter client-side
      // Or make individual queries (less efficient but works)
      const files = await Promise.all(
        chunk.map(path => this.getFileContent(owner, repo, ref, path))
      );
      results.push(...files);
    }

    return results;
  }

  /**
   * Get file content via GraphQL
   */
  async getFileContent(owner, repo, ref, path) {
    const query = `
      query GetFile($owner: String!, $repo: String!, $path: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $ref) {
            ... on Tree {
              entry(path: $path) {
                object {
                  ... on Blob {
                    text
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.query(query, {
      owner,
      repo,
      ref: `${ref}:${path}`,
      path
    });

    return result?.repository?.object?.entry?.object?.text || null;
  }

  /**
   * Get repository tree via GraphQL
   */
  async getRepositoryTree(owner, repo, ref = 'HEAD') {
    const query = `
      query GetTree($owner: String!, $repo: String!, $ref: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $ref) {
            ... on Tree {
              entries {
                path
                type
                oid
                mode
              }
            }
          }
        }
      }
    `;

    const result = await this.query(query, { owner, repo, ref });
    return result?.repository?.object?.entries || [];
  }
}

export default GitHubGraphQLService;

