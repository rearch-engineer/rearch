import { Elysia } from "elysia";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { z } from "zod";
import Resource from "../../models/Resource.js";
import SubResource from "../../models/SubResource.js";
import SubResourceFiles from "../../models/SubResourceFiles.js";
import {
  executeCreateHook,
  executeUpdateHook,
  executeDeleteHook,
  executeSearchHook,
  executeImportHook,
  executeSubDeleteHook,
} from "../../utils/hookLoader.js";
import { deleteFile, downloadFileStream, getFileInfo } from "../../utils/gridfs.js";
import { getFileContents } from "../../utils/attlasian/bitbucket.js";
import queue from "../../queue";

const router = new Elysia({ prefix: "/resources" });

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const getGridFSBucket = () => {
  const db = mongoose.connection.db;
  return new GridFSBucket(db, { bucketName: "uploads" });
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createResourceSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100)
    .trim(),
  provider: z.enum(["bitbucket"], {
    errorMap: () => ({ message: "Provider must be 'bitbucket'." }),
  }),
  data: z.record(z.unknown()).refine((val) => Object.keys(val).length > 0, {
    message: "Data must be a non-empty object.",
  }),
});

const uploadResourceSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100)
    .trim(),
});

const updateResourceSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  data: z.record(z.unknown()).optional(),
});

const importSubresourceSchema = z.object({
  externalId: z.string().min(1, "externalId is required."),
  name: z.string().min(1, "name is required.").max(100),
  type: z.string().min(1, "type is required."),
});

const updateSubresourceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  data: z.record(z.unknown()).optional(),
  rearch: z
    .object({
      enabled: z.boolean().optional().default(false),
      template: z
        .enum(["", "minimal", "node", "node-browser", "node-react-pg"])
        .optional()
        .default(""),
      dockerImageFromBranch: z.string().optional().default(""),
      services: z
        .array(
          z.object({
            label: z.string(),
            icon: z.string().optional().default("Widgets"),
            internalPort: z.number(),
          }),
        )
        .optional()
        .default([]),
      skills: z
        .array(z.string())
        .optional()
        .default([]),
      resources: z
        .object({
          memoryMb: z.number().min(0).max(32768).optional().default(0),
          cpuQuota: z.number().min(0).max(800000).optional().default(0),
          pidsLimit: z.number().min(0).max(4096).optional().default(0),
        })
        .optional(),
      suggestedPrompts: z
        .object({
          mode: z.enum(["all", "selected", "categories"]).optional().default("all"),
          selectedIds: z.array(z.string()).optional().default([]),
          selectedCategories: z.array(z.string()).optional().default([]),
        })
        .optional(),
    })
    .optional(),
});

// ─── Read Routes (with full data) ─────────────────────────────────────────────

const subresourcesQuerySchema = z.object({
  type: z.string().max(100).optional(),
});

