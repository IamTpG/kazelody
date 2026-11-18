# KazeLody

A calm music player set in a hand-painted valley. Free, non-profit, no ads.

- **Scene:** a pre-rendered 2.5D valley with a full day/night cycle, parallax, wind-blown leaves and fireflies.
- **Player:** playlist, shuffle, volume, seek, media keys. Tracks are CC0 / CC-BY only.
- **Library:** private Cloudflare R2 bucket, served through short-lived signed URLs from Vercel Functions.
- **Admin:** a `/admin` page to upload, edit, reorder and delete tracks.

Stack: Vite, React, TypeScript, Tailwind, React Three Fiber, plain `<audio>`, Cloudflare R2, Vercel.

## Commands

```bash
npm install
npm run dev          # app only, http://localhost:5173 (music from public/audio/)
npm run dev:admin    # app + in-memory API + fake R2, no Cloudflare needed (see "Local sandbox")
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm test             # node --test (shared/, api/, src/audio, src/admin)
npm run tracks       # public/audio/ -> public/audio/tracks.json (local manifest)
npm run push-tracks  # upload public/audio/ to R2 (see "Pushing existing files")
```

URL parameters (for testing):

| Parameter | Effect |
|---|---|
| `?debug` | FPS panel; exposes `window.__kz.player` for manual control |
| `?hint` | Force the first-visit "drag the sun" hint (normally shown once, remembered in `localStorage` as `kz-arc-seen`) |
| `?t=4.5` | Open at a given time-slider value (0 = dawn ... 8 = late night) |

## Layout

```
api/            Vercel Functions: /api/tracks and /api/admin/*  (api/_lib = shared helpers, not routes)
shared/         DOM-free code used by app, api and tools: track model, license table, library model, time formatting
src/audio/      Player core: queue/shuffle, <audio> wrapper, sources (R2 API, local manifest), media session
src/ui/         Overlay: player, playlist, progress bar, time, TimeArc, petals; effects in player.css
src/admin/      /admin page (lazy-loaded) and its API/upload logic
src/scene2d/    2.5D parallax scene
src/scene/      Shader helpers shared with the scene (mulberry32, wind uniforms)
tools/          CLI tools: local manifest, push to R2, dev sandbox, scene capture
```

## Music

Only **CC0** and **CC-BY** tracks are accepted. Listeners see the title only for CC0, and title plus artist for CC-BY. Source and
license are stored for auditing but not displayed.

### File naming

Metadata is parsed from the file name:

```
Artist__Title__License[__source].ext
e.g. Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3
```

- The separator is **two underscores**, so hyphens, brackets, apostrophes and non-Latin text are fine in titles.
- Licenses: `CC0`, `CC-BY-4.0`, `CC-BY-3.0`, `CC-BY-2.0` (CC-BY requires a version). Source is a domain name and optional.
- File names cannot contain `/ \ : * ? " < > |`; use look-alike characters (`／ ： ？`). In local dev `#` is not allowed either
  (use `＃`). Commas, `&`, `;` and `'` are fine.
- Extensions: `mp3`, `ogg`, `opus`, `m4a`, `webm`, `wav`. Maximum size 30 MB.

### Local files

Put files in `public/audio/` (git-ignored) and run `npm run tracks`. It writes `public/audio/tracks.json` and reports any file name
that does not follow the convention. `npm run dev` then plays them; this is the fallback when no API is available.

### Durations

Each track's duration is measured **at upload** (in the browser for the admin page, with `music-metadata` in the CLI tools) and stored
in `tracks.json`. The playlist can therefore show every duration without extra R2 reads. Values are stored unrounded and truncated to
seconds when displayed, so the playlist and the player always agree. Tracks without a stored duration show none in the playlist.

### Player behaviour

- Plays the queue in order and loops; shuffle keeps the current track; a track that fails to load is skipped.
- `src/audio/player.ts` wraps one `<audio>` element and exposes an immutable snapshot for `useSyncExternalStore`. Playback time is
  read from `player.currentTime` in `requestAnimationFrame` loops (progress bar, time label) and never stored in React state.
