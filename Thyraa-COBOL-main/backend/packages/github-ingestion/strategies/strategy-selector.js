/**
 * Select appropriate strategy based on file count
 */
export function selectStrategy(fileCount) {
  if (fileCount < 1000) {
    return 'small-repo';
  } else if (fileCount < 10000) {
    return 'medium-repo';
  } else {
    return 'large-repo';
  }
}

export default selectStrategy;

