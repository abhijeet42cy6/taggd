# Cloud Run, load balancing, and multi-cloud deployment

Enterprise-oriented deployment guide for tgddata: **Google Cloud Run** as the primary managed compute target, with the **same container** portable to **AWS** (App Runner, ECS Fargate, or EKS). This document ties together all migration work: **PostgreSQL**, **Cloud SQL**, **object storage**, and application changes.

**Related docs:**

- [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md) — Alembic, local Postgres, data migration  
- [`GCP_CLOUD_SQL_DEVELOPMENT.md`](GCP_CLOUD_SQL_DEVELOPMENT.md) — `tgddata-pg-prod` instance, proxy, compose  

---

## 1. Why Cloud Run (and not only a VM)

| Concern | VM + Docker Compose | Cloud Run (+ CDN for UI) |
|---------|---------------------|---------------------------|
| **Load balancing** | Manual (MIG + HTTPS LB) | Built-in, multi-instance |
| **Scaling** | Manual | Request-based autoscale |
| **Security surface** | OS + SSH (IAP) | No SSH; IAM; revisions |
| **Ops** | Patch VM, compose | Deploy revision, rollback |
| **AWS portability** | Same images on EC2/ECS | Same **container image** on App Runner/ECS |

Cloud Run fits **stateless API** tiers. This app required **code changes** first (see §3) because it previously stored uploads on local disk and assumed nginx + backend on one Docker network.

---

## 2. Target architecture (GCP)

```text
                    ┌─────────────────────────────────────┐
                    │  HTTPS Load Balancer (optional)      │
                    │  + Cloud Armor (WAF / rate limits)   │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        │
   Cloud CDN + GCS bucket    Cloud Run: tgddata-api         │
   (React static build)     min-instances ≥ 1              │
   VITE_API_BASE_URL=        /health /ready                 │
   https://api.../run.app    PORT=8080                     │
   (no /api suffix)          ApiPrefixStripMiddleware      │
          │                        │                        │
          │                        ├── Cloud SQL connector │
          │                        │   (tgddata-pg-prod)   │
          │                        └── GCS bucket           │
          │                            (STORAGE_BACKEND)   │
          └────────────────────────┴────────────────────────┘
```

**Frontend:** Build with `VITE_API_BASE_URL=https://<api-host>` (**no** `/api` suffix on Cloud Run; VM nginx still uses relative `/api`). Host `dist/` on **Cloud Storage + CDN** (or Firebase Hosting). Do not serve the SPA from the API container in production.

**Backend:** Single container from `Dockerfile.backend` or `Dockerfile.backend.cloudrun`; listens on **`PORT`** (8080 on Cloud Run).

---

## 3. Application changes implemented (this development)

### 3.1 PostgreSQL (prior work)

- `DATABASE_URL` → Cloud SQL Postgres 16 (`tgddata-pg-prod`)
- Alembic migrations on container start
- SQLite only for legacy local fallback (blocked when `APP_ENV=production`)

### 3.2 Object storage (portable: GCS / S3 / local)

**Module:** `backend/core/blob_storage.py`

| `STORAGE_BACKEND` | Use |
|-------------------|-----|
| `local` | Dev / VM disk (`STORAGE_LOCAL_ROOT` or `/tmp/tgddata-storage` on Cloud Run) |
| `gcs` | GCP production (`STORAGE_BUCKET`) |
| `s3` | AWS production (`STORAGE_BUCKET`, `AWS_REGION`) |

**Namespaces:** `user_avatars`, `msa_documents`, `billing_documents`, `transition_documents`, `candidate_cvs`

**Serving:** `backend/core/http_file_response.py` — `StreamingResponse` for cloud blobs, `FileResponse` for local.

**Updated modules:** `avatar_storage`, `msa_storage`, `billing_attachment_storage`, `transition_storage`, CV routes in `candidates.py`, download routes in contracts/billing/transitions/auth.

### 3.3 Health & readiness

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | Public | Liveness |
| `GET /ready` | Public | DB `SELECT 1` + row counts (`projects`, `records`, `users`) |

Configure Cloud Run:

- Liveness: `/health`
- Startup/readiness: `/ready`

### 3.4 Cloud Run runtime

| Change | File |
|--------|------|
| `PORT` env for Uvicorn | `scripts/docker-entrypoint-backend.sh` |
| `APP_ENV=production` blocks SQLite | `backend/main.py` |
| CORS from `CORS_ALLOW_ORIGINS` | `backend/main.py` |
| `/api` prefix strip (VM nginx parity) | `backend/core/api_prefix_middleware.py` |
| JSON column normalization (Postgres migration) | `backend/core/json_fields.py` — `as_json_dict()` |
| API base URL at build time | `frontend/src/lib/api.ts` — `VITE_API_BASE_URL` |

### 3.5 Still recommended (P1 — not all implemented)

