# PostgreSQL migration guide

This document describes the **SQLite → PostgreSQL** migration for tgddata: why it was done, how the codebase is structured, and how to run local dev, data migration, and production on **Google Cloud SQL** or **AWS RDS**.

**Last updated:** May 2026  
**Stack:** PostgreSQL **16**, **psycopg 3** (`psycopg[binary]`), **SQLAlchemy 2.x**, **Alembic 1.x**, **FastAPI** backend, **Docker Compose** for local and VM deploys.

**Deploy index:** [`DEPLOYMENT_DOC.md`](../DEPLOYMENT_DOC.md) (Cloud Run primary; VM legacy).

---

## 1. Goals

| Goal | Approach |
|------|----------|
| Support ~700-person enterprise daily ops | Managed PostgreSQL (not file-based SQLite) |
| Work on **Google Cloud SQL** and **AWS RDS** | Single `DATABASE_URL`; no cloud-specific SQL in app code |
| **Private DB + proxy** in production | Cloud SQL Auth Proxy / RDS in VPC; app connects via URL + TLS |
| **Local dev uses Postgres** | `docker-compose.yml` includes `postgres:16-alpine` |
| **Data from canonical SQLite** | One-time copy from `/Users/arjun/Software/tagged_data_sql/revenue_generator.db` |
| **New VM deploy** (not legacy VM) | `docker-compose.prod.yml` — app containers only, external DB |
| **Versioned schema** | Alembic migrations; backend runs `alembic upgrade head` on container start |

SQLite remains supported only as a **legacy fallback** via `DATABASE_URL=sqlite:///...` for emergencies. New environments should use PostgreSQL only.

---

## 2. Architecture (before vs after)

### Before

```
Browser → Nginx → frontend container
                 backend container → SQLite file (volume sqlite_data)
```

- Schema evolved via `init_db()` + many SQLite-only `PRAGMA table_info` / `ALTER TABLE` helpers.
- Single-writer file DB; poor fit for HA, backups, and multi-instance API.

### After

```
Browser → Nginx → frontend container
                 backend container → PostgreSQL
                                      ↑
                    ┌─────────────────┴─────────────────┐
                    │                                   │
            docker-compose (local)              Cloud SQL / RDS (prod)
            postgres:16 service                 private network + proxy
```

- **Schema:** Alembic revision `20260519_0001` creates all tables from SQLAlchemy models (`Base.metadata.create_all` in the initial revision).
- **SQLite-only patches:** Still run in `init_db()` when `DATABASE_URL` is SQLite; **skipped** on PostgreSQL.
- **Connection:** `backend/db/engine.py` builds the engine from `DATABASE_URL` with dialect-appropriate options.

---

## 3. Key code and config files

| Path | Purpose |
|------|---------|
| `backend/db/engine.py` | `create_app_engine()`, `get_database_url()`, `is_sqlite_url()`, `is_postgres_url()` |
| `backend/db/database.py` | Models, `SessionLocal`, `init_db()` (dialect-aware) |
| `alembic.ini` | Alembic project config (URL read from env in `alembic/env.py`) |
| `alembic/env.py` | Loads `DATABASE_URL`, targets `Base.metadata` |
| `alembic/versions/20260519_0001_initial_schema.py` | Initial schema revision |
| `requirements.txt` | `psycopg[binary]`, `alembic` added |
| `docker-compose.yml` | Local: `postgres` + `backend` + `frontend` |
| `docker-compose.prod.yml` | Prod/new VM: `backend` + `frontend` only; `DATABASE_URL` from `.env` |
| `Dockerfile.backend` | Copies Alembic; `ENTRYPOINT` runs migrations then Uvicorn |
| `scripts/docker-entrypoint-backend.sh` | `alembic upgrade head` → `uvicorn` |
| `scripts/db-migrate.sh` | Manual Alembic from host (loads `.env`) |
| `backend/scripts/migrate_sqlite_to_postgres.py` | One-time SQLite → Postgres data copy |
| `.env.example` | Postgres, Cloud SQL, RDS URL examples |

---

## 4. Environment variables

### Required for PostgreSQL

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLAlchemy URL. **Recommended:** `postgresql+psycopg://USER:PASS@HOST:5432/DBNAME` |
| `JWT_SECRET` | Unchanged |
| `GEMINI_API_KEY` | Unchanged |

### Local Docker Compose (bundled Postgres)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `tgddata` | DB user |
| `POSTGRES_PASSWORD` | `tgddata_dev` in compose | **Change in production** |
| `POSTGRES_DB` | `tgddata` | Database name |

