# GCP deployment (Cloud Run + Cloud SQL + GCS)

**Primary production path** for tgddata on Google Cloud. Overview and legacy VM notes: [`DEPLOYMENT_DOC.md`](../DEPLOYMENT_DOC.md).

## Architecture

| Component | Resource |
|-----------|----------|
| API | Cloud Run `tgddata-api` |
| Database | Cloud SQL `tgddata-pg-prod` |
| Uploads | GCS `taggd-tgddata-prod-uploads` |
| Static UI | GCS `taggd-tgddata-prod-web` |
| Runtime identity | SA `tgddata-runtime@taggd-491107.iam.gserviceaccount.com` |
| Images | Artifact Registry `asia-south1-docker.pkg.dev/taggd-491107/tgddata/` |

## One-shot deploy

From repo root (requires `gcloud` auth + Secret Manager access):

```bash
chmod +x deploy/gcp/*.sh
./deploy/gcp/deploy-all.sh
```

## Step by step

| Script | Purpose |
|--------|---------|
| `01-enable-apis.sh` | Run, AR, Cloud Build, SQL, Secrets, Storage |
| `02-setup-storage.sh` | Upload + web buckets |
| `02c-sync-database-url-secret.sh` | Writes `TGDDATA_DATABASE_URL` secret (Cloud SQL socket URL) |
| `03-setup-iam.sh` | Runtime SA + IAM |
| `03b-bind-runtime-secrets.sh` | SA → Secret Manager accessors (JWT, GEMINI, DB password) |
| `04-setup-artifact-registry.sh` | Docker repo |
| `04c-setup-vpc-connector.sh` | Serverless VPC connector (Cloud Run → Cloud SQL **private IP**) |
| `05-migrate-database.sh` | Proxy + Alembic + SQLite data (low-level; needs reachable IP) |
| `05-migrate-database-on-vm.sh` | **Recommended:** migrate via `tgddata-c1-prod-2` (VPC private IP, no public IP toggle) |
| `05-migrate-database-via-public-ip.sh` | Alternative: brief public IP on Cloud SQL → `05` from laptop |
| `06-deploy-api.sh` | Build & deploy Cloud Run API |
| `07-deploy-frontend.sh` | Build SPA → GCS |

## Configuration

Edit `config.defaults.env` or export overrides before running.

Secrets (Secret Manager): `tgddata-pg-prod-db-password`, `JWT_SECRET`, `GEMINI_API_KEY`.

Generated files (gitignored): `deploy/gcp/.generated/`

## Current endpoints (taggd-491107)

| Component | URL |
|-----------|-----|
| API | https://tgddata-api-lnucyjw2sa-el.a.run.app |
| SPA (production) | https://storage.googleapis.com/taggd-tgddata-prod-web/app.html#/login |

`07-deploy-frontend.sh` builds with `GCS_WEB_BASE=./` (relative assets), `VITE_STATIC_HOSTING=1`, and `VITE_API_BASE_URL=<Cloud Run URL>` **without** `/api`. It strips a mistaken trailing `/api` from the API URL, uploads hashed assets via `gsutil rsync`, and publishes `index.html` + **`app.html`** (canonical entry; `no-cache`).

Generated copies: `deploy/gcp/.generated/api-url.txt`, `web-url.txt`

## SQLite data migration (via GCE VM — recommended)

`tgddata-pg-prod` is **private-IP-only**. The reliable path is to run the migrator on **`tgddata-c1-prod-2`** (same VPC): Auth Proxy with `--private-ip`, API Docker image for Alembic + `migrate_sqlite_to_postgres`.

```bash
# IAP SSH + VM SA (cloudsql.client, secret accessor, AR reader)
./deploy/gcp/05-migrate-database-on-vm.sh
```

Uploads canonical SQLite to the VM, runs migration, removes the temp file on the VM.

## SQLite data migration (temporary public IP — alternative)

From a laptop only, you can briefly enable public IPv4:

```bash
./deploy/gcp/05-migrate-database-via-public-ip.sh
```

**What it does**

