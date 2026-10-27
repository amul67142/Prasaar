import "server-only";
import mongoose from "mongoose";
import { config } from "../env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongo = globalThis as unknown as { __mongo?: Cache };
const cache: Cache = (globalForMongo.__mongo ??= { conn: null, promise: null });

/** Reuses one connection across hot reloads and warm serverless invocations. */
export async function db(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(config.mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  });
  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}