Compose sets `DATABASE_URL` for the backend service automatically when using `docker-compose.yml`.

### Optional

| Variable | Purpose |
|----------|---------|
| `SQLITE_SOURCE_PATH` | Override source file for data migration (default: tagged_data_sql path below) |
| `DB_POOL_SIZE` | Postgres pool size (default `5`) |
| `DB_MAX_OVERFLOW` | Postgres pool overflow (default `10`) |
| `DB_CREATE_ALL_ON_INIT` | If `true`, Postgres also runs `create_all` on `init_db()` (normally use Alembic only) |

### Default SQLite data source (one-time migration)

```
/Users/arjun/Software/tagged_data_sql/revenue_generator.db
```

This is **not** the repo’s local `revenue_generator.db`; it is the canonical dataset path agreed for migration.

---

## 5. Connection URL formats

### Local (host → Docker Postgres on 127.0.0.1:5432)

```bash
DATABASE_URL=postgresql+psycopg://tgddata:YOUR_PASSWORD@127.0.0.1:5432/tgddata
```

### Docker Compose (backend → postgres service)

Set automatically:

```text
postgresql+psycopg://tgddata:${POSTGRES_PASSWORD}@postgres:5432/tgddata
```

### Google Cloud SQL (private IP + Auth Proxy on VM)

Example shape (replace project, region, instance, user, password):

```bash
DATABASE_URL=postgresql+psycopg://APP_USER:PASSWORD@127.0.0.1:5432/tgddata?host=/cloudsql/PROJECT:REGION:INSTANCE
```

Run the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy) on the VM; bind the socket or localhost port; never expose Postgres publicly without TLS and strict firewall rules.

### AWS RDS PostgreSQL

```bash
DATABASE_URL=postgresql+psycopg://APP_USER:PASSWORD@your-instance.region.rds.amazonaws.com:5432/tgddata?sslmode=require
```

Use the same application image and `docker-compose.prod.yml`; only networking and secrets differ from GCP.

**Important:** The application does not branch on cloud vendor. Only `DATABASE_URL` (and optional SSL query params) change.

---

## 6. Engine behaviour (`backend/db/engine.py`)

### PostgreSQL

- `pool_pre_ping=True` — avoids stale connections after idle timeouts (common on managed DBs).
- `pool_size` / `max_overflow` from env (defaults 5 / 10).

### SQLite (legacy)

- `connect_args={"check_same_thread": False}` only for SQLite URLs.

### URL detection

`postgresql+psycopg://` is treated as PostgreSQL (driver prefix is supported).

---

## 7. Schema management (Alembic)

### Initial revision

- **Revision ID:** `20260519_0001`
- **Upgrade:** `Base.metadata.create_all(bind=op.get_bind())`
- **Downgrade:** `Base.metadata.drop_all(bind=op.get_bind())` — destructive; dev only.

Future schema changes: add new revisions with `alembic revision -m "description"` (autogenerate against Postgres when models change).

### When migrations run

1. **Docker backend start:** `scripts/docker-entrypoint-backend.sh` → `alembic upgrade head` → Uvicorn.
2. **Manual:** `./scripts/db-migrate.sh` from repo root (sources `.env` if present).
3. **Data migration script:** runs `alembic upgrade head` unless `--skip-alembic`.

### `init_db()` on PostgreSQL

- Does **not** run SQLite `PRAGMA` / `ALTER` helpers.
- Still runs: legacy budget/forecast table migration (if old tables exist), finance dedupe, SLA/client backfills, auth bootstrap.
- Optional `DB_CREATE_ALL_ON_INIT=true` for dev safety net; production should rely on Alembic.

---

## 8. One-time data migration (SQLite → PostgreSQL)

### Script

```bash
python -m backend.scripts.migrate_sqlite_to_postgres [--truncate] [--skip-alembic] [--source PATH]
```

| Flag | Effect |
|------|--------|
| `--truncate` | `TRUNCATE ... CASCADE` on all app tables in target DB before copy |
| `--skip-alembic` | Skip `alembic upgrade head` (if schema already applied) |
| `--source` | SQLite file path (default: `SQLITE_SOURCE_PATH` or tagged_data_sql path) |

### Behaviour

