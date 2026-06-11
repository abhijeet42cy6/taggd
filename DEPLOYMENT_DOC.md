# Revenue Generator: Deployment & Infrastructure

**Last updated:** May 2026  
**GCP project:** `taggd-491107`  
**Production (primary):** **Cloud Run API** + **GCS static UI** + **Cloud SQL PostgreSQL** (`tgddata-pg-prod`).  
**Legacy / alternate:** **GCE VM** `tgddata-c1-prod-2` with **host Nginx + Certbot** at **`https://taggd.aparatus.in/`** (Docker Compose; may still use SQLite on disk until migrated to `docker-compose.prod.yml`).

**Canonical deploy guides:**

| Path | Document |
|------|----------|
| **Cloud Run + GCS (usual code release)** | [`docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md`](docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md), [`deploy/gcp/README.md`](deploy/gcp/README.md) |
| **Postgres / Alembic / migration** | [`docs/POSTGRES_MIGRATION.md`](docs/POSTGRES_MIGRATION.md) |
| **Rollout changelog** | [`docs/GCP_CLOUD_RUN_ROLLOUT_UPDATES.md`](docs/GCP_CLOUD_RUN_ROLLOUT_UPDATES.md) |
| **Architecture (multi-cloud)** | [`docs/CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md`](docs/CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md) |
| **Agent skill** | [`.cursor/skills/deploy/SKILL.md`](.cursor/skills/deploy/SKILL.md) |

---

## 1. What runs in production (primary — Cloud Run)

