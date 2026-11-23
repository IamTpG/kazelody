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
npm run dev:admin    # app + in-memory API + fake R2, no Cloudflare needed (docs/admin.md)
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm test             # node --test (shared/, api/, src/audio, src/admin)
npm run tracks       # public/audio/ -> public/audio/tracks.json (local manifest)
npm run push-tracks  # upload public/audio/ to R2 (docs/backend-r2.md)
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
src/scene/      Helpers shared with the scene (mulberry32, wind uniforms)
tools/          CLI tools: local manifest, push to R2, dev sandbox, scene capture
```

## Docs

| Topic | File |
|---|---|
| File naming, licenses, durations, player behaviour | [docs/music.md](docs/music.md) |
| Cloudflare R2 library, API, setup, cost | [docs/backend-r2.md](docs/backend-r2.md) |
| `/admin` page and local sandbox | [docs/admin.md](docs/admin.md) |
| 2.5D scene and how to render a new one | [docs/scene-pipeline.md](docs/scene-pipeline.md) |
| Vercel deployment | [docs/deployment.md](docs/deployment.md) |

## Credits

- Valley scene: [painted-valley](https://git.patch.gg/blendi/painted-valley) by blendi / Patch. Code MIT, art CC0 1.0 (see `LICENCE-NOTES.md`
  in that repository).
