import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "../../errors";

function isPrivateAddress(addr: string): boolean {
  if (addr.includes(":")) {
    const a = addr.toLowerCase();
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80");
  }
  const [a, b] = addr.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/**
 * Accepts only public https hosts, so user-supplied server addresses (Mastodon,
 * Bluesky PDS) can't point our server at internal services. Returns the origin.
 */
export async function assertPublicHttpsOrigin(input: string, label = "server"): Promise<string> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("INVALID_SERVER", `That doesn't look like a valid ${label} address.`, 400, "instance");
  }
  if (url.protocol !== "https:") throw new AppError("INVALID_SERVER", `The ${label} must use https.`, 400, "instance");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    throw new AppError("INVALID_SERVER", `Enter the ${label}'s public domain name.`, 400, "instance");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new AppError("INVALID_SERVER", `We couldn't find a ${label} at ${host}.`, 400, "instance");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new AppError("INVALID_SERVER", `The ${label} at ${host} isn't publicly reachable.`, 400, "instance");
  }
  return url.origin;
}