- Volume and shuffle persist in `localStorage`. Space toggles playback; Escape or an outside click closes the playlist.
- Title line: `title — artist` on the left, `elapsed / total` on the right (`1:23 / 3:45`, `0:12:34 / 1:02:03` from one hour). When
  space is tight the title is truncated first, the artist keeps up to 45% of the line, and the time is never truncated. Full text is
  in the tooltip.
- UI style: bare icons with a two-layer shadow and a faint bottom scrim (stronger on hover and with the playlist open). Motion is
  limited to `transform`/`opacity` and is disabled under `prefers-reduced-motion`.

## Cloudflare R2 backend

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

### Setup

1. **R2:** create a bucket (e.g. `kazelody-audio`) and keep public access **off** (no `r2.dev` URL, no custom domain). Create an API token
   with *Object Read & Write* scoped to that bucket and note the Account ID, Access Key ID and Secret Access Key.
2. **Bucket CORS** (needed for browser uploads only; playback does not need it). Add every origin that hosts the admin page:

   ```json
   [
     {
       "AllowedOrigins": ["https://kazelody.iamtpg.dev", "http://localhost:5173", "http://localhost:3000"],
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

### Pushing existing files

```bash
npm run push-tracks -- --dry-run                    # list what would be uploaded; works without R2 credentials
node --env-file=.env.local tools/push-tracks.mjs    # upload; re-running does not create duplicates
```

Files are stored as `audio/<uuid>.<ext>`; the original name is kept only as metadata.

### Capacity and cost

R2 free tier: 10 GB storage, 1 M Class A and 10 M Class B operations per month, free egress; beyond that $0.015/GB-month,
$4.50/M Class A, $0.36/M Class B. A play costs a few Class B reads (not yet measured: check the bucket's Metrics tab), which puts the free
tier at roughly 80k-660k listening hours per month. Vercel Hobby (100 GB/month, non-commercial) is reached first, at about 20k new
visitors per month. R2 has no hard spending cap: set Cloudflare budget alerts, and to cut access immediately revoke the R2 API token.

## Admin page

`/admin` is lazy-loaded (`src/Root.tsx`), rewritten to `index.html` and served with `X-Robots-Tag: noindex` (`vercel.json`).

- **Upload:** drag and drop several files. Metadata is prefilled from the file name; fix it by hand when it does not match. Duration
  is measured in the browser. Unsupported extensions, files over 30 MB and duplicate file names are rejected before any network call.
  Files go straight to R2 with progress. If registering fails after the upload, retrying only re-registers, it does not re-upload.
- **Library:** edit metadata, reorder, delete (confirmed, removes the file too). Changes reach listeners within 5 minutes (CDN cache).
- Non-UI logic lives in `src/admin/api.ts` and `src/admin/upload.ts` and is unit-tested.

### Local sandbox

```bash
npm run dev:admin              # http://localhost:5173/admin, password printed (default kazelody-dev)
npm run dev:admin -- --seed    # preload public/audio/ into the library
```

Runs the real `api/` handlers against in-memory storage with a fake R2 at `/__r2/` (supports `Range`; rejects a PUT whose `Content-Type`
differs from the signed one) behind a Vite proxy. The listening page sees the same tracks. Data is lost on exit. It does not replace
testing against real R2 (bucket CORS, real signatures), which needs a Preview deployment. Optional variables: `DEV_ADMIN_PASSWORD`,
`PORT`, `DEV_API_PORT`, `R2_PRESIGN_TTL_SECONDS`.

## 2.5D scene (`src/scene2d`)

The scene is **rendered once offline**; the browser loads still images and the GPU recombines them with depth. There is no 3D geometry,
MSAA or post-processing at runtime, which keeps it light on integrated GPUs (about 16% GPU busy on an Intel UHD GT1 in the heaviest
night scene while interacting).

### Day cycle

Nine stops (5:30, 7:30, 10:00, 12:30, 15:30, 19:00, 20:20, 21:15, 23:30). `TimeArc` (a text-free sun/moon arc) blends continuously
between neighbouring stops; only the stop in view and its neighbours stay in GPU memory (`stops.ts`).

### Layers

Each stop has two images (`public/scenes/valley/hill-<hour>-plate.webp`, `-trees.webp`) sharing one depth map
(`hill-depth-small.png`), drawn through a 240x135 vertex grid displaced by depth on mouse move.

| Layer / file | Role |
|---|---|
| plate | Scene without near trees and mill sails; near grass sways with wind and reacts to the mouse; fireflies light the grass at night |
| mill sails | Drawn in the shader (4 blades), rotating about the hub; speed `MILL_RPM` in `ParallaxScene.tsx` |
| trees | Alpha image that sways, revealing the plate behind |
| `Leaves.tsx` | Leaves, petals and dandelion seeds in the wind; a click calls a gust |
| `Night.tsx` | Stars, village window lights (`windows.ts`), fireflies |
| `manifest.ts` | Per-stop clock, leaf tint, night factor, sail cloth colour |
| `valleyData.ts` | **Generated** by `tools/build-scene-data.mjs` (mill position and rotation plane) |
| `depth.ts` | Decodes 16-bit log depth into a 0..1 parallax map, blurred so tree edges do not stretch |

Particle motion is computed in vertex shaders from time. Wind strength is smoothed (`gustLevel`) so clicks do not cause jerks.

### Rendering a new scene

Source: [painted-valley](https://git.patch.gg/blendi/painted-valley) (code MIT, art CC0), cloned at `../painted-valley` with
`git lfs pull`. The local changes are kept in `tools/painted-valley.patch`:

- `src/lib/frame.js`: exposes `depthTexture`.
- `src/valley/sky.js`: dawn, twilight and moonlight (negative sun elevation), morning and post-sunset paths.
- `src/valley/main.js`: time limits widened to 4:30-24:00.
- `src/valley/farwoods.js`: names the sails `mill-sails` so they can be separated.

```bash
cd ../painted-valley && git apply ../kazelody/tools/painted-valley.patch
npm ci --ignore-scripts && npm run build