| Item | Why |
|------|-----|
| **Async ingest** (Cloud Tasks + worker) | Long Excel/AI uploads exceed ideal request time |
| **Agent session store** (Redis) | In-memory sessions break with multiple instances |
| **GCS bucket + IAM** for prod | Done: `taggd-tgddata-prod-uploads` / `taggd-tgddata-prod-web` via `deploy/gcp/02-setup-storage.sh` |
| **Disable public OpenAPI** in prod | `APP_ENV=production` → no `/docs` |
| **HttpOnly cookies / SSO** | Enterprise auth |

---

## 4. Environment variables (production)

| Variable | Required | Example |
|----------|----------|---------|
| `APP_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | `postgresql+psycopg://tgddata_app:PASS@/tgddata?host=/cloudsql/taggd-491107:asia-south1:tgddata-pg-prod` |
| `JWT_SECRET` | Yes | Secret Manager |
| `GEMINI_API_KEY` | Yes | Secret Manager |
| `PORT` | Cloud Run sets | `8080` |
| `STORAGE_BACKEND` | Yes | `gcs` (GCP) / `s3` (AWS) |
| `STORAGE_BUCKET` | Yes (cloud) | `taggd-tgddata-prod` |
| `STORAGE_PREFIX` | Optional | `tgddata` |
| `CORS_ALLOW_ORIGINS` | Yes | `https://app.yourdomain.com` |
| `CORS_ALLOW_ORIGINS` | — | Comma-separated; no `*` with credentials |

**Frontend build:**

```bash
# Cloud Run: no /api suffix. GCS: base=./ and hash routes. See docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md
VITE_API_BASE_URL=https://tgddata-api-xxxxx.asia-south1.run.app \
VITE_STATIC_HOSTING=1 \
npm run build -- --base=./
# Or: ./deploy/gcp/07-deploy-frontend.sh
```

---

## 5. Deploy backend to Cloud Run (GCP)

**Recommended:** scripted deploy from repo root:

```bash
chmod +x deploy/gcp/*.sh
./deploy/gcp/deploy-all.sh          # full bootstrap
# or step-by-step — see deploy/gcp/README.md
SKIP_BUILD=1 ./deploy/gcp/06-deploy-api.sh   # redeploy image only
./deploy/gcp/07-deploy-frontend.sh           # SPA → GCS
```

**Private-IP Cloud SQL:** Cloud Run requires a **Serverless VPC Access connector** (`04c-setup-vpc-connector.sh`) and deploy flags `--vpc-connector` + `--vpc-egress=private-ranges-only` (set in `06-deploy-api.sh`).

**Live (May 2026):**

| Service | URL |
|---------|-----|
| API | `https://tgddata-api-lnucyjw2sa-el.a.run.app` |
| SPA (GCS) | `https://storage.googleapis.com/taggd-tgddata-prod-web/index.html` |

### 5.1 Prerequisites

1. Cloud SQL `tgddata-pg-prod` running (see `GCP_CLOUD_SQL_DEVELOPMENT.md`).
2. GCS buckets `taggd-tgddata-prod-uploads` / `taggd-tgddata-prod-web`; runtime SA: `roles/storage.objectAdmin` on uploads bucket.
3. Cloud Run SA: `roles/cloudsql.client`, `roles/vpcaccess.user`, Secret Manager accessor.
4. Fetch `DATABASE_URL`:

```bash
source scripts/gcp-cloudsql-tgddata-pg-prod.sh
./scripts/fetch-cloudsql-database-url.sh
```

Use socket form for Cloud Run native connector:

```text
postgresql+psycopg://tgddata_app:PASSWORD@/tgddata?host=/cloudsql/taggd-491107:asia-south1:tgddata-pg-prod
```

### 5.2 Build and deploy

```bash
export GCP_PROJECT=taggd-491107
export JWT_SECRET=...
export GEMINI_API_KEY=...
export DATABASE_URL='postgresql+psycopg://...'
export STORAGE_BACKEND=gcs
export STORAGE_BUCKET=your-bucket-name
export CORS_ALLOW_ORIGINS=https://taggd.aparatus.in

chmod +x scripts/deploy-cloud-run-api.sh
./scripts/deploy-cloud-run-api.sh
```

Or manually:

```bash
gcloud builds submit --tag gcr.io/taggd-491107/tgddata-api -f Dockerfile.backend .
gcloud run deploy tgddata-api \
  --region=asia-south1 \
  --image gcr.io/taggd-491107/tgddata-api \
  --add-cloudsql-instances=taggd-491107:asia-south1:tgddata-pg-prod \
  --set-env-vars=APP_ENV=production,PORT=8080,... \
  --min-instances=1 \
  --cpu=2 --memory=2Gi \
  --timeout=900 \
  --allow-unauthenticated
```

Map custom domain via Cloud Run domain mapping + Cloud DNS.

### 5.3 Load balancing

- **Default:** Cloud Run provides a Google-managed URL and LB.
- **Enterprise:** External HTTPS LB → serverless NEG → Cloud Run; attach **Cloud Armor**.

