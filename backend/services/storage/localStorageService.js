const fs = require('fs');
const path = require('path');
const StorageService = require('./storageService');

/**
 * LocalStorageService
 * 
 * Implements persistent disk storage. Recordings are saved in a local folder
 * inside the backend codebase (e.g. backend/uploads/recordings/).
 * Since isTemporary = false, files are NOT deleted after transcription.
 */
class LocalStorageService extends StorageService {
  constructor() {
    super();
    this.isTemporary = false;
    
    // Define target persistent uploads directory
    this.uploadDir = path.join(__dirname, '..', '..', 'uploads', 'recordings');
    console.log(`[LocalStorageService] Initialized. Files will save to: ${this.uploadDir}`);
  }

  /**
   * Helper to ensure the target directory exists.
   */
  _ensureDirectoryExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Gets the file path for a given storage key.
   * @param {string} key Unique file identifier
   * @returns {string} Absolute file path
   */
  _getFilePath(key) {
    // Standardize suffix to webm since we save browser MediaRecorder output
    return path.join(this.uploadDir, `${key}.webm`);
  }

  /**
   * Writes the file buffer persistently to disk.
   */
  async upload(key, buffer, mimeType) {
    console.log(`[LocalStorageService] Persisting file to disk: ${key}`);
    try {
      this._ensureDirectoryExists();
      const filePath = this._getFilePath(key);
      await fs.promises.writeFile(filePath, buffer);
      console.log(`[LocalStorageService] File written successfully: ${filePath}`);
    } catch (err) {
      console.error(`[LocalStorageService] Upload failed for ${key}:`, err);
      throw err;
    }
  }

  /**
   * Reads the file buffer from disk.
   */
  async download(key) {
    console.log(`[LocalStorageService] Reading file from disk: ${key}`);
    try {
      const filePath = this._getFilePath(key);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File '${key}' not found on local disk at ${filePath}`);
      }
      return await fs.promises.readFile(filePath);
    } catch (err) {
      console.error(`[LocalStorageService] Download failed for ${key}:`, err);
      throw err;
    }
  }

  /**
   * Deletes the file from disk (can be called manually).
   */
  async delete(key) {
    console.log(`[LocalStorageService] Deleting file from disk: ${key}`);
    try {
      const filePath = this._getFilePath(key);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`[LocalStorageService] File deleted successfully: ${filePath}`);
      }
    } catch (err) {
      console.error(`[LocalStorageService] Delete failed for ${key}:`, err);
    }
  }
}

module.exports = LocalStorageService;
