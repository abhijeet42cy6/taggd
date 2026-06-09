---
name: deploy
description: >-
  Deploys tgddata to GCP Cloud Run + Cloud SQL + GCS (primary production path):
  API via deploy/gcp/06-deploy-api.sh, SPA via 07-deploy-frontend.sh. Also covers
  local dev vs cloud differences and legacy VM deploy (taggd.aparatus.in). Use when
  the user asks to deploy, update production, push code to cloud, Cloud Run deploy,
  GCS frontend, or promote data to Cloud SQL.
---

# tgddata deploy (Cloud Run + GCS)

## When this applies

**Default production path** for the stack built in May 2026: **Cloud Run API + Cloud SQL Postgres + GCS** (static UI + uploads). Run deploy scripts from **repository root** unless the user explicitly asks for the **legacy VM** (`taggd.aparatus.in`).

Index: [`DEPLOYMENT_DOC.md`](../../DEPLOYMENT_DOC.md). Detail: [`docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md`](../../docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md), [`deploy/gcp/README.md`](../../deploy/gcp/README.md).

---

## GCP targets (taggd-491107)

| Resource | ID / name | Notes |
|----------|-----------|--------|
| **GCP project** | `taggd-491107` | `gcloud config set project taggd-491107` |
| **Region** | `asia-south1` | Cloud Run, Cloud SQL, AR, VPC connector |
| **Cloud Run service (API)** | `tgddata-api` | Image: `asia-south1-docker.pkg.dev/taggd-491107/tgddata/api:latest` |
| **Cloud Run URL** | `https://tgddata-api-lnucyjw2sa-el.a.run.app` | Discover: `gcloud run services describe tgddata-api --region=asia-south1 --format='value(status.url)'` |
| **Cloud SQL instance** | `tgddata-pg-prod` | Postgres 16, **private IP only** (steady state) |
| **Cloud SQL connection** | `taggd-491107:asia-south1:tgddata-pg-prod` | Unix socket on Cloud Run: `/cloudsql/...` |
| **DB name / user** | `tgddata` / `tgddata_app` | Password secret: `tgddata-pg-prod-db-password` |
| **VPC connector** | `tgddata-run-connector` | Required: Cloud Run → private Cloud SQL |
| **GCS uploads** | `gs://taggd-tgddata-prod-uploads` | `STORAGE_BACKEND=gcs` |
| **GCS web (SPA)** | `gs://taggd-tgddata-prod-web` | Static React build |
| **SPA URL (production)** | `https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login` | **Canonical entry** — use `app.html`, not `index.html` |
| **SPA URL (legacy)** | `https://storage.googleapis.com/taggd-tgddata-prod-web/index.html#/login` | May be edge-cached up to ~1h after a bad deploy |
| **Runtime SA** | `tgddata-runtime@taggd-491107.iam.gserviceaccount.com` | Cloud Run service account |
| **Artifact Registry** | `asia-south1-docker.pkg.dev/taggd-491107/tgddata` | API Docker images |
| **Secrets (SM)** | `TGDDATA_DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `tgddata-pg-prod-db-password` | Never commit |
| **Generated paths** | `deploy/gcp/.generated/api-url.txt`, `web-url.txt`, `cloudrun-api.env` | Gitignored |

Config source: [`deploy/gcp/config.defaults.env`](../../deploy/gcp/config.defaults.env).

---

## Local dev vs cloud (same code, different wiring)

| | **Local (typical)** | **Cloud (production)** |
|--|---------------------|-------------------------|
| **Database** | Docker Compose **Postgres 16** on `127.0.0.1:5432` (`docker-compose.yml`) | **Cloud SQL** `tgddata-pg-prod` |
| **SQLite** | Still supported if `DATABASE_URL` unset → `sqlite:///./revenue_generator.db` (legacy) | **Blocked** when `APP_ENV=production` |
| **API** | `uvicorn` :8000 or `docker compose` backend | **Cloud Run** `tgddata-api` |
| **Frontend** | `npm run dev` :3000; Vite proxies **`/api` → :8000** (strips `/api`) | **GCS** static files; `VITE_API_BASE_URL` = Cloud Run URL **without** `/api` |
| **File uploads** | Local disk / `STORAGE_BACKEND=local` | **GCS** `taggd-tgddata-prod-uploads` |
| **Migrations** | `alembic upgrade head` locally | Alembic on **container start** + optional `05-migrate-database*.sh` for data |
| **Data** | Your local Postgres volume or SQLite file | Migrated SQLite → Cloud SQL (separate DB; changes locally do **not** auto-sync) |

