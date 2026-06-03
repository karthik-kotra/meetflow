/**
 * StorageService Interface/Base Class
 * 
 * This class defines the interface for file storage operations in MeetFlow.
 * By extending this class, developers can implement different storage backends
 * (e.g., Redis for local caching, AWS S3 or GCP Cloud Storage for production)
 * without changing the core business logic of recording uploads or AI transcription.
 */
class StorageService {
  constructor() {
    this.isTemporary = false;
  }

  /**
   * Uploads a file buffer to the storage system.
   * @param {string} key Unique file identifier (e.g. recording_123)
   * @param {Buffer} buffer The binary file data
   * @param {string} mimeType The mime-type of the file (e.g. video/webm)
   * @returns {Promise<void>}
   */
  async upload(key, buffer, mimeType) {
    throw new Error("Method 'upload(key, buffer, mimeType)' must be implemented");
  }

  /**
   * Downloads a file from the storage system.
   * @param {string} key Unique file identifier
   * @returns {Promise<Buffer>} The file binary buffer
   */
  async download(key) {
    throw new Error("Method 'download(key)' must be implemented");
  }

  /**
   * Deletes a file from the storage system.
   * @param {string} key Unique file identifier
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error("Method 'delete(key)' must be implemented");
  }
}

module.exports = StorageService;
