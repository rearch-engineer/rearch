import { Elysia } from "elysia";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { z } from "zod";
import Connection from "../models/Connection.js";
import Resource, { RESOURCE_KINDS } from "../models/Resource.js";
import ResourceFile from "../models/ResourceFile.js";
import { getFileContents as getBitbucketFileContents } from "../utils/attlasian/bitbucket.js";
import { getFileContents as getGithubFileContents } from "../utils/github/github.js";
import {
  downloadFileStream,
  getFileInfo,
} from "../utils/gridfs.js";
import { authPlugin } from "../middleware/auth.js";

const router = new Elysia({ prefix: "/api/connections" }).use(authPlugin);

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const getGridFSBucket = () => {
  const db = mongoose.connection.db;
  return new GridFSBucket(db, { bucketName: "uploads" });
};

const resourcesQuerySchema = z.object({
  kind: z.enum(RESOURCE_KINDS).optional(),
  provider: z.enum(["bitbucket", "github"]).optional(),
});

// All imported resources (any connection) live under /api/resources
const resourcesRouter = new Elysia({ prefix: "/api/resources" }).use(authPlugin);

// Get all connections
router.get("/", async ({ status }) => {
  try {
    const connections = await Connection.find().sort({ createdAt: -1 }).select("-data");
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

// Get single connection
router.get("/:id", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }

  try {
    const connection = await Connection.findById(params.id).select("-data");
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

// Get Dockerfile contents for a Bitbucket repository resource
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

        contents = await getBitbucketFileContents(
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

      const downloadStream = downloadFileStream(file.gridFsId);

      return new Response(downloadStream, {
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

export { resourcesRouter };
export default router;
