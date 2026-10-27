import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { imageDimensions } from "./dims";
import { KEY_RE, type FileInfo } from "./index";

const ROOT = path.join(process.cwd(), ".storage");

export function localPath(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
  return path.join(ROOT, ...key.split("/"));
}

export async function writeLocalFile(key: string, bytes: Buffer, mime: string) {
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await writeFile(`${file}.json`, JSON.stringify({ mime }));
}

export async function readLocalFile(key: string) {
  const file = localPath(key);
  const [info, sidecar] = await Promise.all([stat(file), readFile(`${file}.json`, "utf8")]);
  return { size: info.size, mime: (JSON.parse(sidecar) as { mime: string }).mime, stream: createReadStream(file) };
}

export async function inspectLocalFile(key: string): Promise<FileInfo | null> {
  const file = localPath(key);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return null;
  }
  return {
    sizeBytes: bytes.length,
    checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    ...imageDimensions(bytes),
  };
}

export async function removeLocalFile(key: string) {
  const file = localPath(key);
  await rm(file, { force: true });
  await rm(`${file}.json`, { force: true });
}
