# GCP Cloud Run deployment guide (tgddata)

This document records the **Cloud Run + Cloud SQL + GCS** production setup for tgddata (project `taggd-491107`, May 2026) and explains **how to change code locally and publish updates** to that environment.

**Related:**

- **Deployment index:** [`DEPLOYMENT_DOC.md`](../DEPLOYMENT_DOC.md) (primary vs legacy VM)
- Script reference: [`deploy/gcp/README.md`](../deploy/gcp/README.md)
- Architecture: [`CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md`](CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md)
- Postgres / migration: [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md)
- Shorter changelog: [`GCP_CLOUD_RUN_ROLLOUT_UPDATES.md`](GCP_CLOUD_RUN_ROLLOUT_UPDATES.md)

---

## 1. What is deployed

| Layer | GCP resource | Purpose |
|-------|----------------|---------|
| **API** | Cloud Run `tgddata-api` | FastAPI backend (Docker) |
| **Database** | Cloud SQL `tgddata-pg-prod` | PostgreSQL 16, **private IP only** |
| **Uploads** | GCS `taggd-tgddata-prod-uploads` | Avatars, MSAs, billing files, etc. |
| **Web UI** | GCS `taggd-tgddata-prod-web` | Vite/React static build |
| **Images** | Artifact Registry `asia-south1-docker.pkg.dev/taggd-491107/tgddata/api` | API container |
| **VPC** | Serverless connector `tgddata-run-connector` | Cloud Run → private Cloud SQL |
| **Runtime SA** | `tgddata-runtime@taggd-491107.iam.gserviceaccount.com` | Cloud Run identity |

### Live URLs (current)

| Component | URL |
|-----------|-----|
| API | https://tgddata-api-lnucyjw2sa-el.a.run.app |
| SPA (use this) | https://storage.googleapis.com/taggd-tgddata-prod-web/index.html#/login |

### Architecture

```text
Browser
  → GCS bucket (index.html + JS/CSS)
  → HTTPS → Cloud Run tgddata-api
        ├── VPC connector → Cloud SQL (private IP)
        └── GCS taggd-tgddata-prod-uploads
```

Secrets (Secret Manager, not in git): `TGDDATA_DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `tgddata-pg-prod-db-password`.

---

## 2. How the app is built and served

tgddata is a **Vite + React SPA** plus a **Python FastAPI** API. It is **not** a single HTML file with embedded logic.

| Piece | Local dev | VM (`taggd.aparatus.in`) | Cloud Run + GCS |
|-------|-----------|--------------------------|-----------------|
| UI | `npm run dev` (Vite) | Nginx serves `dist/` | GCS hosts `dist/` |
| API | Uvicorn / Docker | Nginx proxies `/api/` → backend | Cloud Run URL directly |
| API path prefix | Vite proxy strips `/api` | Nginx strips `/api` | **No global `/api` prefix** on Cloud Run |

**Important for frontend builds targeting Cloud Run:**

- `VITE_API_BASE_URL` must be the Cloud Run URL **without** `/api`  
  Example: `https://tgddata-api-lnucyjw2sa-el.a.run.app`
- GCS hosting uses **relative assets** (`base: ./`) and **hash routes** (`#/login`) so the app stays under  
  `https://storage.googleapis.com/taggd-tgddata-prod-web/index.html`

`07-deploy-frontend.sh` sets these automatically.

---

## 3. Rollout history (issues we hit and fixes)

### Infrastructure

- Scripted pipeline under `deploy/gcp/` (`01`–`07`, `deploy-all.sh`).
- **VPC connector** required because Cloud SQL is private-IP-only.
- **Secret** `TGDDATA_DATABASE_URL` for Unix-socket Postgres URL on Cloud Run.
- **Data migration:** 30,355 rows from canonical SQLite  
  `/Users/arjun/Software/tagged_data_sql/revenue_generator.db` via temporary public IP  
  (`05-migrate-database-via-public-ip.sh`).

### Frontend (GCS)

| Symptom | Cause | Fix |
|---------|--------|-----|
| White screen | `index.html` used `/assets/...` (wrong host path on GCS) | Build with `base=./`; upload via `gsutil rsync` |
| Redirect to `storage.googleapis.com/login` | `BrowserRouter` without hash on GCS | **HashRouter** on `storage.googleapis.com` |
| Login **Network Error** | Built with `VITE_API_BASE_URL=…/api` → `/api/auth/login`; 401 without CORS | API URL without `/api`; CORS outermost; `/api/auth/*` routes duplicated |
| **All KPIs zero**, “Unable to load dashboard KPIs” (404) | GCS bundle called `/api/stats/global` etc. → **404** (routes are `/stats/global`) | Redeploy frontend (`07`) without `/api` in `VITE_API_BASE_URL`; `07` strips trailing `/api`; API has `ApiPrefixStripMiddleware` |
| **Banner persists**, requisitions count shows, clients “—” (500) | SQLite→Postgres left `records.revenue_results` as **JSON strings**; `/stats/global` and `/stats/global/monitor` called `.get()` on a `str` | Fixed in `backend/core/json_fields.py` (`as_json_dict`); redeploy API (`06`) |