1. `gcloud sql instances patch --assign-ip` on `tgddata-pg-prod` (skipped if public IP already on).
2. Runs `05-migrate-database.sh` with Cloud SQL Auth Proxy over the **public** path (no `0.0.0.0/0` authorized networks needed — proxy uses IAM).
3. On exit, `patch --no-assign-ip` **only if** step 1 ran in this session (leaves an existing public IP unchanged).

**Notes**

- **Cloud Run is unaffected** — it still uses private IP + `tgddata-run-connector`.
- Canonical SQLite source: `SQLITE_SOURCE_PATH` or `/Users/arjun/Software/tagged_data_sql/revenue_generator.db`.
- Schema-only: `SKIP_DATA_MIGRATION=1 ./deploy/gcp/05-migrate-database-via-public-ip.sh`.
- If cleanup fails after a crash, manually: `gcloud sql instances patch tgddata-pg-prod --no-assign-ip --project=taggd-491107`.
- Cloud SQL user `tgddata_app` cannot set `session_replication_role`; the migrator skips that and relies on FK-safe table order.
- If the proxy drops with `tls: bad record MAC`, wait a few minutes after public IP is enabled and re-run; the wrapper sleeps 90s after `--assign-ip`.

## Troubleshooting

**Cloud Build upload fails (DNS / connection)**  
Run from a network that can reach `storage.googleapis.com`. Retry: `./deploy/gcp/06-deploy-api.sh`.

**`05-migrate-database.sh` returns 403 from Auth Proxy**  
Your user needs `roles/cloudsql.client` (or `roles/cloudsql.admin`) on project `taggd-491107`, and ADC must match that account:

```bash
# Project admin runs once (replace USER_EMAIL):
gcloud projects add-iam-policy-binding taggd-491107 \
  --member="user:USER_EMAIL" \
  --role=roles/cloudsql.client

gcloud auth application-default login
./deploy/gcp/05-migrate-database.sh
```

**Private IP only / proxy says “does not have IP of type PUBLIC”**  
Use `./deploy/gcp/05-migrate-database-via-public-ip.sh` (see above).

You can skip local migration: `SKIP_DB_MIGRATION=1 ./deploy/gcp/deploy-all.sh` — the API container runs `alembic upgrade head` on boot (schema only; app login needs data).

**Large Cloud Build uploads**  
`.gcloudignore` excludes `frontend/`, `docs/`, Excel trees, and `*.xlsx` at repo root.

**Cloud Run: Alembic / DB “connection refused” or timeout to Cloud SQL private IP**  
Cloud SQL instances with **private IP only** are not reachable from Cloud Run without egress into your VPC. Run `./deploy/gcp/04c-setup-vpc-connector.sh` and wait until the connector is **READY**, ensure `03-setup-iam.sh` granted `roles/vpcaccess.user` on the runtime SA, then redeploy with `06-deploy-api.sh` (it sets `--vpc-connector` and `--vpc-egress=private-ranges-only`).

**Executive Overview: “Unable to load dashboard KPIs”**  
Usually **not** missing DB data. Check `curl -s https://tgddata-api-….run.app/ready` for `projects` / `records` counts. Then DevTools: `/stats/global` and `/stats/global/monitor` must return **200**. Common causes: (1) frontend built with `VITE_API_BASE_URL=…/api` → 404 — redeploy `07`; (2) `revenue_results` JSON strings after migration → 500 on monitor — ensure API includes `backend/core/json_fields.py` and redeploy `06`. See [`../../docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md`](../../docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md) § Troubleshooting.

## Docs

- **[`../../docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md`](../../docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md)** — full record + local → production workflow
- [`../../docs/GCP_CLOUD_RUN_ROLLOUT_UPDATES.md`](../../docs/GCP_CLOUD_RUN_ROLLOUT_UPDATES.md) — short changelog
- [`../../docs/CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md`](../../docs/CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md)
- [`../../docs/GCP_CLOUD_SQL_DEVELOPMENT.md`](../../docs/GCP_CLOUD_SQL_DEVELOPMENT.md)
