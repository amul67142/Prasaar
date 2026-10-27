# Prasaar upload service (Hostinger)

Browsers upload media straight here with a signed, one-hour URL from the Next.js app (`POST /media/upload-url` in the PRD). Files never pass through Vercel, which caps requests at 4.5 MB.

## Routes

| Route | Who calls it | Does |
| --- | --- | --- |
| `PUT /upload/<key>?mime&max&exp&sig` | Browser | Checks the signature, type and size, streams the file to `MEDIA_ROOT/<key>`, records size, SHA-256, image dimensions and video duration (if `ffprobe` exists) |
| `GET /meta/<key>` | Next.js app (signed `X-Expires` / `X-Signature`) | Returns the recorded metadata, used by "complete upload" |
| `DELETE /files/<key>` | Next.js app (signed) | Removes the file and its metadata |
| `GET /health` | Uptime check | `{ ok: true }` |

Keys look like `media/<workspaceId>/<random>.<ext>`; anything else is refused.

## Environment

| Variable | Example |
| --- | --- |
| `UPLOAD_SIGNING_SECRET` | Same value as in the Next.js app. Long random string. |
| `MEDIA_ROOT` | `/home/u123/domains/cdn.example.in/public_html` (the CDN subdomain's web root) |
| `META_ROOT` | `/home/u123/prasaar-meta` (outside any web root) |
| `APP_ORIGIN` | `https://app.example.in` (for CORS) |
| `PORT` | Set by Hostinger |

## Hostinger setup checklist

1. Create a Node.js app on `upload.<domain>` pointing at this folder; run `npm install`.
2. Point `cdn.<domain>` at `MEDIA_ROOT` and enable the CDN.
3. **Turn off image optimisation for the CDN** (hPanel → CDN → Optimisation). Platforms must receive the exact uploaded bytes.
4. Add `MEDIA_ROOT/.htaccess` with `Options -Indexes` so folders can't be listed.
5. In the Next.js app set `STORAGE_DRIVER=hostinger`, `UPLOAD_BASE_URL=https://upload.<domain>`, `CDN_BASE_URL=https://cdn.<domain>`.
