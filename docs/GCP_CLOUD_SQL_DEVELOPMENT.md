# GCP Cloud SQL development — production database & Docker integration

This document records the **GCP Cloud SQL** work for tgddata: provisioning PostgreSQL in project **`taggd-491107`**, private networking, Secret Manager, IAM, Auth Proxy integration with **Docker Compose**, and how it fits with the broader **SQLite → PostgreSQL** migration.

**Related:** [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md) (application migration, Alembic, local dev, AWS RDS).  
**Date:** May 2026

---

## 1. What was built

| Deliverable | Description |
|-------------|-------------|
| **Cloud SQL instance** | `tgddata-pg-prod` — PostgreSQL 16, private IP only, backups + PITR |
| **VPC peering** | Private Service Connect range on `default` network for Cloud SQL |
| **Database & user** | DB `tgddata`, user `tgddata_app` |
| **Secret Manager** | Password stored in `tgddata-pg-prod-db-password` |
| **IAM** | VM service account granted Cloud SQL Client + Secret Accessor |
| **Repo scripts** | Env constants, proxy VM setup, `DATABASE_URL` fetcher |
| **Docker Compose (prod)** | Sidecar `cloud-sql-proxy` + backend socket mount |
| **Docker Compose (host proxy)** | Alternative stack mounting host `/cloudsql` |

The goal is a **new VM** deployment path: app containers talk to **managed Postgres** over a **Unix socket** (Auth Proxy), not SQLite on disk.

---

## 2. GCP project context

| Setting | Value |
|---------|--------|
| **Project ID** | `taggd-491107` |
| **Default zone (VM)** | `asia-south1-a` |
| **Existing VM (reference)** | `tgddata-c1-prod-2` |
| **VPC** | `default` |
| **VM service account** | `881351781242-compute@developer.gserviceaccount.com` |

Deploy env script (unchanged for VM deploy): `scripts/gcp-env-tgddata-c1-prod-2.sh`.

---

## 3. Cloud SQL instance: `tgddata-pg-prod`

### 3.1 Specification

| Attribute | Value |
|-----------|--------|
| **Instance name** | `tgddata-pg-prod` |
| **Connection name** | `taggd-491107:asia-south1:tgddata-pg-prod` |
| **Engine** | PostgreSQL **16** |
| **Region** | `asia-south1` (primary zone `asia-south1-a`) |
| **Machine type** | `db-perf-optimized-N-2` (Enterprise Plus edition) |
| **Private IP** | `172.23.0.3` |
| **Public IP** | **Disabled** |
| **Storage** | 50 GB SSD, auto-increase enabled |
| **Backups** | Daily at **03:00 UTC** |
| **Point-in-time recovery** | Enabled |
| **Availability** | Zonal |
| **Maintenance** | Sunday, 04:00 |

### 3.2 Logical database objects

| Object | Name |
|--------|------|
| Database | `tgddata` |
| Application user | `tgddata_app` |
| Password secret (Secret Manager) | `tgddata-pg-prod-db-password` |

**Do not commit passwords.** Retrieve for ops only:

```bash
gcloud secrets versions access latest \
  --secret=tgddata-pg-prod-db-password \
  --project=taggd-491107
```

### 3.3 Legacy instance (do not use for new deploys)

| Instance | Notes |
|----------|--------|
| **`taggd-db`** | Postgres 15, `db-f1-micro`, **public IP**, backups off — pre-migration / dev leftover |

New production should use **`tgddata-pg-prod`** only.

---

## 4. Networking (private IP + proxy)

### 4.1 VPC peering (one-time, already done)

Cloud SQL private IP requires a **allocated range** and **VPC peering** to `servicenetworking.googleapis.com`:

1. Enabled APIs: `servicenetworking.googleapis.com`, `sqladmin.googleapis.com`
2. Reserved global range: `google-managed-services-default` (prefix `/16`) on network `default`
3. Connected peering: `gcloud services vpc-peerings connect ...`

The instance was created with:

- `--network=default`
- `--no-assign-ip` (private IP only)

### 4.2 How the app reaches the database

