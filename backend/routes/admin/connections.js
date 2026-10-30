import { Elysia } from "elysia";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { z } from "zod";
import Connection from "../../models/Connection.js";
import Resource, { RESOURCE_KINDS } from "../../models/Resource.js";
import ResourceFile from "../../models/ResourceFile.js";
import {
  executeCreateHook,
  executeUpdateHook,
  executeDeleteHook,
  executeSearchHook,
  executeImportHook,
  executeResourceDeleteHook,
} from "../../utils/hookLoader.js";
import { deleteFile, downloadFileStream, getFileInfo } from "../../utils/gridfs.js";
import { getFileContents } from "../../utils/attlasian/bitbucket.js";
import { getFileContents as getGithubFileContents } from "../../utils/github/github.js";
import queue from "../../queue";

const router = new Elysia({ prefix: "/connections" });

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const getGridFSBucket = () => {
  const db = mongoose.connection.db;
  return new GridFSBucket(db, { bucketName: "uploads" });
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createConnectionSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100)
    .trim(),
  provider: z.enum(["bitbucket", "github"], {
    errorMap: () => ({ message: "Provider must be 'bitbucket' or 'github'." }),
  }),
  data: z.record(z.unknown()).refine((val) => Object.keys(val).length > 0, {
    message: "Data must be a non-empty object.",
  }),
});

const uploadConnectionSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100)
    .trim(),
});

const updateConnectionSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  data: z.record(z.unknown()).optional(),
});

const importResourceSchema = z.object({
  externalId: z.string().min(1, "externalId is required."),
  name: z.string().min(1, "name is required.").max(100),
  kind: z.enum(RESOURCE_KINDS).optional().default("repository"),
});

