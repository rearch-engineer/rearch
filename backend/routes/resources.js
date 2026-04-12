import { Elysia } from "elysia";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { z } from "zod";
import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import SubResourceFiles from "../models/SubResourceFiles.js";
import { getFileContents } from "../utils/attlasian/bitbucket.js";
import {
  downloadFileStream,
  getFileInfo,
} from "../utils/gridfs.js";
import { authPlugin } from "../middleware/auth.js";

const router = new Elysia({ prefix: "/api/resources" }).use(authPlugin);

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const getGridFSBucket = () => {
  const db = mongoose.connection.db;
  return new GridFSBucket(db, { bucketName: "uploads" });
};

const subresourcesQuerySchema = z.object({
  type: z.string().max(100).optional(),
});

// Get all resources
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
      return obj;
    });

  return result;
});

// Get single resource
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

    return subresources;
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

    return subresource;
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

      const downloadStream = downloadFileStream(file.gridFsId);

      return new Response(downloadStream, {
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

export default router;