1. Requires `DATABASE_URL` pointing at **PostgreSQL**.
2. Applies Alembic schema (unless `--skip-alembic`).
3. Optionally truncates target tables.
4. Sets `session_replication_role = replica` on Postgres to relax FK checks during bulk load.
5. Copies tables in **FK-safe order** (users → clients → projects → … → activity_log).
6. Reads SQLite via **sqlite3** (not SQLAlchemy reflect) to avoid broken legacy FKs (e.g. `projects_old`).
7. Inserts only columns that exist on the Postgres table.
8. Resets serial sequences where `id` is a serial column.

### Example (local Postgres already running)

```bash
cd /path/to/tgddata_C1
export PYTHONPATH=$PWD
export DATABASE_URL='postgresql+psycopg://tgddata:YOUR_PASSWORD@127.0.0.1:5432/tgddata'

./scripts/db-migrate.sh
python3 -m backend.scripts.migrate_sqlite_to_postgres --truncate
```

### Verified migration (May 2026)

From `tagged_data_sql/revenue_generator.db` into local Postgres 16:

- **30,355 rows** copied across 35 tables (including 10,645 `records`, 5,173 `sla_performances`, finance ledger rows, etc.).

### Cloud SQL `tgddata-pg-prod` (private IP only)

Production Cloud SQL is **private-IP-only** so Cloud Run uses a VPC connector.

**Recommended — migrate from GCE VM in the same VPC:**

```bash
./deploy/gcp/05-migrate-database-on-vm.sh
```

**Alternative — temporary public IP from a laptop:**

```bash
./deploy/gcp/05-migrate-database-via-public-ip.sh
```

**What happens**

1. `gcloud sql instances patch tgddata-pg-prod --assign-ip`
2. `05-migrate-database.sh` — Auth Proxy over the public path (IAM; no `0.0.0.0/0` authorized networks)
3. On exit: `--no-assign-ip` if this script enabled public IP in step 1

**Notes:** Cloud Run keeps using **private IP + VPC connector**. If the script aborts, manually remove public IP: `gcloud sql instances patch tgddata-pg-prod --no-assign-ip --project=taggd-491107`. Details: [`deploy/gcp/README.md`](../deploy/gcp/README.md).

---

## 9. Local development

### Option A — Full Docker (recommended)

```bash
cp .env.example .env
# Edit: POSTGRES_PASSWORD, JWT_SECRET, GEMINI_API_KEY

docker compose up -d --build
```

- Postgres: `127.0.0.1:5432`
- Frontend: `http://127.0.0.1:8080`
- Backend runs migrations on every start.

**First-time data** (from tagged_data_sql):

```bash
export DATABASE_URL='postgresql+psycopg://tgddata:YOUR_PASSWORD@127.0.0.1:5432/tgddata'
export PYTHONPATH=$PWD
python3 -m backend.scripts.migrate_sqlite_to_postgres --truncate
```

### Option B — API on host, Postgres in Docker