---

## 6. Deploy frontend (GCP)

```bash
./deploy/gcp/07-deploy-frontend.sh
# Uses VITE_API_BASE_URL from deploy/gcp/.generated/api-url.txt or Cloud Run describe
```

For production branding, point **Cloud CDN + custom domain** at `gs://taggd-tgddata-prod-web` instead of the raw `storage.googleapis.com` URL. Ensure that origin is listed in `CORS_ALLOW_ORIGINS` on the API.

---

## 7. AWS deployment (same container)

| GCP | AWS equivalent |
|-----|----------------|
| Cloud Run | **App Runner** or **ECS Fargate** |
| Cloud SQL | **RDS PostgreSQL 16** |
| GCS | **S3** (`STORAGE_BACKEND=s3`) |
| Secret Manager | **Secrets Manager** |
| Cloud SQL connector | RDS in VPC + `DATABASE_URL` with `sslmode=require` |

```bash
export APP_ENV=production
export DATABASE_URL='postgresql+psycopg://user:pass@host:5432/tgddata?sslmode=require'
export STORAGE_BACKEND=s3
export STORAGE_BUCKET=your-bucket
export AWS_REGION=ap-south-1
export PORT=8080

docker build -f Dockerfile.backend -t tgddata-api .
docker run -p 8080:8080 -e PORT=8080 -e DATABASE_URL=... -e APP_ENV=production tgddata-api
```

See `scripts/deploy-aws-apprunner-api.sh` for pointers.

**Load balancing on AWS:** ALB → ECS target group or App Runner auto-LB.

---

## 8. Steps performed (chronological summary)

| Phase | Work |
|-------|------|
| **1. Postgres migration** | `engine.py`, Alembic, `docker-compose` Postgres, `migrate_sqlite_to_postgres.py`, docs |
| **2. Cloud SQL** | Instance `tgddata-pg-prod`, VPC peering, Secret Manager, IAM, compose prod + proxy |
| **3. Cloud Run readiness** | `blob_storage` (GCS/S3/local), health/ready, `PORT`, `VITE_API_BASE_URL`, deploy scripts |
| **4. This doc** | Enterprise target architecture GCP + AWS |
| **5. `deploy/gcp/`** | Scripted Cloud Run + GCS + VPC connector + Secret Manager DB URL |
| **6. Cloud Run live** | `tgddata-api` revision with VPC connector; `/health` + `/ready` OK |
| **7. Frontend on GCS** | `taggd-tgddata-prod-web` via `07-deploy-frontend.sh` |

**Still open:** SQLite → Postgres **data** load (`./deploy/gcp/05-migrate-database-via-public-ip.sh` — brief public IP on Cloud SQL), async ingest workers, Cloud CDN + custom domain cutover from VM (`taggd.aparatus.in`).

---

## 9. VM vs Cloud Run — decision

| Use VM (compose prod) when | Use Cloud Run when |
|----------------------------|-------------------|
| Quick cutover, team knows SSH | Want managed LB + autoscale |
| Heavy sync ingest stays in API short-term | GCS + min instances configured |
| Client mandates single server | Security review prefers no VM SSH |

**Recommendation:** **Cloud Run for API** + **CDN for SPA** + **Cloud SQL** + **GCS**; keep `docker-compose.prod.yml` for DR or client-specific VM installs.

---

## 10. Verification checklist

- [x] `curl https://<api>/health` → `{"status":"ok"}`
- [x] `curl https://<api>/ready` → `database: ok`
- [ ] Login + dashboard load (needs app data; run `05-migrate-database-via-public-ip.sh` or ingest)
- [ ] Avatar upload + download
- [ ] Contract MSA upload + download
- [ ] One Excel ingest (watch timeout; note P1 async)
- [ ] Cloud Run logs: no DB connection errors
- [ ] GCS bucket shows objects under `tgddata/...`

---

## 11. Troubleshooting

| Issue | Fix |
|-------|-----|
| Container exits on start | `APP_ENV=production` + SQLite URL |
| 503 on `/ready` | Cloud SQL connector / `DATABASE_URL` host; for **private IP** add VPC connector (`04c-setup-vpc-connector.sh`) |
| `05-migrate-database.sh` 403 | Grant `roles/cloudsql.client`; use `gcloud auth login` (proxy uses user token) |
| Proxy: no PUBLIC IP | Instance is private-only | `./deploy/gcp/05-migrate-database-via-public-ip.sh` (temporary `--assign-ip`) |
| Upload 500 `STORAGE_BUCKET` | Set bucket + IAM |
| CORS errors | Set `CORS_ALLOW_ORIGINS` to exact frontend origin |
| Cold starts | `--min-instances=1` |
| 504 on ingest | Increase `--timeout`; plan async worker |

---

*Portable enterprise deployment: one backend image, PostgreSQL, object storage abstraction, health probes, and split static frontend — runnable on Cloud Run today and AWS App Runner/ECS with env-only differences.*
