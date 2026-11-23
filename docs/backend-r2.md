# Cloudflare R2 backend

```
browser --GET /api/tracks--> Vercel Function --reads tracks.json--> R2 (private bucket)
   ^                              | signs URLs locally (no network call)
   '------- streams audio (Range requests) directly from R2 ------------'
```

- The library is a single `tracks.json` in the bucket (array order = play order). There is no database.
- `GET /api/tracks` returns the tracks with signed URLs valid for 3 hours and is cached by Vercel's CDN for 5 minutes
  (`s-maxage=300`), so R2 and the function are barely touched however many people listen. The player requests fresh URLs when fewer
  than 15 minutes remain (`src/audio/sources/api.ts`).
- Signed URLs are a soft barrier only: anyone can record audio, and real DRM would conflict with CC-BY.

| Endpoint | Purpose |
|---|---|
| `GET /api/tracks` | Public: tracks with signed listening URLs |
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session` | Admin session (HMAC-signed cookie, HttpOnly, SameSite=Strict, `Origin` checked on writes) |
| `POST /api/admin/upload-url` | `{filename, size}` -> signed PUT URL (15 min, Content-Type signed) |
| `GET`, `POST /api/admin/tracks` | List the library / register an uploaded file (verified to exist, correct type, <= 30 MB) |
| `PATCH`, `DELETE /api/admin/tracks/:id` | Edit metadata or `{moveTo}` / remove a track and its file |

## Setup

1. **R2:** create a bucket (e.g. `kazelody-audio`) and keep public access **off** (no `r2.dev` URL, no custom domain). Create an API token
   with *Object Read & Write* scoped to that bucket and note the Account ID, Access Key ID and Secret Access Key.
2. **Bucket CORS** (needed for browser uploads only; playback does not need it). Add every origin that hosts the admin page:

   ```json
   [
     {
       "AllowedOrigins": ["https://kazelody.iamtpg.dev", "https://kazelody.vercel.app", "http://localhost:5173", "http://localhost:3000"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

3. **Environment variables** in Vercel (Production and Preview). `.env.example` is the template for a local `.env.local`.

   | Variable | Notes |
   |---|---|
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | From step 1 (`R2_ACCOUNT_ID` is only the ID, not the endpoint URL) |
   | `ADMIN_PASSWORD` | Admin password, at least 8 characters |
   | `SESSION_SECRET` | Random string of at least 32 characters, e.g. `openssl rand -hex 32`; changing it signs everyone out |
   | `PUBLIC_ORIGIN` | Optional. Leave unset so `Origin` is compared with the request host (correct for previews too) |
   | `R2_PRESIGN_TTL_SECONDS` | Optional, 60-604800, default 10800. Set it short to exercise URL refresh |

   Missing variables make the API answer `503`; variable names only appear in server logs.
4. **DNS:** `CNAME` for the site to `cname.vercel-dns.com`, **DNS only**, and add the domain to the Vercel project.

## Pushing existing files

```bash
npm run push-tracks -- --dry-run                    # list what would be uploaded; works without R2 credentials
node --env-file=.env.local tools/push-tracks.mjs    # upload; re-running does not create duplicates
```

Files are stored as `audio/<uuid>.<ext>`; the original name is kept only as metadata.

## Capacity and cost

R2 free tier: 10 GB storage, 1 M Class A and 10 M Class B operations per month, free egress; beyond that $0.015/GB-month,
$4.50/M Class A, $0.36/M Class B. A play costs a few Class B reads (not yet measured: check the bucket's Metrics tab), which puts the free
tier at roughly 80k-660k listening hours per month. Vercel Hobby (100 GB/month, non-commercial) is reached first, at about 20k new
visitors per month. R2 has no hard spending cap: set Cloudflare budget alerts, and to cut access immediately revoke the R2 API token.

See also: [admin.md](admin.md), [deployment.md](deployment.md), [music.md](music.md).
