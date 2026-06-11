# GCS White Screen Incident (2026-06-02)

## Summary

Users saw a white screen at:

- `https://storage.googleapis.com/taggd-tgddata-prod-web/index.html#/login`

The API was healthy, but the frontend shell served from GCS referenced missing JS assets. This blocked React from booting and left an empty `#root`.

## User-facing symptoms

- White/blank screen after opening the GCS staging URL.
- In some sessions, only a `Loading...` shell was visible.
- Upload/API features were not reachable from UI because bundle execution never started.

## What went wrong

There were two related issues:

1. **Wrong frontend build profile for the URL being used**
   - A frontend build was produced with root-domain settings (`GCS_WEB_BASE=/`, `VITE_STATIC_HOSTING=0`) instead of GCS path-style hosting.
   - That generated root-absolute asset paths in HTML, e.g.:
     - `src="/assets/index-1ps6BGb0.js"`
   - For path-style GCS URL access, those paths are wrong (they resolve to `/assets/...` at host root instead of bucket path context).

2. **Stale edge-cached `index.html` on `storage.googleapis.com`**
   - Even after redeploying a correct GCS build (`base=./`), public `index.html` continued serving an older cached HTML shell for a period.
   - Bucket object content was correct (`./assets/index-BgIJGADw.js`), but CDN edge still returned old HTML (`/assets/index-1ps6BGb0.js`), causing continued white screen until cache expiry.

## Evidence observed

- Public URL initially served:
  - `<script type="module" crossorigin src="/assets/index-1ps6BGb0.js"></script>`
- Bucket object content (via `gsutil cat`) served:
  - `<script type="module" crossorigin src="./assets/index-BgIJGADw.js"></script>`
- Old referenced bundle from public HTML returned 404, preventing app bootstrap.
- API health remained OK during incident (`/ready` returned `database: ok`).

## Fix implemented

### Immediate recovery

1. Redeployed frontend with GCS-safe settings:
   - `VITE_API_BASE_URL=https://tgddata-api-lnucyjw2sa-el.a.run.app`
   - `VITE_STATIC_HOSTING=1`
   - `GCS_WEB_BASE=./`
2. Published alternate entrypoint:
   - `https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login`
   - This bypassed stale cache tied to `index.html`.

### Hardening in deploy script

`deploy/gcp/07-deploy-frontend.sh` was updated to prevent recurrence:

- Always builds for **GCS path-style hosting**: `base=./`, `VITE_STATIC_HOSTING=1`, API base from Cloud Run URL.
- Fail deploy if build outputs root-absolute `src="/assets/..."`.
- Upload HTML with strict no-cache headers: `Cache-Control: no-cache, no-store, must-revalidate`.
- Publish both `index.html` and `app.html` (same shell) — **`app.html` is the canonical production entry**.

## Current operational guidance

- **Production login URL:**
  - `https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login`
- Avoid sharing `index.html#/login` after deploys — edge cache may serve a stale shell for up to ~1h.
- Never deploy with `GCS_WEB_BASE=/` or `VITE_STATIC_HOSTING=0` for this bucket.

## Lessons learned

1. Build flags must match the URL pattern users open (`storage.googleapis.com/.../app.html` requires relative `./assets`).
2. `index.html` should always be no-cache; hashed assets can remain long-cache.
3. Keep a stable alternate entrypoint (`app.html`) for emergency cache bypass after bad shell deploys.