**Congruence:** One repo, same FastAPI + React code, same Alembic revisions. Test locally against Postgres when possible (`docker compose up -d postgres`). Deploying code does **not** copy local DB data to cloud unless you run a migration script intentionally.

---

## Prerequisites (before deploy)

```bash
gcloud auth login
gcloud auth application-default login   # only for DB migration scripts from laptop
gcloud config set project taggd-491107
chmod +x deploy/gcp/*.sh
```

Deployer IAM (typical): Cloud Build Editor, Cloud Run Admin, Storage Admin, Secret Manager Secret Accessor, Service Account User (on `tgddata-runtime`).

- Repo **`.env`** is for **local dev only** — not uploaded to Cloud Run (secrets from Secret Manager).
- **Never commit** `.env` or production credentials.

---

## Standard deploy: push local code changes to cloud

From **repository root** after local testing:

### Backend only (Python, Alembic, API routes)

```bash
./deploy/gcp/06-deploy-api.sh
```

- Cloud Build → `Dockerfile.backend.cloudrun` → Artifact Registry → Cloud Run rollout (~5–10 min).
- Sets VPC connector, Cloud SQL attachment, env + secrets.
- **Faster** if image already built: `SKIP_BUILD=1 ./deploy/gcp/06-deploy-api.sh`

### Frontend only (React / Vite)

```bash
./deploy/gcp/07-deploy-frontend.sh
```

Default (`FRONTEND_HOST=gcs`) — **do not override** unless you know what you are doing:

| Setting | Value | Why |
|---------|-------|-----|
| `FRONTEND_HOST` | `gcs` (default) | GCS path-style hosting on `storage.googleapis.com` |
| `VITE_STATIC_HOSTING` | `1` | Enables HashRouter + relative asset paths |
| `GCS_WEB_BASE` | `./` | Relative `./assets/…` in `index.html` (required for GCS path URLs) |
| `VITE_API_BASE_URL` | Cloud Run URL from `06` | **No** `/api` suffix — API serves `/auth`, `/projects`, … at root |

Build output is rsync'd to `gs://taggd-tgddata-prod-web/`. The script uploads `index.html` and **`app.html`** (same shell) with `Cache-Control: no-cache`.

**Canonical login URL after deploy:**

`https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login`

### Full app release (most common)

```bash
./deploy/gcp/06-deploy-api.sh
./deploy/gcp/07-deploy-frontend.sh
```

### First-time / infra bootstrap (rare)

```bash
./deploy/gcp/deploy-all.sh
```

Scripts `01`–`05` only when creating env, buckets, IAM, VPC connector, or **SQLite → Cloud SQL data** load.

---

## GCS frontend hosting (production config)

The live UI is a **static SPA on GCS**, not a custom domain. Routing rules:

1. **HashRouter** — routes are `#/login`, `#/dashboard`, etc. GCS has no server-side SPA rewrite.
2. **`base=./`** — asset URLs in `index.html` must be `./assets/…`, never `/assets/…`.
3. **`VITE_STATIC_HOSTING=1`** — frontend calls Cloud Run directly (full HTTPS origin), not via a same-host `/api` proxy.
4. **`VITE_API_BASE_URL`** — set automatically to the Cloud Run service URL (no trailing `/api`). Example: `https://tgddata-api-lnucyjw2sa-el.a.run.app`.
5. **CORS** — Cloud Run must allow `https://storage.googleapis.com` in `CORS_ALLOW_ORIGINS`.
6. **Entry URL** — always share **`app.html#/login`**. `index.html` can be edge-cached for up to ~1h after a broken deploy; `app.html` is uploaded with `no-cache` on every deploy.

**Verify build before upload** (script checks this):

```bash
grep -E 'src="/assets/' frontend/dist/index.html && echo "BAD: root-absolute assets" || echo "OK: relative assets"
```

**If `gsutil rsync` stalls from a laptop** (flaky link to `storage.googleapis.com`):

- Script already uses `GSUtil:parallel_process_count=1` and excludes legacy `group-14004.png` (~55MB).
- Minimal manual upload for a code-only change:

```bash
cd frontend/dist
gsutil -o "GSUtil:parallel_process_count=1" cp assets/index-*.js assets/index-*.css assets/*.woff2 gs://taggd-tgddata-prod-web/assets/
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" cp index.html gs://taggd-tgddata-prod-web/index.html
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" cp index.html gs://taggd-tgddata-prod-web/app.html
```

---

## After deploy — verify (agent must run)

