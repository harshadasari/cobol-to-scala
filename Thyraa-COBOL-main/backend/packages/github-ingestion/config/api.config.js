import dotenv from 'dotenv';

dotenv.config();

export const apiConfig = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    baseUrl: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000, // 1 second
  },
  rateLimits: {
    authenticated: 5000, // requests per hour
    unauthenticated: 60, // requests per hour
  },
};

export default apiConfig;

