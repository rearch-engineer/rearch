import { searchTickets, getTicketDetails, downloadAttachment } from '../../../utils/attlasian/jira.js';
import { uploadFile } from '../../../utils/gridfs.js';
import SubResourceFiles from '../../../models/SubResourceFiles.js';

/**
 * Replace Jira attachment URLs in description with internal download URLs
 * @param {string} description - HTML description from Jira
 * @param {Array} files - Array of downloaded file records with id and externalId
 * @param {string} resourceId - Parent resource ID
 * @param {string} subResourceId - SubResource ID
 * @param {string} jiraHost - Jira installation URL for matching absolute URLs
 * @returns {string} Updated description with replaced URLs
 */
function replaceAttachmentUrls(description, files, resourceId, subResourceId, jiraHost) {
  if (!description) {
    return description;
  }

  // Build mapping: Jira attachment ID → our internal file ID
  const attachmentIdMap = new Map();
  files.forEach(file => {
    if (file.externalId) {
      attachmentIdMap.set(file.externalId, file.id.toString());
    }
  });

  let updatedDescription = description;
  
  // Pattern to match both relative and absolute Jira attachment URLs
  // Matches: /rest/api/3/attachment/content/{id}
  // Or: https://{host}/rest/api/3/attachment/content/{id}
  const relativePattern = /\/rest\/api\/3\/attachment\/content\/(\d+)/g;
  const absolutePattern = new RegExp(`${jiraHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/rest\\/api\\/3\\/attachment\\/content\\/(\\d+)`, 'g');
  
  // Track which attachment IDs were found but not downloaded
  const missingAttachments = new Set();
  
  // Replace relative URLs
  updatedDescription = updatedDescription.replace(relativePattern, (match, attachmentId) => {
    const fileId = attachmentIdMap.get(attachmentId);
    if (fileId) {
      return `${process.env.API_URL}/resources/${resourceId}/subresources/${subResourceId}/files/${fileId}/download`;
    }
    missingAttachments.add(attachmentId);
    return match; // Keep original if not found
  });
  
  // Replace absolute URLs
  updatedDescription = updatedDescription.replace(absolutePattern, (match, attachmentId) => {
    const fileId = attachmentIdMap.get(attachmentId);
    if (fileId) {
      return `${process.env.API_URL}/resources/${resourceId}/subresources/${subResourceId}/files/${fileId}/download`;
    }
    missingAttachments.add(attachmentId);
    return match; // Keep original if not found
  });
  
  // Log warnings for missing attachments
  if (missingAttachments.size > 0) {
    console.warn(`⚠️  Found ${missingAttachments.size} attachment ID(s) in description that were not downloaded: ${Array.from(missingAttachments).join(', ')}`);
  }
  
  return updatedDescription;
}

export default async function onImport(parentResource, subResource) {

  const jiraId = subResource.externalId;

  if (!jiraId) {
    throw new Error('Jira ticket ID is required for import');
  }

  const allDetails = await getTicketDetails(parentResource.data, jiraId, {
    expand: ['renderedFields'],
  });

  const {
    description = '',
    attachment = []
  } = allDetails.renderedFields;

  // Download and store attachment in GridFS
  const files = [];
  for (const att of attachment) {
    try {
      console.log(`Downloading att: ${att.filename}`);
      
      // Download att from Jira
      const buffer = await downloadAttachment(parentResource.data, att);
      
      // Upload to GridFS
      const gridFsId = await uploadFile(buffer, att.filename, att.mimeType);
      
      // Save metadata to SubResourceFiles collection
      const fileRecord = new SubResourceFiles({
        subResource: subResource._id,
        externalId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: buffer.length,
        gridFsId
      });
      
      await fileRecord.save();
      
      files.push({
        id: fileRecord._id,
        externalId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: buffer.length
      });
      
      console.log(`✅ att saved: ${att.filename} (${buffer.length} bytes)`);
    } catch (error) {
      console.error(`❌ Failed to download att ${att.filename}:`, error.message);
      // Continue with other atts even if one fails
    }
  }

  // Replace Jira attachment URLs in description with internal download URLs
  const updatedDescription = replaceAttachmentUrls(
    description,
    files,
    parentResource._id.toString(),
    subResource._id.toString(),
    parentResource.data.installationUrl
  );

  return {
    ...subResource.data,
    description: updatedDescription,
    attachments: files,
    renderedFields: allDetails.renderedFields
  };
}
