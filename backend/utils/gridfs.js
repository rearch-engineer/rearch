import { GridFSBucket } from 'mongodb';
import mongoose from 'mongoose';

/**
 * Get GridFS bucket instance
 * @param {string} bucketName - Name of the GridFS bucket (default: 'attachments')
 * @returns {GridFSBucket} GridFS bucket instance
 * @throws {Error} If database connection is not established
 */
export const getGridFSBucket = (bucketName = 'attachments') => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  return new GridFSBucket(db, { bucketName });
};

/**
 * Upload a file to GridFS
 * @param {Buffer} buffer - File content as buffer
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type of the file
 * @param {string} bucketName - GridFS bucket name (default: 'attachments')
 * @param {Object} extraMetadata - Additional metadata fields to store (e.g. { public: true })
 * @returns {Promise<mongoose.Types.ObjectId>} GridFS file ID
 * @throws {Error} If upload fails
 */
export const uploadFile = async (buffer, filename, contentType, bucketName = 'attachments', extraMetadata = {}) => {
  if (!buffer || !filename) {
    throw new Error('Buffer and filename are required for file upload');
  }

  const bucket = getGridFSBucket(bucketName);
  
  // Create upload stream
  const uploadStream = bucket.openUploadStream(filename, {
    contentType,
    metadata: {
      originalName: filename,
      uploadDate: new Date(),
      ...extraMetadata,
    }
  });

  // Write buffer to GridFS
  uploadStream.end(buffer);

  // Wait for upload to complete
  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
  });

  return uploadStream.id;
};

/**
 * Get a readable stream for downloading a file from GridFS
 * @param {mongoose.Types.ObjectId|string} fileId - GridFS file ID
 * @param {string} bucketName - GridFS bucket name (default: 'attachments')
 * @returns {ReadableStream} Readable stream for the file
 * @throws {Error} If file is not found
 */
export const downloadFileStream = (fileId, bucketName = 'attachments') => {
  const bucket = getGridFSBucket(bucketName);
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  
  return bucket.openDownloadStream(objectId);
};

/**
 * Get file metadata from GridFS
 * @param {mongoose.Types.ObjectId|string} fileId - GridFS file ID
 * @param {string} bucketName - GridFS bucket name (default: 'attachments')
 * @returns {Promise<Object|null>} File metadata or null if not found
 */
export const getFileInfo = async (fileId, bucketName = 'attachments') => {
  const bucket = getGridFSBucket(bucketName);
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  
  const files = await bucket.find({ _id: objectId }).toArray();
  return files.length > 0 ? files[0] : null;
};

/**
 * Delete a file from GridFS
 * @param {mongoose.Types.ObjectId|string} fileId - GridFS file ID
 * @param {string} bucketName - GridFS bucket name (default: 'attachments')
 * @returns {Promise<void>}
 * @throws {Error} If deletion fails
 */
export const deleteFile = async (fileId, bucketName = 'attachments') => {
  const bucket = getGridFSBucket(bucketName);
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  
  await bucket.delete(objectId);
};

export default {
  getGridFSBucket,
  uploadFile,
  downloadFileStream,
  getFileInfo,
  deleteFile
};