Two supported patterns (both use **Cloud SQL Auth Proxy** and a Unix socket under `/cloudsql/`):

```
┌─────────────────────────────────────────────────────────────────┐
│  GCE VM (default VPC)                                           │
│                                                                 │
│  Option A — Compose sidecar                                     │
│  ┌──────────────────┐    volume     ┌─────────────────────────┐ │
│  │ cloud-sql-proxy  │──cloudsql────▶│ backend (FastAPI)       │ │
│  │   container      │   _socket     │  DATABASE_URL host=     │ │
│  └────────┬─────────┘               │  /cloudsql/CONN_NAME   │ │
│           │                          └─────────────────────────┘ │
│           │ IAM: cloudsql.client                                 │
│           ▼                                                      │
│     Cloud SQL tgddata-pg-prod (172.23.0.3, private)             │
└─────────────────────────────────────────────────────────────────┘

  Option B — Host systemd proxy
  ┌──────────────────┐  bind mount   ┌─────────────────────────┐
  │ systemd          │  /cloudsql    │ backend container       │
  │ cloud-sql-proxy  │──────────────▶│                         │
  └────────┬─────────┘               └─────────────────────────┘
           ▼
     Cloud SQL (same instance)
```

Direct private-IP connection from the backend container is possible if the container shares the host network or VPC routing is explicit; the **documented path** is Auth Proxy + Unix socket for IAM and consistent TLS.

---

## 5. IAM and secrets

### 5.1 VM service account roles

Granted to `881351781242-compute@developer.gserviceaccount.com`:

| Role | Purpose |
|------|---------|
| `roles/cloudsql.client` | Auth Proxy / connector access to instance |
| `roles/secretmanager.secretAccessor` | Read DB password for `fetch-cloudsql-database-url.sh` |

For a **new VM**, attach a service account with the same roles (or narrower custom roles if your org requires it).

### 5.2 Secret Manager

- **Secret ID:** `tgddata-pg-prod-db-password`
- **Contents:** `tgddata_app` database password (generated at user creation)
- **Rotation:** Update secret → change Cloud SQL user password → redeploy with new `DATABASE_URL`

---

## 6. Repository scripts

| Script | Run where | Purpose |
|--------|-----------|---------|
| `scripts/gcp-cloudsql-tgddata-pg-prod.sh` | Dev machine / VM | `source` — exports connection constants |
| `scripts/setup-cloud-sql-proxy-vm.sh` | **On VM** (sudo) | Install Auth Proxy binary + systemd unit |
| `scripts/fetch-cloudsql-database-url.sh` | Machine with `gcloud` | Print `DATABASE_URL=...` line for `.env` |
| `scripts/db-migrate.sh` | Repo root | `alembic upgrade head` |
| `backend/scripts/migrate_sqlite_to_postgres.py` | Repo root | One-time SQLite → Postgres data copy |

### 6.1 Environment constants (`gcp-cloudsql-tgddata-pg-prod.sh`)

```bash
source scripts/gcp-cloudsql-tgddata-pg-prod.sh
# CLOUDSQL_CONNECTION_NAME, CLOUDSQL_DATABASE, CLOUDSQL_USER, CLOUDSQL_PRIVATE_IP, etc.
```

### 6.2 Generate `DATABASE_URL`

```bash
./scripts/fetch-cloudsql-database-url.sh >> .env
```

Produces (shape):

```text
DATABASE_URL=postgresql+psycopg://tgddata_app:PASSWORD@/tgddata?host=/cloudsql/taggd-491107:asia-south1:tgddata-pg-prod
```

Requires `gcloud` auth and Secret Manager access.

### 6.3 Host systemd proxy (Option B)

```bash
sudo bash scripts/setup-cloud-sql-proxy-vm.sh
```

Creates:

- Binary: `/usr/local/bin/cloud-sql-proxy`
- Socket dir: `/cloudsql`
- Service: `cloud-sql-proxy-tgddata.service`

Socket path used by the app:

```text
/cloudsql/taggd-491107:asia-south1:tgddata-pg-prod
```

---

## 7. Docker Compose — production

### 7.1 Option A: Proxy in Compose (recommended)