```bash
# DB + row counts (no auth)
curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready
# Expect: "database":"ok" and non-zero projects/records when data exists

# Cloud Run revision
gcloud run services describe tgddata-api --project=taggd-491107 --region=asia-south1 \
  --format='value(status.latestReadyRevisionName,status.url)'

# SPA shell + assets (use --http1.1 if curl fails on HTTP/2)
curl -sS -o /dev/null -w "app.html:%{http_code}\n" --http1.1 \
  "https://storage.googleapis.com/taggd-tgddata-prod-web/app.html"

# Recent errors
gcloud run services logs read tgddata-api --project=taggd-491107 --region=asia-south1 --limit=40
```

**Browser:** open `https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login`, hard-refresh (Cmd+Shift+R). Login with a user that exists in **Cloud SQL** (not necessarily local-only accounts).

**Executive Overview:** DevTools → `/stats/global` and `/stats/global/monitor` must be **200** (not 404 `/api/...`, not 500 on `revenue_results`).

---

## Database / data updates (cloud)

| Goal | Command |
|------|---------|
| **Schema only** | Usually automatic on API deploy (`alembic upgrade head` in container) |
| **SQLite → Cloud SQL (laptop)** | `./deploy/gcp/05-migrate-database-via-public-ip.sh` |
| **Schema only, no data copy** | `SKIP_DATA_MIGRATION=1 ./deploy/gcp/05-migrate-database-via-public-ip.sh` |
| **Skip migration in bootstrap** | `SKIP_DB_MIGRATION=1 ./deploy/gcp/deploy-all.sh` |

Canonical SQLite source (if needed): `SQLITE_SOURCE_PATH` or `/Users/arjun/Software/tagged_data_sql/revenue_generator.db`.

**Do not** assume local Postgres data syncs to cloud when you deploy code.

---

## Critical build / routing rules

1. **`VITE_API_BASE_URL`** = Cloud Run origin with **no** trailing `/api`  
   Example: `https://tgddata-api-lnucyjw2sa-el.a.run.app`
2. **GCS URL** requires `base=./`, `VITE_STATIC_HOSTING=1`, and **HashRouter** (`#/login`).
3. **Do not** build with `GCS_WEB_BASE=/` or `VITE_STATIC_HOSTING=0` for the GCS bucket — that produces root-absolute `/assets/` paths that break on `storage.googleapis.com/…/app.html`.
4. **Postgres migration:** JSON columns like `records.revenue_results` may be **strings** — use `backend/core/json_fields.as_json_dict()` when reading `.get()` in Python.

---

## Troubleshooting (Cloud Run path)

| Symptom | Action |
|--------|--------|
| Cloud Build upload `400` / DNS | Retry `06-deploy-api.sh` from stable network |
| `/ready` database not ok | Check VPC connector READY (`04c-setup-vpc-connector.sh`), redeploy `06` |
| Login Network Error | CORS must include `https://storage.googleapis.com`; verify `VITE_API_BASE_URL` points at Cloud Run (no `/api`) |
| White screen / old JS after deploy | Open **`app.html#/login`**, not `index.html`; hard-refresh; check DevTools for 404 on `./assets/index-*.js` |
| KPI banner, 404 on `/api/stats/…` | Redeploy `07`; hard-refresh cached JS |
| KPI banner, 500 on monitor | Logs: `AttributeError` on `revenue_results` → redeploy API with `json_fields` fix |
| `gsutil rsync` stalls at 70–90% | Use single-threaded upload (script default); upload JS/CSS/HTML only; retry from stable network |
| `Cannot read tgddata-pg-prod-db-password` | `gcloud auth login`; Secret Manager accessor on deployer account |

---

## Legacy: VM deploy (`taggd.aparatus.in`)

Separate stack — **GCE VM** + host Nginx + Docker Compose. Use only when user asks for VM / `taggd.aparatus.in` update:

```bash
source scripts/gcp-env-tgddata-c1-prod-2.sh
./scripts/deploy-gcp.sh
```

| | VM | Cloud Run (primary) |
|--|-----|---------------------|
| VM | `tgddata-c1-prod-2`, zone `asia-south1-a` | — |
| URL | `https://taggd.aparatus.in/` | GCS SPA + Cloud Run API |
| Frontend API base | `/api` (relative) | Full Cloud Run HTTPS URL |
| DB promote | `./scripts/promote-db-to-gcp.sh` | `05-migrate-database-via-public-ip.sh` |

Do **not** mix VM frontend build settings with Cloud Run/GCS without understanding `/api` prefix differences.

---

## Agent checklist

1. Confirm user wants **Cloud Run + GCS** (default) vs **VM**.
2. Run `06` / `07` from repo root; wait for completion.
3. `curl /ready` and check logs for 500s.
4. Verify `app.html` and referenced `./assets/index-*.js` return **200**.
5. Remind user to open **`app.html#/login`** (not `index.html`) and use a Cloud SQL login.
6. Do not commit `.env` or run destructive git commands unless asked.
