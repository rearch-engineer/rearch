import { Elysia } from 'elysia';
import {
  uploadFile,
  downloadFileStream,
  getFileInfo,
} from '../utils/gridfs.js';
import { authPlugin } from '../middleware/auth.js';
import { logger } from '../logger.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

// ============================================================================
// Private (authenticated) file routes
// ============================================================================

const privateRouter = new Elysia({ prefix: '/api/files' })
  .use(authPlugin)

  /**
   * Upload files to GridFS
   * POST /api/files/upload
   * Body: multipart/form-data with field "files" (multiple)
   * Returns: array of { fileId, filename, contentType, size }
   */
  .post('/upload', async ({ body, status }) => {
    try {
      const raw = body.files;
      const files = Array.isArray(raw) ? raw : raw ? [raw] : [];

      if (files.length === 0) {
        return status(400, { error: 'No files provided' });
      }

      const results = [];

      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileId = await uploadFile(buffer, file.name, file.type);
        results.push({
          fileId: fileId.toString(),
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });
      }

      return results;
    } catch (err) {
      logger.error({ err }, 'error uploading files');
      return status(500, { error: err.message });
    }
  })

  /**
   * Serve / download a file from GridFS
   * GET /api/files/:fileId
   */
  .get('/:fileId', async ({ params: { fileId }, status }) => {
    try {
      if (!OBJECT_ID_RE.test(fileId)) {
        return status(400, {
          error: 'Invalid fileId format. Expected a 24-character hex string.',
        });
      }

      const fileInfo = await getFileInfo(fileId);
      if (!fileInfo) {
        return status(404, { error: 'file-not-found' });
      }

      const headers = {
        'Content-Type': fileInfo.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${fileInfo.filename}"`,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      if (fileInfo.length) {
        headers['Content-Length'] = fileInfo.length.toString();
      }

      const stream = downloadFileStream(fileId);
      return new Response(stream, { headers });
    } catch (err) {
      logger.error({ err }, 'error serving file');
      return status(500, { error: err.message });
    }
  });

// ============================================================================
// Public (unauthenticated) file routes
// ============================================================================

const publicRouter = new Elysia({ prefix: '/api/files' })

  /**
   * Serve files flagged with metadata.public = true (no auth required)
   * GET /api/files/public/:fileId
   */
  .get('/public/:fileId', async ({ params: { fileId }, status }) => {
    try {
      if (!OBJECT_ID_RE.test(fileId)) {
        return status(400, {
          error: 'Invalid fileId format. Expected a 24-character hex string.',
        });
      }

      const fileInfo = await getFileInfo(fileId);
      if (!fileInfo) {
        return status(404, { error: 'file-not-found' });
      }

      // Only serve files that are explicitly flagged as public
      if (!fileInfo.metadata || !fileInfo.metadata.public) {
        return status(403, { error: 'file-not-public' });
      }

      const headers = {
        'Content-Type': fileInfo.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${fileInfo.filename}"`,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      if (fileInfo.length) {
        headers['Content-Length'] = fileInfo.length.toString();
      }

      const stream = downloadFileStream(fileId);
      return new Response(stream, { headers });
    } catch (err) {
      logger.error({ err }, 'error serving public file');
      return status(500, { error: err.message });
    }
  });

export { privateRouter, publicRouter };
