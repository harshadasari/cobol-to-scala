/**
 * Rate limiter for GitHub API requests
 * Tracks requests and implements exponential backoff
 */
export class RateLimiter {
  constructor() {
    this.requests = [];
    this.maxRequests = 5000; // Authenticated limit
    this.windowMs = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Check if we can make a request
   */
  canMakeRequest() {
    const now = Date.now();
    // Remove requests outside the window
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    return this.requests.length < this.maxRequests;
  }

  /**
   * Record a request
   */
  recordRequest() {
    this.requests.push(Date.now());
  }

  /**
   * Get time until next request can be made
   */
  getTimeUntilNextRequest() {
    if (this.canMakeRequest()) return 0;
    
    const oldestRequest = Math.min(...this.requests);
    const timeSinceOldest = Date.now() - oldestRequest;
    return this.windowMs - timeSinceOldest;
  }

  /**
   * Wait if rate limit is reached
   */
  async waitIfNeeded() {
    if (!this.canMakeRequest()) {
      const waitTime = this.getTimeUntilNextRequest();
      if (waitTime > 0) {
        console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
        await this.sleep(waitTime);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RateLimiter;