### Verify data in Cloud SQL (no login)

```bash
curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready
# Example after migration:
# {"status":"ready","database":"ok","projects":178,"records":10645,"users":6}
```

### Backend (Cloud Run)

- CORS middleware moved **outermost** so early 401s still include `Access-Control-Allow-Origin`.
- Auth router mounted at **`/auth`** and **`/api/auth`** (compat with old `/api` habit from VM nginx).
- **`ApiPrefixStripMiddleware`** rewrites `/api/foo` → `/foo` (same behavior as VM nginx `location /api/`).
- **`GET /ready`** returns `projects`, `records`, and `users` counts (quick data sanity check).
- **`as_json_dict()`** in `backend/core/json_fields.py` for JSON columns that may be `dict` (SQLite) or `str` (Postgres migration).

---

## 4. Prerequisites on your machine

1. **Repo** cloned locally.
2. **`gcloud` CLI** installed and logged in:
   ```bash
   gcloud auth login
   gcloud auth application-default login   # if running DB scripts locally
   gcloud config set project taggd-491107
   ```
3. **IAM** (typical deployer needs): Cloud Build Editor, Cloud Run Admin, Storage Admin, Secret Manager Accessor, Service Account User (to deploy as runtime SA).
4. **Optional local `.env`** (never commit): copy from `.env.example` for local dev only. Production secrets live in **Secret Manager**.

---

## 5. Day-to-day workflow: edit locally → push to Cloud Run + GCS

You do **not** SSH to a VM for this stack. You change code in git, then run deploy scripts from your laptop (or CI later).

```text
┌─────────────────┐     git commit      ┌──────────────────┐
│  Local editor   │ ──────────────────► │  Git remote      │
│  + local test   │                     │  (optional)      │
└────────┬────────┘                     └──────────────────┘
         │
         │  ./deploy/gcp/06-deploy-api.sh     → Cloud Build + Cloud Run
         │  ./deploy/gcp/07-deploy-frontend.sh → npm build + GCS
         ▼
┌─────────────────────────────────────────────────────────┐
│  GCP: tgddata-api (Cloud Run) + taggd-tgddata-prod-web  │
└─────────────────────────────────────────────────────────┘
```

### Step A — Develop and test locally

**Backend** (Postgres via Docker, or SQLite for quick checks):

```bash
# From repo root
cp .env.example .env   # once; set JWT_SECRET, GEMINI_API_KEY, DATABASE_URL

docker compose up -d postgres
export DATABASE_URL='postgresql+psycopg://tgddata:YOUR_PASSWORD@127.0.0.1:5432/tgddata'
export PYTHONPATH=$PWD
alembic upgrade head
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend** (talks to local API via Vite proxy):

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000 — API proxied to :8000 as /api
```

Commit when ready:

```bash
git add …
git commit -m "Describe your change"
git push origin your-branch   # optional; deploy works from local tree
```

### Step B — Deploy backend only (API changes)

From **repo root**:

```bash
chmod +x deploy/gcp/*.sh

# Full rebuild + deploy (5–10 min: Cloud Build + Cloud Run rollout)
./deploy/gcp/06-deploy-api.sh
```

Faster redeploy if the image is already built:

```bash
SKIP_BUILD=1 ./deploy/gcp/06-deploy-api.sh
```

**What this does:**

1. Builds `Dockerfile.backend.cloudrun` via Cloud Build → Artifact Registry.
2. Deploys Cloud Run `tgddata-api` with VPC connector, Cloud SQL attachment, env from `deploy/gcp/.generated/cloudrun-api.env`, secrets from Secret Manager.
3. Runs **Alembic `upgrade head` on container start** (new revisions apply automatically on deploy).

**Verify:**

```bash
curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready
# {"status":"ready","database":"ok","projects":178,"records":10645,"users":6}
```

### Step C — Deploy frontend only (UI changes)

From **repo root**:

```bash
./deploy/gcp/07-deploy-frontend.sh
```

**What this does:**

1. Resolves API URL from `deploy/gcp/.generated/api-url.txt` or Cloud Run describe.
2. Builds with `VITE_API_BASE_URL=<Cloud Run URL>` (no `/api`), `VITE_STATIC_HOSTING=1`, `base=./`.
3. `gsutil -m rsync -r -d dist/` → `gs://taggd-tgddata-prod-web/`.

**Verify in browser:**

Open **https://storage.googleapis.com/taggd-tgddata-prod-web/index.html#/login** and hard-refresh (Cmd+Shift+R).

### Step D — Deploy both (typical release)

```bash
./deploy/gcp/06-deploy-api.sh
./deploy/gcp/07-deploy-frontend.sh
```

Or full bootstrap (rare; new environment only):

```bash
./deploy/gcp/deploy-all.sh
```

### Step E — Database schema or data changes

**Schema only** (Alembic): usually applied on API deploy (container entrypoint). To run manually from laptop:

