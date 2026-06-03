const StorageService = require('./storageService');
const redisClient = require('../../config/redis');

/**
 * RedisStorageService
 * 
 * Implements short-term binary storage in Redis. The file buffer is stored directly
 * as a binary string, and metadata is stored in a JSON-serialized format under a 
 * separate key suffix (:metadata).
 */
class RedisStorageService extends StorageService {
  constructor() {
    super();
    this.isTemporary = true;
  }

  /**
   * Uploads a file buffer directly to Redis.
   */
  async upload(key, buffer, mimeType) {
    console.log(`[RedisStorageService] Uploading file for key: ${key}`);
    
    // Store the binary buffer
    await redisClient.set(key, buffer);
    
    // Store the metadata
    const metadata = {
      key,
      mimeType,
      sizeBytes: buffer.length,
      uploadedAt: new Date().toISOString()
    };
    await redisClient.set(`${key}:metadata`, JSON.stringify(metadata));
  }

  /**
   * Downloads the file buffer from Redis.
   */
  async download(key) {
    console.log(`[RedisStorageService] Downloading file for key: ${key}`);
    
    // We use getBuffer to retrieve binary data properly from Redis
    const buffer = await redisClient.getBuffer(key);
    if (!buffer) {
      throw new Error(`File with key '${key}' not found in temporary Redis storage.`);
    }
    return buffer;
  }

  /**
   * Deletes the file buffer and metadata from Redis.
   */
  async delete(key) {
    console.log(`[RedisStorageService] Deleting file and metadata for key: ${key}`);
    await redisClient.del(key);
    await redisClient.del(`${key}:metadata`);
  }
}

module.exports = RedisStorageService;