```bash
docker compose up -d postgres
export DATABASE_URL='postgresql+psycopg://tgddata:YOUR_PASSWORD@127.0.0.1:5432/tgddata'
export PYTHONPATH=$PWD
pip install -r requirements.txt
./scripts/db-migrate.sh
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Run frontend separately (`cd frontend && npm run dev`).

---

## 10. Production / new VM deployment

### Compose file

Use **`docker-compose.prod.yml`** when PostgreSQL is **not** on the same host:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Set in `.env` on the VM:

- `DATABASE_URL` → Cloud SQL or RDS
- `JWT_SECRET`, `GEMINI_API_KEY`, etc.

Do **not** commit `.env`.

### Suggested rollout order

1. Provision **PostgreSQL 16** (Cloud SQL or RDS): backups, PITR, private networking.
2. Create database `tgddata` and least-privilege app user.
3. Configure **proxy / VPC** so the new VM can reach the DB on private network.
4. From a trusted machine (or VM with proxy): run **data migration** script against prod `DATABASE_URL` (maintenance window if replacing live data).
5. Deploy app on **new VM** with `docker-compose.prod.yml`.
6. Point DNS / Nginx at new VM; verify login, dashboards, one ingest path.
7. Decommission old SQLite-based VM after validation.

### Backend container startup

Every backend start:

```text
alembic upgrade head  →  uvicorn backend.main:app
```

Ensure the DB user can `CREATE`/`ALTER` if you run migrations from the app container, **or** run migrations from CI with a migration user and grant the app user DML only (stricter enterprise pattern).

---

## 11. Google Cloud SQL (project `taggd-491107`)

### Provisioned instance (May 2026)

| Setting | Value |
|---------|--------|
| **Instance name** | `tgddata-pg-prod` |
| **Connection name** | `taggd-491107:asia-south1:tgddata-pg-prod` |
| **Version** | PostgreSQL **16** |
| **Region** | `asia-south1` (zone `asia-south1-a`) |
| **Tier** | `db-perf-optimized-N-2` (Enterprise Plus) |
| **Private IP** | `172.23.0.3` on VPC `default` |
| **Public IP** | **Disabled** (`ipv4Enabled: false`) |
| **Storage** | 50 GB SSD, auto-increase |
| **Backups** | Daily 03:00 UTC, **PITR** enabled |
| **Database** | `tgddata` |
| **App user** | `tgddata_app` |
| **Password secret** | Secret Manager `tgddata-pg-prod-db-password` |

VPC peering for private IP: global range `google-managed-services-default` on network `default`.

**Legacy instance:** `taggd-db` (Postgres 15, `db-f1-micro`, public IP) — keep for reference; new deploys should use `tgddata-pg-prod`.

### Repo scripts

| Script | Purpose |
|--------|---------|
| `scripts/gcp-cloudsql-tgddata-pg-prod.sh` | Export connection constants |
| `scripts/setup-cloud-sql-proxy-vm.sh` | Install Auth Proxy + systemd on VM |
| `scripts/fetch-cloudsql-database-url.sh` | Print `DATABASE_URL` (reads password from Secret Manager) |

### Checklist for new VM

1. Grant VM service account **`roles/cloudsql.client`** and **`roles/secretmanager.secretAccessor`**.
2. Build `.env`: `./scripts/fetch-cloudsql-database-url.sh >> .env` (on machine with gcloud access).
3. **Choose proxy mode** (see below).
4. Run data migration (from jump host with proxy or from VM): `python3 -m backend.scripts.migrate_sqlite_to_postgres --truncate`.
5. Deploy app (see compose commands below).
6. Host Nginx + TLS in front of `127.0.0.1:8080` (see `DEPLOYMENT_DOC.md`).

### Cloud SQL Auth Proxy + Docker (recommended)

`docker-compose.prod.yml` runs **`cloud-sql-proxy`** as a sidecar and mounts a shared volume at **`/cloudsql`** into the backend (read-only). The VM service account credentials are used automatically on GCE.

```bash
# On VM in repo root, after .env has DATABASE_URL:
docker compose -f docker-compose.prod.yml up -d --build
```

`DATABASE_URL` must use the Unix socket host query param:

```text
postgresql+psycopg://tgddata_app:PASSWORD@/tgddata?host=/cloudsql/taggd-491107:asia-south1:tgddata-pg-prod
```

### Host systemd proxy (alternative)

If you prefer one proxy for the whole VM (not in Compose):

```bash
sudo bash scripts/setup-cloud-sql-proxy-vm.sh
docker compose -f docker-compose.prod.host-proxy.yml up -d --build
```

`docker-compose.prod.host-proxy.yml` is a separate stack (no compose proxy service) that bind-mounts host **`/cloudsql`** into the backend.

---

## 12. AWS RDS checklist

1. Create **RDS PostgreSQL 16** (or Aurora PostgreSQL compatible with psycopg3).
2. Place in **private subnets**; security group allows **only** the app VM security group on port 5432.
3. Enable **encryption at rest**, backups, multi-AZ if required by client SLA.
4. `DATABASE_URL` with `sslmode=require` (or stricter).
5. Secrets in **AWS Secrets Manager**; inject into VM `.env` at deploy time.
6. Same app deploy: `docker-compose.prod.yml` + migration already done or run from jump host.

---

## 13. Operations reference

### Apply migrations manually

```bash
./scripts/db-migrate.sh
# or
export DATABASE_URL=...
alembic upgrade head
```

### Check current revision

```bash
alembic current
```

### New schema change (developers)

1. Update SQLAlchemy models in `backend/db/database.py`.
2. `alembic revision --autogenerate -m "describe_change"` (against Postgres dev DB).
3. Review generated migration; test upgrade + downgrade on staging.
4. Deploy; backend entrypoint runs `upgrade head`.

### Clear data (keep admin users)

Works with Postgres:

```bash
export DATABASE_URL=...
python backend/scripts/clear_all_data_keep_admin.py --yes
```

### Rollback

- **App:** redeploy previous Docker image tag.
- **DB:** Alembic downgrade only if you authored a safe `downgrade()`; prefer **forward-fix** migrations in production. Use managed **PITR restore** for disaster recovery.

---

## 14. Tables copied (load order)

The data migration script loads tables in this order (parents before children):

1. users  
2. clients  
3. projects  
4. user_project_assignments  
5. user_composio_connections  
6. client_dashboard_configs  
7. project_transitions  
8. project_contracts  
9. platform_meetings  
10. meeting_action_items  
11. resume_supplier_licenses  
12. platform_tasks  
13. task_assignees  
14. records  
15. candidates  
16. candidate_masters  
17. candidate_master_links  
18. metric_definitions  
19. sla_performances  
20. wfm_hr_benchmarks  
21. wfm_resource_gaps  
22. finance_monthly_ledger  
23. finance_cash_flow  
24. finance_efficiency_kpis  
25. revenue_weekly_submission  
26. revenue_forecast_weekly  
27. revenue_visibility_snapshot  
28. taggd_revenue_billing  
29. finance_billing_workflow  
30. finance_billing_validation_events  
31. finance_payment_receipts  
32. finance_tds_certificates  
33. finance_bank_statement_lines  
34. ingestion_events  
35. activity_log  

Extra SQLite tables not in this list are appended if present (excluding `alembic_version`). Legacy tables like `projects_old` are **not** migrated (source reads avoid broken FK reflection).

---

## 15. Security notes

- Never commit `.env` or production `DATABASE_URL`.
- Use **TLS** to managed Postgres in cloud (`sslmode=require` on RDS).
- Restrict DB network to app tier only.
- Rotate `POSTGRES_PASSWORD` / RDS credentials via your secret store; update `DATABASE_URL` on redeploy.
- JWT and AI keys unchanged by this migration; see `docs/ENTERPRISE_SECURITY_ANALYSIS_AND_ROADMAP.md` for broader hardening.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `Unsupported DATABASE_URL scheme: postgresql+psycopg` | Old engine helper | Ensure latest `backend/db/engine.py` (`is_postgres_url` includes `postgresql+`) |
| `relation "users" does not exist` | Schema not applied | Run `./scripts/db-migrate.sh` or restart backend container |
| Auth fails after migration | Users not copied | Re-run migration with `--truncate`; verify row counts for `users` |
| `projects_old` / FK errors during copy | SQLite legacy schema | Script uses sqlite3 direct read; update script if new legacy tables appear |
| Backend won’t start on prod | DB unreachable from VM | Check proxy, VPC, security groups, `DATABASE_URL` host |
| Slow dashboards | Missing indexes | Compare query plans on Postgres; add Alembic revision for indexes if needed |
| Executive Overview KPI banner; 500 on `/stats/global/monitor` | `records.revenue_results` copied as JSON **strings**; Python code called `.get()` on `str` | Use `backend/core/json_fields.as_json_dict()` (see `get_global_stats` / `get_global_monitoring` in `main.py`); redeploy Cloud Run API |
| Requisition count shows but clients “—” | Partial API failure: `/stats/requisitions/kpis` OK; `/stats/global` or monitor failed | Same as above; verify with `curl …/ready` and Cloud Run logs |

**Cloud Run data check (no login):**

```bash
curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready
```

Expect `"database":"ok"` and non-zero `projects` / `records` when migration succeeded.

---

## 17. Related documentation

- [`CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md`](CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md) — Cloud Run, GCS/S3 storage, load balancing, AWS portability.
- [`DEPLOYMENT_DOC.md`](../DEPLOYMENT_DOC.md) — operator index (Cloud Run primary; VM + host Nginx legacy).
- `docs/ENTERPRISE_SECURITY_ANALYSIS_AND_ROADMAP.md` — security posture including Postgres recommendation.
- `docs/CLOUD_DB_RE_INGESTION_RUNBOOK.md` — data re-ingestion after cloud DB exists (set `DATABASE_URL` to Postgres).
- `.env.example` — copy-paste URL templates.

---

## 18. Quick command cheat sheet

```bash
# Local stack
docker compose up -d --build

# Migrations only
./scripts/db-migrate.sh

# Load canonical SQLite into Postgres
export DATABASE_URL='postgresql+psycopg://tgddata:PASS@127.0.0.1:5432/tgddata'
export PYTHONPATH=$PWD
python3 -m backend.scripts.migrate_sqlite_to_postgres --truncate

# Production app (external DB)
docker compose -f docker-compose.prod.yml up -d --build

# Alembic status
alembic current
alembic history
```

---

*This migration was implemented to support enterprise-scale daily operations with a portable PostgreSQL layer across Google Cloud SQL and AWS RDS, while keeping local development aligned with production.*
