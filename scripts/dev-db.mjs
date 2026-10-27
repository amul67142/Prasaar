// Local MongoDB for development, no Docker or install needed. Data persists in .data/mongo.
// Usage: npm run db:dev   (then MONGODB_URI=mongodb://127.0.0.1:27017/prasaar)
import { mkdirSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = new URL("../.data/mongo", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port: Number(process.env.MONGO_PORT ?? 27017), dbPath, storageEngine: "wiredTiger" },
});
console.log(`MongoDB ready at ${server.getUri()}prasaar`);

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
