/**
 * Small repository strategy (<1000 files)
 * - Simple REST API
 * - Sequential/small batches
 * - Fast for small repos
 */
export class SmallRepoStrategy {
  constructor(fileFetcher) {
    this.fileFetcher = fileFetcher;
  }

  async fetch(files, options) {
    return this.fileFetcher.fetchFiles(files, 'small-repo', options);
  }
}

export default SmallRepoStrategy;

