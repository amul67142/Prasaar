import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { appUrl, optionalEnv } from "./env";

let client: Client | null = null;

export function queueEnabled(): boolean {
  return Boolean(optionalEnv("QSTASH_TOKEN"));
}

/**
 * Schedules a publish job. Without QStash (local dev) this is a no-op and the
 * in-process ticker in instrumentation.ts runs the sweep instead.
 */
export async function enqueuePublish(postId: string, at: Date): Promise<string | undefined> {
  if (!queueEnabled()) return undefined;
  client ??= new Client({ token: optionalEnv("QSTASH_TOKEN")!, baseUrl: optionalEnv("QSTASH_URL") });
  const notBefore = Math.floor(at.getTime() / 1000);
  const res = await client.publishJSON({
    url: `${appUrl()}/api/jobs/publish`,
    body: { postId },
    // We handle retries ourselves (with backoff and permanent-error detection),
    // but let QStash retry delivery failures of the job call itself.
    retries: 3,
    ...(notBefore > Date.now() / 1000 + 1 ? { notBefore } : {}),
  });
  return "messageId" in res ? res.messageId : undefined;
}

export async function verifyQueueSignature(signature: string | null, body: string): Promise<boolean> {
  const current = optionalEnv("QSTASH_CURRENT_SIGNING_KEY");
  const next = optionalEnv("QSTASH_NEXT_SIGNING_KEY");
  if (!signature || !current || !next) return false;
  try {
    return await new Receiver({ currentSigningKey: current, nextSigningKey: next }).verify({ signature, body });
  } catch {
    return false;
  }
}
