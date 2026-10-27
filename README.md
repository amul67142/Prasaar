# Prasaar

India-first social media scheduler. Phase 1 (MVP) of the PRD in `D:\brainstorming\PRD-India-Social-Scheduler.md`: connect Facebook Pages, Instagram, LinkedIn, Telegram, Bluesky and Mastodon; write once in the composer, adjust per platform, and schedule, queue or publish from a shared calendar.

Next.js 16 (App Router, Cache Components) · MongoDB (Mongoose) · Auth.js · Upstash QStash · Tailwind + shadcn/ui (Base UI) · media on Hostinger.

## Run it locally

```bash
npm install
cp .env.example .env.local      # then fill ENCRYPTION_KEY, AUTH_SECRET, UPLOAD_SIGNING_SECRET
npm run db:dev                  # local MongoDB in .data/mongo, no Docker needed
npm run dev                     # http://localhost:3000
```

Without the optional services, local dev falls back to:

| Service | Fallback |
| --- | --- |
| Resend (email) | Emails print to the server console, links included |
| QStash (queue) | `src/instrumentation.ts` runs the publish sweep every 15 s |
| Upstash Redis (rate limits) | In-memory counters |
| Hostinger upload service + CDN | Files saved to `.storage/` and served by `/api/dev-storage` |

Instagram and Facebook fetch media by public URL, so posting media to them only works with the real CDN (or a tunnel).

Checks:

```bash
npm run typecheck
npm run lint
npm run smoke      # publishing engine against a fake Mastodon server (needs db:dev)
npm run build
```

## Layout

| Path | What |
| --- | --- |
| `src/lib/db/models.ts` | All collections (PRD section 5) |
| `src/lib/session.ts` | `requireCtx()`: user + workspace + role; every service takes this `Ctx` and filters by `workspaceId` |
| `src/lib/services/*` | Channels, posts, media, team, accounts. The dashboard calls these; the phase-2 REST API and MCP server will too |
| `src/lib/platforms/rules.ts` | Per-platform limits, shared by the composer (live) and the server (on save) |
| `src/lib/platforms/<name>.ts` | One adapter per platform: `publish`, `check`, optional `refresh` |
| `src/lib/platforms/connect/*` | OAuth (Meta, LinkedIn, Mastodon) and form connects (Telegram, Bluesky) |
| `src/lib/engine.ts` | Atomic lock, publish, retry (1 / 5 / 15 min), failure alerts, safety sweep |
| `src/lib/storage/` | `Storage` interface: Hostinger now, R2 later by config |
| `upload-service/` | Node app for Hostinger: signed direct uploads from the browser |
| `vercel.json` | Mumbai region; daily crons for the safety sweep, token refresh, media cleanup (Hobby plan allows only daily crons; on Pro, set the sweep back to `* * * * *`) |

## Before real users can connect

These are outside the code and on you:

1. **Meta app** (new, Prasaar-branded): add Facebook Login for Business with the permissions in PRD section 4. Callback `{APP_URL}/api/connect/meta/callback`, data deletion `{APP_URL}/api/meta/data-deletion`, deauthorize `{APP_URL}/api/meta/deauthorize`. Submit for review with screen recordings.
2. **LinkedIn app**: Sign In with LinkedIn + Share on LinkedIn now; apply for Community Management API for company pages, then set `LINKEDIN_ORG_SCOPES=1`.
3. **Legal pages**: `/privacy`, `/terms` and `/data-deletion` are drafts. Fill the contact, grievance officer and address (`src/app/(legal)/legal-config.ts` or the `NEXT_PUBLIC_*` env vars) and get them reviewed.
4. **Hostinger**: deploy `upload-service/` and turn off CDN image optimisation (see `upload-service/README.md`).
5. **Vercel** (Hobby works; Pro for a per-minute safety sweep), MongoDB Atlas in Mumbai, **Upstash QStash (required in production: it triggers each post at its time)** + Redis, Resend.

## Not in phase 1

Approvals, bulk CSV, analytics, REST API, MCP, webhooks, agency client workspaces and billing are phase 2+. The data model already has room for them (`approval` on post groups, `parentAgencyId` and `planId` on workspaces).
