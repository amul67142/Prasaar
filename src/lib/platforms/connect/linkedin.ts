import "server-only";
import { appUrl, config, optionalEnv, requireEnv } from "../../env";
import { fetchJson } from "../http";
import { describeLinkedInError, type LinkedInCredentials, type LinkedInMeta } from "../linkedin";
import type { ConnectCandidate } from "../types";

const redirectUri = () => `${appUrl()}/api/connect/linkedin/callback`;
const orgScopesEnabled = () => optionalEnv("LINKEDIN_ORG_SCOPES") === "1";

export function linkedinScopes(): string[] {
  const scopes = ["openid", "profile", "email", "w_member_social"];
  if (orgScopesEnabled()) scopes.push("w_organization_social", "r_organization_social", "rw_organization_admin");
  return scopes;
}

export function linkedinAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("LINKEDIN_CLIENT_ID"),
    redirect_uri: redirectUri(),
    state,
    scope: linkedinScopes().join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

const restHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": config.linkedinVersion,
  "X-Restli-Protocol-Version": "2.0.0",
});

export async function linkedinCandidates(code: string): Promise<ConnectCandidate[]> {
  const token = await fetchJson<TokenResponse>(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: requireEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
      }),
    },
    describeLinkedInError,
  );
  const credentials: LinkedInCredentials = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
      : undefined,
  };
  const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

  const me = await fetchJson<{ sub: string; name?: string; picture?: string; email?: string }>(
    "https://api.linkedin.com/v2/userinfo",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
    describeLinkedInError,
  );
  const candidates: ConnectCandidate[] = [
    {
      platform: "linkedin",
      externalId: `urn:li:person:${me.sub}`,
      displayName: me.name || me.email || "LinkedIn profile",
      avatar: me.picture,
      credentials: { ...credentials },
      meta: { authorUrn: `urn:li:person:${me.sub}`, kind: "person" } satisfies LinkedInMeta,
      tokenExpiresAt,
    },
  ];

  if (orgScopesEnabled()) {
    const acls = await fetchJson<{ elements?: { organization: string; role: string; state: string }[] }>(
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50",
      { headers: restHeaders(token.access_token) },
      describeLinkedInError,
    );
    for (const acl of acls.elements ?? []) {
      const id = acl.organization.split(":").pop()!;
      let name = `Company page ${id}`;
      let vanity: string | undefined;
      try {
        const org = await fetchJson<{ localizedName?: string; vanityName?: string }>(
          `https://api.linkedin.com/rest/organizations/${id}`,
          { headers: restHeaders(token.access_token) },
          describeLinkedInError,
        );
        name = org.localizedName ?? name;
        vanity = org.vanityName;
      } catch {}
      candidates.push({
        platform: "linkedin",
        externalId: acl.organization,
        displayName: name,
        username: vanity,
        credentials: { ...credentials },
        meta: { authorUrn: acl.organization, kind: "organization" } satisfies LinkedInMeta,
        tokenExpiresAt,
      });
    }
  }
  return candidates;
}