**File:** `docker-compose.prod.yml`

Services:

1. **`cloud-sql-proxy`** — image `gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.3`
2. **`backend`** — mounts `cloudsql_socket:/cloudsql:ro`, depends on proxy
3. **`frontend`** — `127.0.0.1:8080:80`

Shared volume `cloudsql_socket` holds the Unix socket directory.

```bash
# On VM, in repo root:
cp .env.example .env
./scripts/fetch-cloudsql-database-url.sh >> .env
# Edit: JWT_SECRET, GEMINI_API_KEY, etc.

docker compose -f docker-compose.prod.yml up -d --build
```

Backend entrypoint (unchanged): `alembic upgrade head` → Uvicorn.

### 7.2 Option B: Host systemd proxy

**File:** `docker-compose.prod.host-proxy.yml`

- No `cloud-sql-proxy` container
- Backend bind-mount: `/cloudsql:/cloudsql:ro`

```bash
sudo bash scripts/setup-cloud-sql-proxy-vm.sh
docker compose -f docker-compose.prod.host-proxy.yml up -d --build
```

### 7.3 Comparison

| | Compose proxy | Host systemd proxy |
|--|---------------|-------------------|
| **Ops** | Single `docker compose up` | Proxy survives app restarts independently |
| **Updates** | Proxy version in compose file | Manual/script update on host |
| **Socket** | Docker volume | Host `/cloudsql` |
| **Best for** | New VM, simplicity | Teams already standardizing on systemd |

---

## 8. End-to-end deployment on a new VM

### Phase 1 — Prerequisites

1. GCE VM in **`asia-south1`**, network **`default`** (same VPC as Cloud SQL private IP).
2. Service account with **`cloudsql.client`** + **`secretmanager.secretAccessor`**.
3. Docker + Docker Compose installed.
4. Repo cloned; `.env` configured.

### Phase 2 — Schema and data

**Cloud Run / private-IP-only instance:** run migration on **`tgddata-c1-prod-2`** (same VPC, no public IP toggle):

```bash
./deploy/gcp/05-migrate-database-on-vm.sh
```

See [`deploy/gcp/README.md`](../deploy/gcp/README.md). Alternative from a laptop: `05-migrate-database-via-public-ip.sh`.

**On a VM in `default` VPC** (proxy over private IP / Unix socket):

```bash
export PYTHONPATH=$PWD
./scripts/fetch-cloudsql-database-url.sh >> .env
./scripts/db-migrate.sh
export SQLITE_SOURCE_PATH=/Users/arjun/Software/tagged_data_sql/revenue_generator.db
python3 -m backend.scripts.migrate_sqlite_to_postgres --truncate
```

Verify row counts / login after migration.

### Phase 3 — Application

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Phase 4 — Edge TLS

- Nginx + Certbot on host (see `DEPLOYMENT_DOC.md`, `scripts/setup-host-nginx-certbot-taggd.sh`)
- Proxy `https://your-domain` → `127.0.0.1:8080`

### Phase 5 — Smoke tests

- [ ] `curl -sI http://127.0.0.1:8080/`
- [ ] Login as admin
- [ ] Open dashboard with DB-backed KPIs
- [ ] Check backend logs: no DB connection errors

---

## 9. Local development vs GCP production

| | Local (`docker-compose.yml`) | GCP prod (`docker-compose.prod.yml`) |
|--|------------------------------|--------------------------------------|
| **Postgres** | Container `postgres:16-alpine` | Cloud SQL `tgddata-pg-prod` |
| **Connection** | `postgresql+psycopg://...@postgres:5432/tgddata` | Unix socket via Auth Proxy |
| **Secrets** | `.env` `POSTGRES_PASSWORD` | Secret Manager + `DATABASE_URL` |
| **Data** | `migrate_sqlite_to_postgres.py` optional | Same script against Cloud SQL URL |

Application code is **identical**; only `DATABASE_URL` changes.

---

## 10. AWS RDS (client requirement)

This GCP development does **not** change AWS portability:

- Use `docker-compose.prod.yml` **without** the `cloud-sql-proxy` service on AWS.
- Set `DATABASE_URL` to RDS endpoint + `sslmode=require`.
- Or use `docker-compose.prod.host-proxy.yml` pattern with a different host mount if you run a local proxy to RDS.

See [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md) §12.

---

## 11. Troubleshooting

| Symptom | Likely cause | Action |
|---------|----------------|--------|
| Backend: connection refused on `/cloudsql/...` | Proxy not running | `docker ps`; check `cloud-sql-proxy` logs or `systemctl status cloud-sql-proxy-tgddata` |
| `403 Cloud SQL` / IAM | Missing `cloudsql.client` | Grant role to VM service account |
| `password authentication failed` | Wrong `DATABASE_URL` | Re-run `fetch-cloudsql-database-url.sh` or rotate user password + secret |
| Proxy starts, app cannot see socket | Volume mount | Ensure backend has `cloudsql_socket:/cloudsql:ro` or host `/cloudsql` mount |
| Migrations fail on first boot | Empty DB / wrong URL | Run `alembic upgrade head` manually with same `DATABASE_URL` |
| Works on VM, not from laptop | Private IP only | `./deploy/gcp/05-migrate-database-via-public-ip.sh` (brief public IP), or run migration on a VM in `default` VPC |

### Useful commands

```bash
# Instance status
gcloud sql instances describe tgddata-pg-prod --project=taggd-491107

# List databases
gcloud sql databases list --instance=tgddata-pg-prod --project=taggd-491107

# Proxy logs (compose)
docker compose -f docker-compose.prod.yml logs -f cloud-sql-proxy

# Proxy logs (systemd)
sudo journalctl -u cloud-sql-proxy-tgddata -f
```

---

## 12. Files touched in this development

| Path | Role |
|------|------|
| `docker-compose.prod.yml` | Prod stack with compose-managed Auth Proxy |
| `docker-compose.prod.host-proxy.yml` | Prod stack with host `/cloudsql` mount |
| `scripts/gcp-cloudsql-tgddata-pg-prod.sh` | Connection name / constants |
| `scripts/setup-cloud-sql-proxy-vm.sh` | VM systemd proxy installer |
| `scripts/fetch-cloudsql-database-url.sh` | Build `DATABASE_URL` from Secret Manager |
| `.env.example` | Cloud SQL URL examples + compose commands |
| `docs/POSTGRES_MIGRATION.md` | §11 updated with instance table |
| `docs/GCP_CLOUD_SQL_DEVELOPMENT.md` | This document |

**Infrastructure created in GCP (not in git):**

- Cloud SQL instance `tgddata-pg-prod`
- VPC peering / reserved range `google-managed-services-default`
- Secret `tgddata-pg-prod-db-password`
- IAM bindings on compute service account

---

## 13. Security notes

- **No public IP** on `tgddata-pg-prod` — reduces exposure; app must run in VPC or via proxy.
- **Passwords** only in Secret Manager and VM `.env` (file permissions `600`).
- **Do not commit** `.env` or paste production `DATABASE_URL` in tickets/chat.
- **Rotate** `tgddata_app` password periodically; update secret and redeploy.
- **Least privilege:** consider a separate DB user for migrations vs runtime DML in a later hardening pass.

---

## 14. Quick reference

```bash
# Constants
source scripts/gcp-cloudsql-tgddata-pg-prod.sh

# .env DATABASE_URL
./scripts/fetch-cloudsql-database-url.sh >> .env

# Deploy (compose proxy)
docker compose -f docker-compose.prod.yml up -d --build

# Deploy (host proxy)
sudo bash scripts/setup-cloud-sql-proxy-vm.sh
docker compose -f docker-compose.prod.host-proxy.yml up -d --build

# Data load (once)
python3 -m backend.scripts.migrate_sqlite_to_postgres --truncate
```

**Connection name:** `taggd-491107:asia-south1:tgddata-pg-prod`  
**Private IP:** `172.23.0.3` (VPC `default` only)

---

*This development completes the GCP side of the PostgreSQL migration: managed database, private connectivity, and production Docker wiring ready for a new VM cutover.*
