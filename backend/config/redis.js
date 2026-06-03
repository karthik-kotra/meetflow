const Redis = require('ioredis');

let redisClient;

const useMock = process.env.USE_MOCK_REDIS === 'true';

if (useMock) {
  console.warn('⚠️ USE_MOCK_REDIS is enabled. Using in-memory mock Redis client.');
  redisClient = createMockRedis();
} else {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    console.log(`Connecting to Redis at: ${redisUrl}`);
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) {
          console.warn('⚠️ Redis connection failed. Falling back to in-memory mock client for local development.');
          redisClient = createMockRedis();
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisClient.on('error', (err) => {
      if (err.message.includes('ECONNREFUSED')) {
        // Suppress connection refuse logs since we fallback to the mock client gracefully
        return;
      }
      console.error('Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Connected to Redis successfully.');
    });
  } catch (err) {
    console.warn('⚠️ Failed to initialize Redis. Falling back to in-memory mock client.', err);
    redisClient = createMockRedis();
  }
}

/**
 * Creates an in-memory fallback mock client implementing the basic ioredis interface
 * needed for meeting recording metadata caching.
 */
function createMockRedis() {
  const store = new Map();
  return {
    isMock: true,
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async get(key) {
      return store.get(key) || null;
    },
    async getBuffer(key) {
      const val = store.get(key);
      return val ? Buffer.from(val) : null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    on(event, cb) {
      // noop
    }
  };
}

module.exports = redisClient;
