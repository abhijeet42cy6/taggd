# GCP Cloud Run rollout — updates log (May 2026)

Short changelog for the Cloud Run rollout. For the **full guide** (architecture, issues, and **how to deploy local code changes**), see **[`GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md`](GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md)**.

**Also:** [`DEPLOYMENT_DOC.md`](../DEPLOYMENT_DOC.md), [`deploy/gcp/README.md`](../deploy/gcp/README.md), [`CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md`](CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md), [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md)

---

## Live endpoints

| Component | URL |
|-----------|-----|
| API | https://tgddata-api-lnucyjw2sa-el.a.run.app |
| SPA (GCS) | https://storage.googleapis.com/taggd-tgddata-prod-web/index.html#/login |

---

## What was built

### `deploy/gcp/` scripted pipeline

| Script | Purpose |
|--------|---------|
| `01-enable-apis.sh` | GCP APIs |
| `02-setup-storage.sh` | `taggd-tgddata-prod-uploads`, `taggd-tgddata-prod-web` |
| `02c-sync-database-url-secret.sh` | Secret `TGDDATA_DATABASE_URL` (Unix socket URL) |
| `03-setup-iam.sh` | Runtime SA + `cloudsql.client`, `vpcaccess.user`, GCS |
| `03b-bind-runtime-secrets.sh` | JWT, GEMINI, DB password accessors |
| `04-setup-artifact-registry.sh` | Docker repo `tgddata/api` |
| `04c-setup-vpc-connector.sh` | `tgddata-run-connector` (private Cloud SQL from Cloud Run) |
| `05-migrate-database.sh` | Local proxy + Alembic + SQLite copy |
| `05-migrate-database-via-public-ip.sh` | **Recommended for laptops:** brief public IP → migrate → remove public IP |
| `06-deploy-api.sh` | Cloud Build + Cloud Run (`--vpc-connector`, secrets) |
| `07-deploy-frontend.sh` | Vite build → GCS |
| `deploy-all.sh` | Full bootstrap |

### Application (already in repo)

- PostgreSQL + Alembic on container start
- GCS blob storage (`STORAGE_BACKEND=gcs`)
- `/health`, `/ready`
- `VITE_API_BASE_URL` at frontend build time

### Data migration (completed)

- **30,355 rows** from `/Users/arjun/Software/tagged_data_sql/revenue_generator.db` → Cloud SQL via `05-migrate-database-via-public-ip.sh`
- Cloud SQL user `tgddata_app` cannot set `session_replication_role`; migrator skips it and uses FK-safe table order

---

## Architecture notes

```text
Browser → GCS (static index.html + JS)
       → Cloud Run API (tgddata-api)
              ├── VPC connector → Cloud SQL private IP
              └── GCS uploads bucket
```

- **Cloud SQL** stays **private-IP-only** in steady state; public IP is only for one-off laptop migration.
- **Cloud Run** requires **Serverless VPC Access** to reach private Cloud SQL (not optional for this instance).

---

## Frontend: how it is meant to be served

tgddata is a **Vite + React SPA**, not a server-rendered HTML app.

| Environment | How it works |
|-------------|----------------|
| **Local / VM** | Nginx serves `dist/`; `location /api/` proxies to FastAPI and **strips** `/api` (see `nginx.conf`). Frontend uses `VITE_API_BASE_URL=/api` (relative). |
| **GCS path URL** | Single `index.html` + hashed assets under `gs://taggd-tgddata-prod-web/`. No server-side routing — **HashRouter** + Vite **`base=./`** (relative assets). Bookmark: `…/index.html#/login`. |
| **Cloud Run API** | FastAPI routes are at **`/auth/login`**, **`/projects`**, **`/stats/global`**, etc. There is **no** global `/api` prefix (unlike VM nginx). `ApiPrefixStripMiddleware` strips `/api` if the UI was built with a trailing `/api`. |

### Issues found and fixed (May 2026)

1. **White screen** — absolute `/assets/...` on `storage.googleapis.com`. Fixed: `07-deploy-frontend.sh` uses `GCS_WEB_BASE=./` and `gsutil rsync`.

2. **Login “Network Error”** — (a) Frontend used `VITE_API_BASE_URL=…/api`. (b) 401s without CORS. Fixed: API URL **without** `/api`; CORS outermost; `/api/auth/*` duplicate routes; HashRouter on GCS.

3. **Router / static paths on GCS** — HashRouter + `VITE_STATIC_HOSTING=1`; base-aware login background image.

4. **Dashboard KPI banner (404)** — UI called `/api/stats/global` etc. Fixed: redeploy `07` (no `/api` in `VITE_API_BASE_URL`); `ApiPrefixStripMiddleware` on API.

5. **Dashboard KPI banner (500)** — `revenue_results` stored as JSON **strings** after SQLite→Postgres; `/stats/global` and `/stats/global/monitor` failed with `AttributeError`. Fixed: `backend/core/json_fields.as_json_dict()`; used in `get_global_stats`, `get_global_monitoring`, `get_drilldown_stats`.

6. **`/ready` diagnostics** — returns `projects`, `records`, `users` counts for quick Cloud SQL sanity checks (no auth).

---

## Configuration reference

| Variable | Production (Cloud Run) |
|----------|-------------------------|
| `DATABASE_URL` | Secret `TGDDATA_DATABASE_URL` (socket + `sslmode=disable`) |
| `STORAGE_BACKEND` | `gcs` |
| `STORAGE_BUCKET` | `taggd-tgddata-prod-uploads` |
| `CORS_ALLOW_ORIGINS` | Include `https://storage.googleapis.com` and custom UI origin |
| `VITE_API_BASE_URL` (build) | `https://tgddata-api-….run.app` (**no** trailing `/api`) |
| Vite `base` (build) | `./` for current GCS URL (`GCS_WEB_BASE=./` in `07-deploy-frontend.sh`) |

---

## Still recommended

- **Custom domain + Cloud CDN** for the SPA (instead of raw `storage.googleapis.com`)
- Map `taggd.aparatus.in` API to Cloud Run domain mapping when cutting over from VM
- Rebuild frontend with `GCS_WEB_BASE=/` when the UI is served at domain root behind CDN

---

## Quick verification

```bash
curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready
# {"status":"ready","database":"ok","projects":178,"records":10645,"users":6}

curl -sI https://storage.googleapis.com/taggd-tgddata-prod-web/index.html | head -3

# Login (use a user that exists in Cloud SQL)
curl -sS -X POST https://tgddata-api-lnucyjw2sa-el.a.run.app/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'

# After login, Executive Overview needs 200 on:
# GET /stats/global  and  GET /stats/global/monitor  (not /api/stats/…)
```