cd ../kazelody
node tools/capture-scene.mjs --src ../painted-valley --out captures/valley/day-high --views hill \
  --hours 5.5,7.5,10,12.5,15.5,19,20.3,21.25,23.5 --size 1920x1080 --quality high
node tools/build-scene-data.mjs --from captures/valley/day-high --view hill
python3 tools/find-windows.py captures/valley/day-high/hill-12_5-plate.webp   # -> src/scene2d/windows.ts
```

- Rendering is CPU-only (SwiftShader). **Never open painted-valley on a real GPU or browser**; it has frozen browsers. Expect 15-30
  minutes for the page to load and a few minutes per stop.
- Each stop renders two frames in the same state (full, and with near trees and sails hidden); their depth difference yields the tree mask.
- Camera views are defined in `VIEWS` in `tools/capture-scene.mjs` (`hill`, `wide`, `valley`, `village`, `peaks`) and can be overridden
  with `--views hill:fov=90:pitch=10`. Raw captures go to `captures/` (not committed).
- `build-scene-data.mjs` copies the images to `public/scenes/valley/` and generates `valleyData.ts`. Then update the clock, tint and night
  factor per stop in `manifest.ts` (and `windows.ts` if the camera changed).

## Deployment

Vercel, connected to `main`: Vite preset (`npm run build`, output `dist`). Functions in `api/` deploy with the project. `vercel.json` sets
long-lived caching for `/assets/*` (hashed) and `/scenes/*` (7 days, stale-while-revalidate), and rewrites and no-indexes `/admin`.
Scene images total about 4 MB; the page loads the stop in view first. Pull requests get Preview deployments.

## Credits

- Valley scene: [painted-valley](https://git.patch.gg/blendi/painted-valley) by blendi / Patch. Code MIT, art CC0 1.0 (see `LICENCE-NOTES.md`
  in that repository).
- Skyboxes in `public/skies`: [FreeStylized](https://freestylized.com) (sky_47, sky_127).
- Foliage shading technique based on [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) (MIT).
