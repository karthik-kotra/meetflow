const RedisStorageService = require('./redisStorageService');
const S3StorageService = require('./s3StorageService');
const LocalStorageService = require('./localStorageService');

const provider = (process.env.STORAGE_PROVIDER || 'redis').toLowerCase();

let storageService;

if (provider === 's3') {
  storageService = new S3StorageService();
} else if (provider === 'local') {
  storageService = new LocalStorageService();
} else {
  // Default fallback is Redis short-term temporary cache
  storageService = new RedisStorageService();
}


console.log(`✅ MeetFlow Storage Provider selected: ${provider.toUpperCase()}`);

module.exports = storageService;