```bash
# Needs Cloud SQL access; see deploy/gcp/README.md
./deploy/gcp/05-migrate-database-via-public-ip.sh   # or VM-based 05-migrate-database-on-vm.sh
```

With schema already applied, skip data copy:

```bash
SKIP_DATA_MIGRATION=1 ./deploy/gcp/05-migrate-database-via-public-ip.sh
```

---

## 6. Configuration overrides

Edit [`deploy/gcp/config.defaults.env`](../deploy/gcp/config.defaults.env) or export before deploy:

```bash
export GCP_PROJECT=taggd-491107
export GCP_REGION=asia-south1
export CORS_ALLOW_ORIGINS='https://taggd.aparatus.in,https://storage.googleapis.com'
```

After changing CORS or buckets, redeploy API (`06`) or re-run `03-setup-iam.sh` if IAM-only.

---

## 7. Differences vs VM deploy (`taggd.aparatus.in`)

| | VM (`scripts/deploy-gcp.sh`) | Cloud Run (`deploy/gcp/`) |
|--|------------------------------|---------------------------|
| Compute | GCE `tgddata-c1-prod-2` | Cloud Run |
| UI | Nginx on VM | GCS bucket |
| DB | SQLite file or Postgres on VM | Cloud SQL Postgres |
| API URL in UI | `/api` (relative) | Full Cloud Run HTTPS URL |
| Typical command | `source scripts/gcp-env-…; ./scripts/deploy-gcp.sh` | `./deploy/gcp/06` + `07` |

Both can coexist during migration; pick one UI URL to give users.

---

## 8. Troubleshooting

### Login shows **Network Error**

1. Open DevTools → Network. Login POST should go to  
   `https://tgddata-api-….run.app/auth/login` (or `/api/auth/login`), **not** `storage.googleapis.com`.
2. Use the bookmarked URL: `…/index.html#/login` (hash route).
3. Hard-refresh or incognito (old `index.html` / JS cache).
4. Wrong password should show **Invalid email or password**, not Network Error.

### White screen

- Check `index.html` script `src` is `./assets/….js` (not `/assets/…`).
- Re-run `./deploy/gcp/07-deploy-frontend.sh`.

### API 503 / `database` not ok on `/ready`

- VPC connector must be **READY**: `./deploy/gcp/04c-setup-vpc-connector.sh`
- Redeploy: `./deploy/gcp/06-deploy-api.sh`

### `gcloud auth` / permission errors

```bash
gcloud auth login
gcloud config set project taggd-491107
```

### Stale GCS `index.html` after deploy

`07-deploy-frontend.sh` uses `gsutil rsync -d` for a full sync. If needed:

```bash
gsutil -m rsync -r -d frontend/dist/ gs://taggd-tgddata-prod-web/
```

### “Unable to load dashboard KPIs” (after login)

The Executive Overview shows this when **both** `GET /stats/global` and `GET /stats/global/monitor` fail (axios rejection). Other pills (e.g. requisition count) may still load from `/stats/requisitions/kpis`.

1. **`curl …/ready`** — confirm `database: ok` and non-zero `projects` / `records`.
2. **DevTools → Network** — `/stats/global` and `/stats/global/monitor` should be **200**, not 404 or 500.
3. **404 on `/api/stats/global`** — stale frontend: hard-refresh or redeploy `07`; confirm bundle has no `/api` suffix:
   ```bash
   curl -sS https://storage.googleapis.com/taggd-tgddata-prod-web/index.html | grep -o 'assets/index-[^"]*\.js' | head -1
   # Then grep that JS for tgddata-api — should NOT end with /api
   ```
4. **500 on `/stats/global/monitor`** — check logs for `AttributeError: 'str' object has no attribute 'get'` on `revenue_results`; redeploy API (`06`) with `as_json_dict` fix.

```bash
gcloud run services logs read tgddata-api --project=taggd-491107 --region=asia-south1 --limit=80 \
  | grep -E 'stats/global|500|AttributeError'
```

---

## 9. Checklist before telling users “production is updated”

- [ ] `curl …/ready` → `database: ok` and expected `projects` / `records` counts
- [ ] Login at `…/index.html#/login` works
- [ ] Executive Overview: no red KPI banner; `/stats/global` and `/stats/global/monitor` return 200
- [ ] Core page you changed loads data
- [ ] Cloud Run logs show no repeated DB errors:  
  `gcloud run services logs read tgddata-api --region=asia-south1 --limit=50`

---

## 10. Future improvements (not done yet)

- Custom domain + **Cloud CDN** for SPA (instead of raw `storage.googleapis.com` URL).
- Cloud Run **domain mapping** for API (`api.taggd…`).
- CI/CD (GitHub Actions) calling `06` / `07` on merge to `main`.
- Cut over `taggd.aparatus.in` from VM to Cloud Run + CDN when ready.

---

*Last updated: May 2026 — Cloud Run `tgddata-api-00006-9mc` area: VPC connector, GCS hash-router frontend, `ApiPrefixStripMiddleware`, `/ready` row counts, `as_json_dict` for migrated `revenue_results`.*
