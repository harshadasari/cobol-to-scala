/**
 * Medium repository strategy (1000-10000 files)
 * - GraphQL batches
 * - Parallel fetching
 * - Worker threads for parsing
 */
export class MediumRepoStrategy {
  constructor(fileFetcher) {
    this.fileFetcher = fileFetcher;
  }

  async fetch(files, options) {
    return this.fileFetcher.fetchFiles(files, 'medium-repo', options);
  }
}

export default MediumRepoStrategy;

