/**
 * Large repository strategy (>10000 files)
 * - GraphQL + pagination
 * - Streaming
 * - Async job queue
 * - Progress tracking
 */
export class LargeRepoStrategy {
  constructor(fileFetcher) {
    this.fileFetcher = fileFetcher;
  }

  async fetch(files, options) {
    return this.fileFetcher.fetchFiles(files, 'large-repo', options);
  }
}

export default LargeRepoStrategy;