// Get all resources (includes data field for admin use)
router.get("/", async ({ status }) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    return resources;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get all subresources across all resources, with optional type filter
router.get("/subresources", async ({ query, status }) => {
  const parsed = subresourcesQuerySchema.safeParse(query);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  const { type } = parsed.data;

  const subQuery = { imported: true };
  if (type) {
    subQuery.type = type;
  }

  const subresources = await SubResource.find(subQuery)
    .populate("resource", "name provider")
    .sort({ name: 1 });

  const result = subresources
    .filter((sr) => sr.resource)
    .map((sr) => {
      const obj = sr.toObject();
      obj.resourceId = obj.resource._id;
      obj.resourceName = obj.resource.name;
      obj.resource = obj.resource._id;
      if (obj.data) {
        delete obj.data.branches;
      }
      return obj;
    });

  return result;
});

// Get single resource (includes data field for admin use)
router.get("/:id", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const resource = await Resource.findById(params.id);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }
    return resource;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Download/stream file from GridFS
router.get("/file/:fileId", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.fileId)) {
    return status(400, { error: "Invalid file ID format." });
  }

  try {
    const bucket = getGridFSBucket();
    const fileId = new mongoose.Types.ObjectId(params.fileId);

    const files = await bucket.find({ _id: fileId }).toArray();
    if (files.length === 0) {
      return status(404, { error: "File not found" });
    }

    const file = files[0];
    const downloadStream = bucket.openDownloadStream(fileId);

    return new Response(downloadStream, {
      headers: {
        "Content-Type": file.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": String(file.length),
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get subresources for a resource
router.get("/:id/subresources", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const resource = await Resource.findById(params.id);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    const subresources = await SubResource.find({
      resource: resource._id,
      imported: true,
    });

    return subresources.map((sr) => {
      const obj = sr.toObject();
      if (obj.data) {
        delete obj.data.branches;
      }
      return obj;
    });
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get single subresource
router.get("/:id/subresources/:subId", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const resource = await Resource.findById(params.id);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    const subresource = await SubResource.findById(params.subId);
    if (!subresource) {
      return status(404, { error: "Subresource not found" });
    }

    const obj = subresource.toObject();
    if (obj.data) {
      delete obj.data.branches;
    }
    return obj;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get Dockerfile contents for a Bitbucket repository subresource
router.get(
  "/:id/subresources/:subId/dockerfile",
  async ({ params, query, status }) => {
    if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const parentResource = await Resource.findById(params.id);
      if (!parentResource) {
        return status(404, { error: "Parent resource not found" });
      }

      const subResource = await SubResource.findById(params.subId);
      if (!subResource) {
        return status(404, { error: "Subresource not found" });
      }

      const workspace = parentResource.data?.workspace;
      const repoSlug = subResource.externalId;
      const ref = query?.ref || "HEAD";

      if (!workspace || !repoSlug) {
        return status(400, {
          error: "Workspace and repository slug are required",
        });
      }

      const contents = await getFileContents(
        parentResource.data,
        workspace,
        repoSlug,
        ".rearch/Dockerfile",
        ref,
      );

      return { contents };
    } catch (err) {
      const notFound =
        err.message.includes("404") ||
        err.message.toLowerCase().includes("not found");
      return status(notFound ? 404 : 500, { error: err.message });
    }
  },
);

// Get all files for a subresource
router.get("/:id/subresources/:subId/files", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const parentResource = await Resource.findById(params.id);
    if (!parentResource) {
      return status(404, { error: "Parent resource not found" });
    }

    const subresource = await SubResource.findById(params.subId);
    if (!subresource) {
      return status(404, { error: "Subresource not found" });
    }

    const files = await SubResourceFiles.find({
      subResource: subresource._id,
    });
    return files;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get single file metadata
router.get(
  "/:id/subresources/:subId/files/:fileId",
  async ({ params, status }) => {
    if (
      !OBJECT_ID_RE.test(params.id) ||
      !OBJECT_ID_RE.test(params.subId) ||
      !OBJECT_ID_RE.test(params.fileId)
    ) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const parentResource = await Resource.findById(params.id);
      if (!parentResource) {
        return status(404, { error: "Parent resource not found" });
      }

      const subresource = await SubResource.findById(params.subId);
      if (!subresource) {
        return status(404, { error: "Subresource not found" });
      }

      const file = await SubResourceFiles.findById(params.fileId);
      if (!file) {
        return status(404, { error: "File not found" });
      }

      if (file.subResource.toString() !== subresource._id.toString()) {
        return status(403, {
          error: "File does not belong to this subresource",
        });
      }

      return file;
    } catch (err) {
      return status(500, { error: err.message });
    }
  },
);

// Download file content
router.get(
  "/:id/subresources/:subId/files/:fileId/download",
  async ({ params, status }) => {
    if (
      !OBJECT_ID_RE.test(params.id) ||
      !OBJECT_ID_RE.test(params.subId) ||
      !OBJECT_ID_RE.test(params.fileId)
    ) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const parentResource = await Resource.findById(params.id);
      if (!parentResource) {
        return status(404, { error: "Parent resource not found" });
      }

      const subresource = await SubResource.findById(params.subId);
      if (!subresource) {
        return status(404, { error: "Subresource not found" });
      }

      const file = await SubResourceFiles.findById(params.fileId);
      if (!file) {
        return status(404, { error: "File not found" });
      }

      if (file.subResource.toString() !== subresource._id.toString()) {
        return status(403, {
          error: "File does not belong to this subresource",
        });
      }

      const fileInfo = await getFileInfo(file.gridFsId);
      if (!fileInfo) {
        return status(404, { error: "File content not found in storage" });
      }

      const stream = downloadFileStream(file.gridFsId);

      return new Response(stream, {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Content-Length": String(file.size),
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      });
    } catch (err) {
      return status(500, { error: err.message });
    }
  },
);

// ─── Write Routes ─────────────────────────────────────────────────────────────

// Create resource (non-file)
router.post("/", async ({ body, status }) => {
  const parsed = createResourceSchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  let resource = null;
  try {
    const { name, provider, data } = parsed.data;

    resource = new Resource({ name, provider, data });
    resource = await resource.save();

    console.log(`Created resource with ID: ${JSON.stringify(resource._id)}`);

    try {
      const enhancedData = await executeCreateHook(resource);
      resource.data = enhancedData;
      await resource.save();

      return new Response(JSON.stringify(resource), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (hookError) {
      console.error("Create hook error:", hookError);
      await Resource.findByIdAndDelete(resource._id);
      throw new Error(`Create hook failed: ${hookError.message}`);
    }
  } catch (err) {
    console.error("Error creating resource:", err);
    return status(400, { error: err.message });
  }
});

// Upload file and create file resource
router.post("/upload", async ({ body, status }) => {
  const parsed = uploadResourceSchema.safeParse({ name: body.name });
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  let resource = null;
  let uploadedFileId = null;
  try {
    if (!body.file) {
      return status(400, { error: "No file uploaded" });
    }

    const { name } = parsed.data;
    const file = body.file;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const bucket = getGridFSBucket();

    const uploadStream = bucket.openUploadStream(file.name, {
      contentType: file.type,
      metadata: {
        originalName: file.name,
        uploadDate: new Date(),
      },
    });

    uploadStream.end(fileBuffer);

    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    uploadedFileId = uploadStream.id;

    resource = new Resource({
      name,
      provider: "file",
      data: {
        fileId: uploadedFileId,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        uploadDate: new Date(),
      },
    });

    await resource.save();

    try {
      const enhancedData = await executeCreateHook("file", resource);
      resource.data = enhancedData;
      await resource.save();

      return new Response(JSON.stringify(resource), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (hookError) {
      await Resource.findByIdAndDelete(resource._id);
      if (uploadedFileId) {
        await bucket.delete(new mongoose.Types.ObjectId(uploadedFileId));
      }
      throw new Error(`Create hook failed: ${hookError.message}`);
    }
  } catch (err) {
    return status(400, { error: err.message });
  }
});

// Update resource
router.put("/:id", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  const parsed = updateResourceSchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  try {
    const { name, data } = parsed.data;

    const originalResource = await Resource.findById(params.id);
    if (!originalResource) {
      return status(404, { error: "Resource not found" });
    }

    const originalData = {
      name: originalResource.name,
      data: originalResource.data,
    };

    const updatedResource = await Resource.findByIdAndUpdate(
      params.id,
      { name, data },
      { new: true, runValidators: true },
    );

    if (!updatedResource) {
      return status(404, { error: "Resource not found" });
    }

    try {
      const enhancedData = await executeUpdateHook(
        updatedResource.provider,
        originalResource,
        updatedResource,
      );
      updatedResource.data = enhancedData;
      await updatedResource.save();

      return updatedResource;
    } catch (hookError) {
      await Resource.findByIdAndUpdate(params.id, originalData, {
        runValidators: true,
      });
      throw new Error(`Update hook failed: ${hookError.message}`);
    }
  } catch (err) {
    return status(400, { error: err.message });
  }
});

// Delete resource
router.delete("/:id", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const resource = await Resource.findById(params.id);

    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    try {
      await executeDeleteHook(resource.provider, resource);
    } catch (hookError) {
      return status(400, {
        error: `Delete hook failed: ${hookError.message}. Resource was not deleted.`,
      });
    }

    if (resource.provider === "file" && resource.data.fileId) {
      const bucket = getGridFSBucket();
      await bucket.delete(new mongoose.Types.ObjectId(resource.data.fileId));
    }

    await Resource.findByIdAndDelete(params.id);
    return { success: true };
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Delete file from GridFS
router.delete("/file/:fileId", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.fileId)) {
    return status(400, { error: "Invalid file ID format." });
  }

  try {
    const bucket = getGridFSBucket();
    const fileId = new mongoose.Types.ObjectId(params.fileId);

    await bucket.delete(fileId);
    return { success: true };
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Search for subresources to import
router.post(
  "/:id/subresources/import/search",
  async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const parentResource = await Resource.findById(params.id);
      if (!parentResource) {
        return status(404, { error: "Parent resource not found" });
      }

      const results = await executeSearchHook(parentResource, body);
      return results;
    } catch (err) {
      return status(400, { error: err.message });
    }
  },
);

// Import a subresource
router.post(
  "/:id/subresources/import/import",
  async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: "Invalid ID format." });
    }

    const parsed = importSubresourceSchema.safeParse(body);
    if (!parsed.success) {
      return status(400, { errors: parsed.error.errors });
    }

    let subresource = null;
    try {
      const parentResource = await Resource.findById(params.id);
      if (!parentResource) {
        return status(404, { error: "Parent resource not found" });
      }

      const { externalId, name, type } = parsed.data;

      const existing = await SubResource.findOne({
        resource: parentResource._id,
        imported: true,
        externalId,
      });
      if (existing) {
        return status(400, { error: "Subresource already imported" });
      }

      subresource = new SubResource({
        resource: parentResource._id,
        externalId,
        imported: true,
        name,
        type,
        data: {},
      });

      await subresource.save();

      try {
        const enhancedData = await executeImportHook(
          parentResource,
          subresource,
        );

        subresource.data = enhancedData;

        if (enhancedData.description && !subresource.description) {
          subresource.description = enhancedData.description;
        }

        await subresource.save();

        return new Response(JSON.stringify(subresource), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch (hookError) {
        await SubResource.findByIdAndDelete(subresource._id);
        throw new Error(`Import hook failed: ${hookError.message}`);
      }
    } catch (err) {
      return status(400, { error: err.message });
    }
  },
);

// Update subresource
router.post("/:id/subresources/:subId", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  const parsed = updateSubresourceSchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  try {
    const parentResource = await Resource.findById(params.id);
    if (!parentResource) {
      return status(404, { error: "Parent resource not found" });
    }

    const subresource = await SubResource.findById(params.subId);
    if (!subresource) {
      return status(404, { error: "Subresource not found" });
    }

    const { name, description, data, rearch } = parsed.data;

    if (name !== undefined) subresource.name = name;
    if (description !== undefined) subresource.description = description;
    if (data !== undefined) subresource.data = data;
    if (rearch !== undefined) {
      const existingDockerImage = subresource.rearch?.dockerImage;
      subresource.rearch = rearch;
      if (existingDockerImage) {
        subresource.rearch.dockerImage = existingDockerImage;
      }
    }

    await subresource.save();

    return subresource;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Subresource action
router.post(
  "/:id/subresources/:subId/action/:action",
  async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
      return status(400, { error: "Invalid ID format." });
    }
    if (!params.action || params.action.length === 0) {
      return status(400, { error: "Action name is required." });
    }

    try {
      const { id, subId, action } = params;

      const parentResource = await Resource.findById(id);
      if (!parentResource) {
        return status(404, { error: "Parent resource not found" });
      }

      const subResource = await SubResource.findById(subId);
      if (!subResource) {
        return status(404, { error: "Subresource not found" });
      }

      const job = await queue.addJobToQueue("resources", action, {
        parentResource,
        subResource,
        payload: body,
      });

      console.log(
        `Action job ${job.id} added to queue for action '${params.action}'`,
      );

      return {
        success: true,
        jobId: job.id,
        message: `Action '${params.action}' has been queued for processing`,
      };
    } catch (err) {
      return status(400, { error: err.message });
    }
  },
);

// Delete subresource
router.delete("/:id/subresources/:subId", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const parentResource = await Resource.findById(params.id);
    if (!parentResource) {
      return status(404, { error: "Parent resource not found" });
    }

    const subresource = await SubResource.findById(params.subId);
    if (!subresource) {
      return status(404, { error: "Subresource not found" });
    }

    const files = await SubResourceFiles.find({
      subResource: subresource._id,
    });

    for (const file of files) {
      try {
        await deleteFile(file.gridFsId);
        console.log(`Deleted GridFS file: ${file.filename} (${file.gridFsId})`);
      } catch (fileErr) {
        console.error(
          `Failed to delete GridFS file ${file.filename}:`,
          fileErr.message,
        );
      }
    }

    await SubResourceFiles.deleteMany({ subResource: subresource._id });
    console.log(`Deleted ${files.length} SubResourceFiles records`);

    await executeSubDeleteHook(parentResource, subresource);

    await SubResource.findByIdAndDelete(params.subId);

    return { success: true };
  } catch (err) {
    console.error("Error deleting subresource:", err);
    return status(500, { error: err.message });
  }
});

export default router;
