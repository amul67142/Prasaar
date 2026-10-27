import "server-only";

/** Read a required env var; throws with a clear message when missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const isProd = process.env.NODE_ENV === "production";

/** Public base URL of the app, without trailing slash. */
export function appUrl(): string {
  const vercelHost =
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  const url = optionalEnv("APP_URL") ?? (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

export const config = {
  get mongoUri() {
    return requireEnv("MONGODB_URI");
  },
  get encryptionKey() {
    return requireEnv("ENCRYPTION_KEY");
  },
  get metaGraphVersion() {
    return process.env.META_GRAPH_VERSION ?? "v24.0";
  },
  get linkedinVersion() {
    return process.env.LINKEDIN_API_VERSION ?? "202609";
  },
  /** Plan given to new workspaces until billing ships in phase 2. */
  get defaultPlan() {
    return process.env.DEFAULT_PLAN ?? "beta";
  },
};
