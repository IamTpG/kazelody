# Deployment

Vercel, connected to `main`: Vite preset (`npm run build`, output `dist`). Functions in `api/` deploy with the project. `vercel.json` sets
long-lived caching for `/assets/*` (hashed) and `/scenes/*` (7 days, stale-while-revalidate), and rewrites and no-indexes `/admin`.
Scene images total about 4 MB; the page loads the stop in view first. Pull requests get Preview deployments.

Environment variables, bucket CORS and DNS are covered in [backend-r2.md](backend-r2.md#setup).