| Layer | Technology | Notes |
|-------|------------|--------|
| **API** | Cloud Run `tgddata-api` | Image: `Dockerfile.backend.cloudrun`; Alembic on container start; `APP_ENV=production` |
| **Database** | Cloud SQL `tgddata-pg-prod` | PostgreSQL 16, **private IP**; Unix socket on Cloud Run via `/cloudsql/...` |
| **Uploads** | GCS `taggd-tgddata-prod-uploads` | `STORAGE_BACKEND=gcs` |
| **Web UI** | GCS `taggd-tgddata-prod-web` | Vite build with `VITE_API_BASE_URL` = Cloud Run URL **without** `/api`; HashRouter on GCS path URLs |
| **VPC** | Serverless connector `tgddata-run-connector` | Cloud Run → private Cloud SQL |
| **Secrets** | Secret Manager | `TGDDATA_DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `tgddata-pg-prod-db-password` |

**Live URLs (discover after deploy):**

```bash
gcloud run services describe tgddata-api --project=taggd-491107 --region=asia-south1 --format='value(status.url)'
# SPA (production — use app.html, not index.html):
# https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login
```

Generated copies: `deploy/gcp/.generated/api-url.txt`, `web-url.txt`.

**Verify data (no login):**

```bash
curl -s "$(cat deploy/gcp/.generated/api-url.txt 2>/dev/null || echo 'https://tgddata-api-lnucyjw2sa-el.a.run.app')/ready"
```

Config defaults: [`deploy/gcp/config.defaults.env`](deploy/gcp/config.defaults.env).

---

## 2. Standard deploy — push code to Cloud Run + GCS

From **repository root** after local testing:

```bash
gcloud auth login
gcloud config set project taggd-491107
chmod +x deploy/gcp/*.sh

./deploy/gcp/06-deploy-api.sh      # API (~5–10 min; SKIP_BUILD=1 to reuse image)
./deploy/gcp/07-deploy-frontend.sh # SPA → GCS
```

**First-time infra:** `./deploy/gcp/deploy-all.sh` (APIs, buckets, IAM, VPC connector, optional SQLite → Cloud SQL migration).

**Data / schema on Cloud SQL:**

| Goal | Command |
|------|---------|
| Schema on API deploy | Usually automatic (`alembic upgrade head` in container entrypoint) |
| SQLite → Cloud SQL (laptop) | `./deploy/gcp/05-migrate-database-via-public-ip.sh` |
| SQLite → Cloud SQL (via VM VPC) | `./deploy/gcp/05-migrate-database-on-vm.sh` |
| Canonical SQLite source | `SQLITE_SOURCE_PATH` or `/Users/arjun/Software/tagged_data_sql/revenue_generator.db` |

**Deploying code does not copy local Postgres/SQLite data to cloud** unless you run a migration script intentionally.

**Critical frontend rule:** `VITE_API_BASE_URL` must be the Cloud Run origin **without** `/api` (routes are `/auth/login`, `/stats/global`, etc.). `07-deploy-frontend.sh` strips a mistaken trailing `/api`.

**After deploy:** hard-refresh the SPA (Cmd+Shift+R); log in with a user that exists in **Cloud SQL**, not only on a local DB.

---

## 3. Local development

**Docker Compose (recommended — matches Postgres prod):**

```bash
cp .env.example .env   # set GEMINI_API_KEY, JWT_SECRET, etc.
docker compose up -d --build
```

- **`postgres:16-alpine`** on `127.0.0.1:5432` (see `docker-compose.yml`).
- Backend `DATABASE_URL` → `postgresql+psycopg://tgddata:tgddata_dev@postgres:5432/tgddata`.
- Frontend container: **`http://127.0.0.1:8080/`** (loopback publish).
- Migrations: `alembic upgrade head` (also runs on Cloud Run container start).

**Without Docker:**

1. Postgres running locally; set `DATABASE_URL` in `.env` (see `.env.example`).
2. `pip install -r requirements.txt` → `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
3. `cd frontend && npm ci && npm run dev` — Vite proxies `/api` → `localhost:8000`.

**SQLite (legacy emergency only):** `DATABASE_URL=sqlite:///./revenue_generator.db` still works in code when `APP_ENV` is not `production`. **Blocked** on Cloud Run when `APP_ENV=production`.

---

## 4. Legacy VM — `taggd.aparatus.in` (`tgddata-c1-prod-2`)

Use only when updating the **VM stack**, not Cloud Run.

| Item | Value |
|------|--------|
| **VM** | `tgddata-c1-prod-2`, zone `asia-south1-a` |
| **App dir** | `~/tgddata_C1` |
| **Public URL** | `https://taggd.aparatus.in/` |
| **TLS** | Host Nginx + Let’s Encrypt (`scripts/setup-host-nginx-certbot-taggd.sh`) |
| **Compose publish** | Frontend `127.0.0.1:8080:80`; host Nginx proxies **80/443** → **8080** |

```bash
source scripts/gcp-env-tgddata-c1-prod-2.sh   # GCP_INSTANCE, TGDDATA_HOST_TLS_SETUP=1
./scripts/deploy-gcp.sh
```

**What `deploy-gcp.sh` ships:** `docker-compose.yml` (local **Postgres** service), **not** `docker-compose.prod.yml`. If the VM still runs **SQLite** under `/app/db_data/`, do **not** blindly deploy without a migration plan — use [`docker-compose.prod.yml`](docker-compose.prod.yml) + Cloud SQL proxy for VM→Cloud SQL, or keep a VM-specific compose override. See [`docs/POSTGRES_MIGRATION.md`](docs/POSTGRES_MIGRATION.md).

**VM SQLite data promote (legacy):** `./scripts/promote-db-to-gcp.sh` — replaces DB inside `tgddata_c1-backend-1` at `/app/db_data/revenue_generator.db` (SQLite path only).

**VM verify:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
curl -sI https://taggd.aparatus.in/ | head -5
docker ps
```

**Custom domain on Cloud Run/GCS (future):** `deploy/gcp/README.md` — map `taggd.aparatus.in` to Cloud Run + CDN; set `CORS_ALLOW_ORIGINS` in `config.defaults.env`.

---

## 5. Repository deploy artifacts

| Artifact | Used by |
|----------|---------|
| `Dockerfile.backend.cloudrun`, `deploy/gcp/cloudbuild-api.yaml` | Cloud Run |
| `Dockerfile.backend`, `Dockerfile.frontend` | VM / local compose |
| `docker-compose.yml` | Local dev + **VM tarball default** |
| `docker-compose.prod.yml` | VM + Cloud SQL Auth Proxy (not in deploy tarball) |
| `nginx.conf` | In-container SPA + `/api/` → backend (VM) |
| `scripts/deploy-gcp.sh` | VM code sync |
| `alembic/` | Schema revisions (all Postgres paths) |

Tarball **excludes:** `.git`, `node_modules`, `revenue_generator.db`, `deploy/gcp/` (VM script does not upload Cloud Run pipeline).

---

## 6. Prerequisites

1. **gcloud** authenticated (`gcloud auth login`; `gcloud auth application-default login` for migration scripts from laptop).
2. **Project:** `taggd-491107`.
3. **Cloud Run deployer IAM (typical):** Cloud Build Editor, Cloud Run Admin, Storage Admin, Secret Manager Secret Accessor, Service Account User on `tgddata-runtime@taggd-491107.iam.gserviceaccount.com`.
4. **VM access:** IAP tunnel on `gcloud compute scp` / `ssh` when required.
5. **`.env`:** local dev only — **never commit**. Cloud Run uses Secret Manager, not uploaded `.env`.
6. **bcrypt:** pinned `<4.1` in `requirements.txt` for passlib compatibility.

---

## 7. Authentication & first admin

- Empty `users` table + `AUTH_BOOTSTRAP_EMAIL` / `AUTH_BOOTSTRAP_PASSWORD` → `bootstrap_default_admin()` on startup (`backend/auth/bootstrap.py`).
- **`JWT_SECRET`** must stay stable across deploys or sessions invalidate.
- Cloud SQL and VM may have **different user rows** — create/bootstrap per environment.

---

## 8. Troubleshooting

### Cloud Run + GCS

| Symptom | Action |
|--------|--------|
| `/ready` database not ok | Check VPC connector; redeploy `06-deploy-api.sh` |
| Login network error | CORS must include `https://storage.googleapis.com`; use `…/app.html#/login` |
| KPI 404 on `/api/stats/…` | Redeploy `07`; hard-refresh; API has no global `/api` prefix |
| KPI 500 on monitor | Postgres JSON strings — `backend/core/json_fields.as_json_dict()`; redeploy API |
| Cloud Build upload fails | Retry from stable network |

### VM (`taggd.aparatus.in`)

| Symptom | Action |
|--------|--------|
| `Bind for 0.0.0.0:80` | `docker rm -f deploy_frontend_1 deploy_backend_1` or re-run `deploy-gcp.sh` |
| HTTPS broken | `cd ~/tgddata_C1 && sudo bash scripts/setup-host-nginx-certbot-taggd.sh` |
| SSH/SCP fails | `--tunnel-through-iap` |
| ngrok missing after deploy | Re-run two-file compose with `docker-compose.ngrok.yml` |

---

## 9. Optional tunnels (demo only)

Not a substitute for Cloud Run or `taggd.aparatus.in`. See historical notes: **ngrok** (`docker-compose.ngrok.yml`, `NGROK_AUTHTOKEN`), **Cloudflare** quick tunnel containers on the VM.

---

## 10. Security notes

- Secrets in Secret Manager (cloud) or VM `.env` (legacy) — not in git or Dockerfiles.
- Prefer IAP for VM SSH/SCP.
- Rotate tokens if exposed in chat or tickets.

---

*Earlier VM-only narrative (HTTPS LB as default edge, SQLite compose) is superseded by §1–§2 unless you explicitly operate the legacy VM path in §4.*
