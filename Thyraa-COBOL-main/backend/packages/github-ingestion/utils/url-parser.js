/**
 * Parse GitHub repository URL
 * Supports formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
export function parseGitHubUrl(url) {
  // Remove .git suffix if present
  const cleanUrl = url.replace(/\.git$/, '');
  
  // HTTPS/HTTP format
  let match = cleanUrl.match(/github\.com[/:]([^\/]+)\/([^\/]+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      valid: true
    };
  }
  
  // SSH format
  match = cleanUrl.match(/git@github\.com:([^\/]+)\/([^\/]+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      valid: true
    };
  }
  
  return {
    owner: null,
    repo: null,
    valid: false
  };
}

export default parseGitHubUrl;

