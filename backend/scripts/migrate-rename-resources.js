/**
 * Migration: rename the resource model
 *
 *   Resource     → Connection   (collection `resources`        → `connections`)
 *   SubResource  → Resource     (collection `subresources`     → `resources`)
 *   SubResourceFiles → ResourceFile (collection `subresourcefiles` → `resourcefiles`)
 *
 * Field renames:
 *   resources.resource          → resources.connection
 *   resources.type ("github-repository") → resources.kind ("repository") + resources.provider ("github")
 *   resourcefiles.subResource   → resourcefiles.resource
 *   conversations.repository    → conversations.connection
 *   conversations.subResource   → conversations.resource
 *
 * Agents already reference resources by id, so they are untouched.
 *
 * Idempotent: every step checks the current state before acting, so the
 * script can be re-run safely. Run it BEFORE starting the new backend, with
 * the old backend stopped (collection renames are not transparent to a
 * running process). Any queued BullMQ "resources" jobs created by the old
 * code carry the old payload shape and should be drained first.
 *
 * Order with the other migration:  bun run migrate:rename  →  bun run migrate:agents
 *
 * Usage (from backend/):  bun run migrate:rename
 * Dry run:                DRY_RUN=1 bun run migrate:rename
 */
import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/rearch";
const DRY_RUN = process.env.DRY_RUN === "1";

// In a dry run collections are not really renamed; remember where each
// logical name physically lives so later steps inspect the right data.
const physical = new Map();
const col = (db, name) => db.collection(physical.get(name) || name);

async function collectionNames(db) {
  return (await db.listCollections({}, { nameOnly: true }).toArray()).map(
    (c) => c.name,
  );
}

/**
 * Rename a collection. `names` is the live list of collection names, kept in
 * sync by this function so a dry run can simulate the chained renames.
 */
async function renameCollection(db, names, from, to) {
  if (!names.has(from)) {
    console.log(`  - ${from}: not present, nothing to rename`);
    return;
  }
  if (names.has(to)) {
    const count = await db.collection(to).countDocuments();
    if (count > 0) {
      throw new Error(
        `Cannot rename ${from} → ${to}: target collection already has ${count} documents`,
      );
    }
    if (!DRY_RUN) await db.collection(to).drop();
    names.delete(to);
  }
  console.log(`  ~ rename collection ${from} → ${to}`);
  if (DRY_RUN) physical.set(to, physical.get(from) || from);
  else await db.collection(from).rename(to);
  names.delete(from);
  names.add(to);
}

async function renameField(db, names, collection, from, to) {
  if (!names.has(collection)) return;
  const filter = { [from]: { $exists: true } };
  const count = await col(db, collection).countDocuments(filter);
  console.log(`  ~ ${collection}: ${from} → ${to} (${count} documents)`);
  if (!DRY_RUN && count > 0) {
    await col(db, collection).updateMany(filter, { $rename: { [from]: to } });
  }
}

async function splitType(db, names) {
  if (!names.has("resources")) return;
  const resources = col(db, "resources");
  const cursor = resources.find({ type: { $exists: true } }, { projection: { type: 1 } });
  let n = 0;
  for await (const doc of cursor) {
    const [provider, ...rest] = String(doc.type).split("-");
    const kind = rest.join("-") || "repository";
    if (!DRY_RUN) {
      await resources.updateOne(
        { _id: doc._id },
        { $set: { kind, provider }, $unset: { type: "" } },
      );
    }
    n++;
  }
  console.log(`  ~ resources: type → kind + provider (${n} documents)`);
}

async function dropStaleIndexes(db, names) {
  // Indexes defined by the old schemas keep their names after a collection
  // rename; mongoose recreates the new ones on startup.
  for (const [collection, stale] of [
    ["resourcefiles", ["subResource_1"]],
    ["resources", ["resource_1"]],
  ]) {
    if (!names.has(collection)) continue;
    const existing = (await col(db, collection).indexes()).map((i) => i.name);
    for (const idx of stale) {
      if (existing.includes(idx)) {
        console.log(`  ~ ${collection}: drop stale index ${idx}`);
        if (!DRY_RUN) await col(db, collection).dropIndex(idx);
      }
    }
  }
}

async function migrate() {
  console.log(`Connecting to MongoDB... ${DRY_RUN ? "(dry run)" : ""}`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log("Connected.");

  const names = new Set(await collectionNames(db));
  const alreadyRenamed = names.has("connections") && !names.has("subresources");

  if (alreadyRenamed) {
    console.log("Collections already renamed; checking fields only.");
  } else {
    console.log("Step 1: rename collections");
    // Order matters: free the `resources` name before subresources takes it.
    await renameCollection(db, names, "resources", "connections");
    await renameCollection(db, names, "subresources", "resources");
    await renameCollection(db, names, "subresourcefiles", "resourcefiles");
  }

  console.log("Step 2: rename fields");
  await renameField(db, names, "resources", "resource", "connection");
  await renameField(db, names, "resourcefiles", "subResource", "resource");
  await renameField(db, names, "conversations", "repository", "connection");
  await renameField(db, names, "conversations", "subResource", "resource");

  console.log("Step 3: split composite type into kind + provider");
  await splitType(db, names);

  console.log("Step 4: drop stale indexes");
  await dropStaleIndexes(db, names);

  console.log("Migration complete.");
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
