// Connects to the database in MONGODB_URI, checks it, and creates every collection with
// its indexes (including the TTL ones). Safe to run again after changing models.
// Run: npm run db:setup              (local, from .env.local)
//      npm run db:setup:prod         (Atlas, from .env.production.local)
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");
const safeUri = uri.replace(/\/\/([^:]+):[^@]+@/, "//$1:****@");
console.log(`Connecting to ${safeUri}`);

const { db } = await import("@/lib/db/mongo");
const conn = (await db()).connection;
const ping = await conn.db!.admin().command({ ping: 1 });
const info = await conn.db!.admin().command({ buildInfo: 1 });
console.log(`✓ Connected (ping ${ping.ok === 1 ? "ok" : "failed"}), MongoDB ${info.version}, database "${conn.name}"`);

await import("@/lib/db/models");
for (const name of mongoose.modelNames().sort()) {
  const model = mongoose.model(name);
  await model.createCollection().catch((err: { codeName?: string }) => {
    if (err.codeName !== "NamespaceExists") throw err;
  });
  await model.syncIndexes();
  const indexes = await model.listIndexes();
  console.log(`✓ ${model.collection.collectionName.padEnd(20)} ${indexes.length} index${indexes.length === 1 ? "" : "es"}`);
}

await conn.close();
console.log("Done.");
