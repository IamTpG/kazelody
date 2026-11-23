# Admin page

`/admin` is lazy-loaded (`src/Root.tsx`), rewritten to `index.html` and served with `X-Robots-Tag: noindex` (`vercel.json`).

- **Upload:** drag and drop several files. Metadata is prefilled from the file name; fix it by hand when it does not match. Duration
  is measured in the browser. Unsupported extensions, files over 30 MB and duplicate file names are rejected before any network call.
  Files go straight to R2 with progress. If registering fails after the upload, retrying only re-registers, it does not re-upload.
- **Library:** edit metadata, reorder, delete (confirmed, removes the file too). Changes reach listeners within 5 minutes (CDN cache).
- Non-UI logic lives in `src/admin/api.ts` and `src/admin/upload.ts` and is unit-tested.

## Local sandbox

```bash
npm run dev:admin              # http://localhost:5173/admin, password printed (default kazelody-dev)
npm run dev:admin -- --seed    # preload public/audio/ into the library
```

Runs the real `api/` handlers against in-memory storage with a fake R2 at `/__r2/` (supports `Range`; rejects a PUT whose `Content-Type`
differs from the signed one) behind a Vite proxy. The listening page sees the same tracks. Data is lost on exit. It does not replace
testing against real R2 (bucket CORS, real signatures), which needs a Preview deployment. Optional variables: `DEV_ADMIN_PASSWORD`,
`PORT`, `DEV_API_PORT`, `R2_PRESIGN_TTL_SECONDS`.

See also: [backend-r2.md](backend-r2.md) for the API endpoints and environment variables.