const updateResourceSchema = z.object({
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
      connections: z
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

const resourcesQuerySchema = z.object({
  kind: z.enum(RESOURCE_KINDS).optional(),
  provider: z.enum(["bitbucket", "github"]).optional(),
});

// All resources (any connection) live under /admin/resources
const resourcesRouter = new Elysia({ prefix: "/resources" });

// Get all connections (includes data field for admin use)
router.get("/", async ({ status }) => {
  try {
    const connections = await Connection.find().sort({ createdAt: -1 });
    return connections;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get all resources across all connections, with optional type filter
resourcesRouter.get("/", async ({ query, status }) => {
  const parsed = resourcesQuerySchema.safeParse(query);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  const { kind, provider } = parsed.data;

  const subQuery = { imported: true };
  if (kind) subQuery.kind = kind;
  if (provider) subQuery.provider = provider;

  const resources = await Resource.find(subQuery)
    .populate("connection", "name provider")
    .sort({ name: 1 });

  const result = resources
    .filter((sr) => sr.connection)
    .map((sr) => {
      const obj = sr.toObject();
      obj.connectionId = obj.connection._id;
      obj.connectionName = obj.connection.name;
      obj.connection = obj.connection._id;
      if (obj.data) {
        delete obj.data.branches;
      }
      return obj;
    });

  return result;
});

// Get single connection (includes data field for admin use)
router.get("/:id", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id);
    if (!connection) {
      return status(404, { error: "Connection not found" });
    }
    return connection;
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
        "Cross-Origin-Connection-Policy": "cross-origin",
      },
    });
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get resources for a connection
router.get("/:id/resources", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id);
    if (!connection) {
      return status(404, { error: "Connection not found" });
    }

    const resources = await Resource.find({
      connection: connection._id,
      imported: true,
    });

    return resources.map((sr) => {
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

// Get single resource
router.get("/:id/resources/:subId", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id);
    if (!connection) {
      return status(404, { error: "Connection not found" });
    }

    const resource = await Resource.findById(params.subId);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    return resource.toObject();
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get .rearch/Dockerfile contents for a repository resource (Bitbucket or GitHub)
router.get(
  "/:id/resources/:subId/dockerfile",
  async ({ params, query, status }) => {
    if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const connection = await Connection.findById(params.id);
      if (!connection) {
        return status(404, { error: "Parent connection not found" });
      }

      const resource = await Resource.findById(params.subId);
      if (!resource) {
        return status(404, { error: "Resource not found" });
      }

      const ref = query?.ref || "HEAD";
      let contents;

      if (connection.provider === "github") {
        const fullName = resource.data?.fullName || resource.externalId;
        if (!fullName || !fullName.includes("/")) {
          return status(400, {
            error: "Cannot determine owner/repo from resource",
          });
        }
        const [owner, repo] = fullName.split("/");
        contents = await getGithubFileContents(
          connection.data,
          owner,
          repo,
          ".rearch/Dockerfile",
          ref,
        );
      } else {
        const workspace = connection.data?.workspace;
        const repoSlug = resource.externalId;

        if (!workspace || !repoSlug) {
          return status(400, {
            error: "Workspace and repository slug are required",
          });
        }

        contents = await getFileContents(
          connection.data,
          workspace,
          repoSlug,
          ".rearch/Dockerfile",
          ref,
        );
      }

      return { contents };
    } catch (err) {
      const notFound =
        err.message.includes("404") ||
        err.message.toLowerCase().includes("not found");
      return status(notFound ? 404 : 500, { error: err.message });
    }
  },
);

// Get all files for a resource
router.get("/:id/resources/:subId/files", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id);
    if (!connection) {
      return status(404, { error: "Parent connection not found" });
    }

    const resource = await Resource.findById(params.subId);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    const files = await ResourceFile.find({
      resource: resource._id,
    });
    return files;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get single file metadata
router.get(
  "/:id/resources/:subId/files/:fileId",
  async ({ params, status }) => {
    if (
      !OBJECT_ID_RE.test(params.id) ||
      !OBJECT_ID_RE.test(params.subId) ||
      !OBJECT_ID_RE.test(params.fileId)
    ) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const connection = await Connection.findById(params.id);
      if (!connection) {
        return status(404, { error: "Parent connection not found" });
      }

      const resource = await Resource.findById(params.subId);
      if (!resource) {
        return status(404, { error: "Resource not found" });
      }

      const file = await ResourceFile.findById(params.fileId);
      if (!file) {
        return status(404, { error: "File not found" });
      }

      if (file.resource.toString() !== resource._id.toString()) {
        return status(403, {
          error: "File does not belong to this resource",
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
  "/:id/resources/:subId/files/:fileId/download",
  async ({ params, status }) => {
    if (
      !OBJECT_ID_RE.test(params.id) ||
      !OBJECT_ID_RE.test(params.subId) ||
      !OBJECT_ID_RE.test(params.fileId)
    ) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const connection = await Connection.findById(params.id);
      if (!connection) {
        return status(404, { error: "Parent connection not found" });
      }

      const resource = await Resource.findById(params.subId);
      if (!resource) {
        return status(404, { error: "Resource not found" });
      }

      const file = await ResourceFile.findById(params.fileId);
      if (!file) {
        return status(404, { error: "File not found" });
      }

      if (file.resource.toString() !== resource._id.toString()) {
        return status(403, {
          error: "File does not belong to this resource",
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
          "Cross-Origin-Connection-Policy": "cross-origin",
        },
      });
    } catch (err) {
      return status(500, { error: err.message });
    }
  },
);

// ─── Write Routes ─────────────────────────────────────────────────────────────

// Create connection (non-file)
router.post("/", async ({ body, status }) => {
  const parsed = createConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  let connection = null;
  try {
    const { name, provider, data } = parsed.data;

    connection = new Connection({ name, provider, data });
    connection = await connection.save();

    console.log(`Created connection with ID: ${JSON.stringify(connection._id)}`);

    try {
      const enhancedData = await executeCreateHook(connection);
      connection.data = enhancedData;
      await connection.save();

      return new Response(JSON.stringify(connection), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (hookError) {
      console.error("Create hook error:", hookError);
      await Connection.findByIdAndDelete(connection._id);
      throw new Error(`Create hook failed: ${hookError.message}`);
    }
  } catch (err) {
    console.error("Error creating connection:", err);
    return status(400, { error: err.message });
  }
});

// Create GitHub connection with PEM file upload
router.post("/github", async ({ body, status }) => {
  try {
    const name = body.name;
    const appId = body.appId;
    const installationId = body.installationId;
    const file = body.privateKeyFile;

    if (!name || name.length < 2 || name.length > 100) {
      return status(400, { error: "Name must be between 2 and 100 characters." });
    }
    if (!appId) return status(400, { error: "App ID is required." });
    if (!installationId) return status(400, { error: "Installation ID is required." });
    if (!file) return status(400, { error: "Private key PEM file is required." });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const bucket = getGridFSBucket();

    const uploadStream = bucket.openUploadStream(file.name || "private-key.pem", {
      contentType: "application/x-pem-file",
      metadata: {
        originalName: file.name,
        resourceType: "github-private-key",
        uploadDate: new Date(),
      },
    });

    uploadStream.end(fileBuffer);

    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const privateKeyFileId = uploadStream.id;

    let connection = new Connection({
      name: name.trim(),
      provider: "github",
      data: {
        appId,
        installationId,
        privateKeyFileId,
      },
    });

    connection = await connection.save();

    try {
      const enhancedData = await executeCreateHook(connection);
      connection.data = enhancedData;
      await connection.save();

      return new Response(JSON.stringify(connection), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (hookError) {
      await Connection.findByIdAndDelete(connection._id);
      try {
        await bucket.delete(new mongoose.Types.ObjectId(privateKeyFileId));
      } catch (_) {}
      throw new Error(`Create hook failed: ${hookError.message}`);
    }
  } catch (err) {
    console.error("Error creating GitHub connection:", err);
    return status(400, { error: err.message });
  }
});

// Update GitHub connection with optional PEM file upload
router.put("/github/:id", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const originalConnection = await Connection.findById(params.id);
    if (!originalConnection) {
      return status(404, { error: "Connection not found" });
    }

    if (originalConnection.provider !== "github") {
      return status(400, { error: "Connection is not a GitHub connection." });
    }

    const originalData = {
      name: originalConnection.name,
      data: { ...originalConnection.data },
    };

    const updateFields = {};
    if (body.name) updateFields.name = body.name.trim();

    const newData = { ...originalConnection.data };
    if (body.appId) newData.appId = body.appId;
    if (body.installationId) newData.installationId = body.installationId;

    let newFileId = null;
    const file = body.privateKeyFile;
    if (file) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const bucket = getGridFSBucket();

      const uploadStream = bucket.openUploadStream(file.name || "private-key.pem", {
        contentType: "application/x-pem-file",
        metadata: {
          originalName: file.name,
          resourceType: "github-private-key",
          uploadDate: new Date(),
        },
      });

      uploadStream.end(fileBuffer);

      await new Promise((resolve, reject) => {
        uploadStream.on("finish", resolve);
        uploadStream.on("error", reject);
      });

      newFileId = uploadStream.id;
      newData.privateKeyFileId = newFileId;
      // Remove legacy inline key if present
      delete newData.privateKey;
    }

    updateFields.data = newData;

    const updatedConnection = await Connection.findByIdAndUpdate(
      params.id,
      updateFields,
      { new: true, runValidators: true },
    );

    if (!updatedConnection) {
      return status(404, { error: "Connection not found" });
    }

    try {
      const enhancedData = await executeUpdateHook(
        updatedConnection.provider,
        originalConnection,
        updatedConnection,
      );
      updatedConnection.data = enhancedData;
      await updatedConnection.save();

      // Delete old PEM file from GridFS after successful update
      if (newFileId && originalData.data.privateKeyFileId) {
        const bucket = getGridFSBucket();
        try {
          await bucket.delete(new mongoose.Types.ObjectId(originalData.data.privateKeyFileId));
        } catch (_) {}
      }

      return updatedConnection;
    } catch (hookError) {
      // Rollback
      await Connection.findByIdAndUpdate(params.id, originalData, {
        runValidators: true,
      });
      // Delete newly uploaded file on rollback
      if (newFileId) {
        const bucket = getGridFSBucket();
        try {
          await bucket.delete(new mongoose.Types.ObjectId(newFileId));
        } catch (_) {}
      }
      throw new Error(`Update hook failed: ${hookError.message}`);
    }
  } catch (err) {
    return status(400, { error: err.message });
  }
});

// Upload file and create file connection
router.post("/upload", async ({ body, status }) => {
  const parsed = uploadConnectionSchema.safeParse({ name: body.name });
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  let connection = null;
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

    connection = new Connection({
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

    await connection.save();

    try {
      const enhancedData = await executeCreateHook("file", connection);
      connection.data = enhancedData;
      await connection.save();

      return new Response(JSON.stringify(connection), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (hookError) {
      await Connection.findByIdAndDelete(connection._id);
      if (uploadedFileId) {
        await bucket.delete(new mongoose.Types.ObjectId(uploadedFileId));
      }
      throw new Error(`Create hook failed: ${hookError.message}`);
    }
  } catch (err) {
    return status(400, { error: err.message });
  }
});

// Update connection
router.put("/:id", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  const parsed = updateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  try {
    const { name, data } = parsed.data;

    const originalConnection = await Connection.findById(params.id);
    if (!originalConnection) {
      return status(404, { error: "Connection not found" });
    }

    const originalData = {
      name: originalConnection.name,
      data: originalConnection.data,
    };

    const updatedConnection = await Connection.findByIdAndUpdate(
      params.id,
      { name, data },
      { new: true, runValidators: true },
    );

    if (!updatedConnection) {
      return status(404, { error: "Connection not found" });
    }

    try {
      const enhancedData = await executeUpdateHook(
        updatedConnection.provider,
        originalConnection,
        updatedConnection,
      );
      updatedConnection.data = enhancedData;
      await updatedConnection.save();

      return updatedConnection;
    } catch (hookError) {
      await Connection.findByIdAndUpdate(params.id, originalData, {
        runValidators: true,
      });
      throw new Error(`Update hook failed: ${hookError.message}`);
    }
  } catch (err) {
    return status(400, { error: err.message });
  }
});

// Delete connection
router.delete("/:id", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id);

    if (!connection) {
      return status(404, { error: "Connection not found" });
    }

    try {
      await executeDeleteHook(connection.provider, connection);
    } catch (hookError) {
      return status(400, {
        error: `Delete hook failed: ${hookError.message}. Connection was not deleted.`,
      });
    }

    if (connection.provider === "file" && connection.data.fileId) {
      const bucket = getGridFSBucket();
      await bucket.delete(new mongoose.Types.ObjectId(connection.data.fileId));
    }

    if (connection.provider === "github" && connection.data.privateKeyFileId) {
      const bucket = getGridFSBucket();
      try {
        await bucket.delete(new mongoose.Types.ObjectId(connection.data.privateKeyFileId));
      } catch (_) {}
    }

    await Connection.findByIdAndDelete(params.id);
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

// Search for resources to import
router.post(
  "/:id/resources/import/search",
  async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: "Invalid ID format." });
    }

    try {
      const connection = await Connection.findById(params.id);
      if (!connection) {
        return status(404, { error: "Parent connection not found" });
      }

      const results = await executeSearchHook(connection, body);
      return results;
    } catch (err) {
      return status(400, { error: err.message });
    }
  },
);

// Import a resource
router.post(
  "/:id/resources/import/import",
  async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: "Invalid ID format." });
    }

    const parsed = importResourceSchema.safeParse(body);
    if (!parsed.success) {
      return status(400, { errors: parsed.error.errors });
    }

    let resource = null;
    try {
      const connection = await Connection.findById(params.id);
      if (!connection) {
        return status(404, { error: "Parent connection not found" });
      }

      const { externalId, name, kind } = parsed.data;

      const existing = await Resource.findOne({
        connection: connection._id,
        imported: true,
        externalId,
      });
      if (existing) {
        return status(400, { error: "Resource already imported" });
      }

      resource = new Resource({
        connection: connection._id,
        externalId,
        imported: true,
        name,
        kind,
        // A resource lives where its connection lives
        provider: connection.provider,
        data: {},
      });

      await resource.save();

      try {
        const enhancedData = await executeImportHook(
          connection,
          resource,
        );

        resource.data = enhancedData;

        if (enhancedData.description && !resource.description) {
          resource.description = enhancedData.description;
        }

        await resource.save();

        return new Response(JSON.stringify(resource), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch (hookError) {
        await Resource.findByIdAndDelete(resource._id);
        throw new Error(`Import hook failed: ${hookError.message}`);
      }
    } catch (err) {
      return status(400, { error: err.message });
    }
  },
);

// Update resource
router.post("/:id/resources/:subId", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  const parsed = updateResourceSchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }

  try {
    const connection = await Connection.findById(params.id);
    if (!connection) {
      return status(404, { error: "Parent connection not found" });
    }

    const resource = await Resource.findById(params.subId);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    const { name, description, data, rearch } = parsed.data;

    if (name !== undefined) resource.name = name;
    if (description !== undefined) resource.description = description;
    if (data !== undefined) resource.data = data;
    if (rearch !== undefined) {
      const existingDockerImage = resource.rearch?.dockerImage;
      resource.rearch = rearch;
      if (existingDockerImage) {
        resource.rearch.dockerImage = existingDockerImage;
      }
    }

    await resource.save();

    return resource;
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Resource action
router.post(
  "/:id/resources/:subId/action/:action",
  async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
      return status(400, { error: "Invalid ID format." });
    }
    if (!params.action || params.action.length === 0) {
      return status(400, { error: "Action name is required." });
    }

    try {
      const { id, subId, action } = params;

      const connection = await Connection.findById(id);
      if (!connection) {
        return status(404, { error: "Parent connection not found" });
      }

      const resource = await Resource.findById(subId);
      if (!resource) {
        return status(404, { error: "Resource not found" });
      }

      const job = await queue.addJobToQueue("resources", action, {
        connection,
        resource,
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

// Delete resource
router.delete("/:id/resources/:subId", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id) || !OBJECT_ID_RE.test(params.subId)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id);
    if (!connection) {
      return status(404, { error: "Parent connection not found" });
    }

    const resource = await Resource.findById(params.subId);
    if (!resource) {
      return status(404, { error: "Resource not found" });
    }

    const files = await ResourceFile.find({
      resource: resource._id,
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

    await ResourceFile.deleteMany({ resource: resource._id });
    console.log(`Deleted ${files.length} ResourceFile records`);

    await executeResourceDeleteHook(connection, resource);

    await Resource.findByIdAndDelete(params.subId);

    return { success: true };
  } catch (err) {
    console.error("Error deleting resource:", err);
    return status(500, { error: err.message });
  }
});

export { resourcesRouter };
export default router;
