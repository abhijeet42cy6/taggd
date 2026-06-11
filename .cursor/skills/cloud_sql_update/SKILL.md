---
name: cloud_sql_update
description: >-
  Safely updates tgddata Cloud SQL Postgres schema and verifies prod data is
  preserved: additive migrations via API deploy, Alembic vs init_db runtime helpers,
  pre-flight backups, column verification, and when to use 05-migrate scripts.
  Use when the user asks to update Cloud SQL schema, add DB columns, migrate
  production database, schema deploy without data loss, or pipeline date fields on prod.
---

# Cloud SQL update (safe schema changes)

## When this applies

Use for **production Cloud SQL** (`tgddata-pg-prod`, database `tgddata`) when:

- New **ORM columns** or API fields need to exist in prod
- User asks whether prod data is safe during a schema change
- User needs to **verify** columns/tables after deploy
- User confuses **code deploy** with **data copy** (they are different)

**Not for:** copying local Postgres/SQLite **row data** into Cloud SQL (see [Data promotion](#data-promotion-separate-from-schema) below).

**Pair with:** [`.cursor/skills/deploy/SKILL.md`](../deploy/SKILL.md) for `06-deploy-api.sh` / `07-deploy-frontend.sh`.

---

## Core rule: existing data stays safe

Schema updates in this repo are designed to be **additive**:

| Safe (default in this codebase) | Unsafe (never without explicit user request) |
|---------------------------------|-----------------------------------------------|
| `ALTER TABLE … ADD COLUMN` (nullable) | `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` |
| New tables via `create_all` on empty DB | `alembic downgrade` on prod |
| `alembic upgrade head` when revision unchanged | Overwriting Cloud SQL with local dump without backup |
| Runtime `_ensure_*` column helpers on API start | `DELETE FROM` / mass `UPDATE` without scope |

**Effect on existing rows:** new nullable columns → **NULL** for old rows; all other column values **unchanged**.

---

## How schema reaches Cloud SQL (two mechanisms)

Understand both — they behave differently on an **existing** prod database.

### 1. Alembic (container boot)

- **Where:** `scripts/docker-entrypoint-backend.sh` runs `alembic upgrade head` before uvicorn.
- **Revision:** `alembic/versions/20260519_0001_initial_schema.py` calls `Base.metadata.create_all()`.
- **Limitation:** `create_all` creates **missing tables** only. It does **not** add new columns to tables that already exist.
- **Prod impact:** If revision is already applied, `alembic upgrade head` is a **no-op** for schema.

### 2. Runtime `init_db()` helpers (API import)

- **Where:** `backend/main.py` calls `init_db()` at startup; Postgres path runs `_ensure_*` functions in `backend/db/database.py`.
- **Examples:** `_ensure_record_pipeline_date_columns()`, `_ensure_records_rpo_columns()` (SQLite), finance/SLA column helpers.
- **Behavior:** `inspect` existing columns → `ALTER TABLE … ADD COLUMN` only when missing.
- **Prod impact:** **This is how new columns land on existing Cloud SQL** when there is no new Alembic revision.

### Frontend deploy does NOT update schema

`./deploy/gcp/07-deploy-frontend.sh` only uploads the SPA to GCS. **Schema changes require API deploy (`06`).**

---

## Decision tree

```
User needs Cloud SQL schema change?
│
├─ Only new nullable columns / _ensure_* helpers in backend/db/database.py?
│  └─ YES → Schema-only path (Section A) — deploy API 06
│
├─ New Alembic revision (author added alembic/versions/*.py)?
│  └─ YES → Schema-only path (Section A) — deploy API 06; alembic runs on boot
│
├─ User wants local SQLite/Postgres ROWS copied to Cloud SQL?
│  └─ YES → Data promotion path (Section B) — explicit backup + 05-migrate scripts
│
└─ User only changed React/UI?
   └─ 07 only — no DB change
```

---

## Section A — Schema-only update (no data loss)

Use when shipping **code** that adds columns or tables. **Does not copy local data to cloud.**

### A0 — Agent pre-flight (read-only)

1. Identify what changed:
   - New Alembic file under `alembic/versions/`?
   - New `_ensure_*` in `backend/db/database.py`?
   - New columns on SQLAlchemy models only?
2. Confirm change is **additive** (no drops/truncates in diff).
3. Test locally against Postgres:
   ```bash
   docker compose up -d postgres   # if using compose
   # ensure .env DATABASE_URL points at local Postgres
   curl -s http://127.0.0.1:8000/ready
   ```
4. Optional local column check — see [reference.md](reference.md).

### A1 — Backup Cloud SQL (recommended before prod schema deploy)

Create an **on-demand backup** (does not block deploy; protects rollback):

```bash
gcloud config set project taggd-491107

gcloud sql backups create \
  --instance=tgddata-pg-prod \
  --description="pre-schema-deploy-$(date +%Y%m%d-%H%M)"
```

List backups:

```bash
gcloud sql backups list --instance=tgddata-pg-prod --limit=5
```

**Do not skip** if the change includes anything beyond nullable `ADD COLUMN` (e.g. new Alembic revision with data backfill scripts).

### A2 — Deploy API (applies schema)

From **repository root**:

```bash
./deploy/gcp/06-deploy-api.sh
```

Faster if image already built:

```bash
SKIP_BUILD=1 ./deploy/gcp/06-deploy-api.sh
```

This:

1. Builds/pushes Cloud Run image with latest `backend/db/database.py` + models
2. On new container start: `alembic upgrade head` → `init_db()` → `_ensure_*` ALTERs
3. **Does not** delete or overwrite existing rows

### A3 — Deploy frontend (if UI uses new fields)

Only after API is live:

```bash
./deploy/gcp/07-deploy-frontend.sh
```

### A4 — Verify prod (agent must run)

**1. API health + row counts unchanged in spirit** (counts should match pre-deploy unless someone ingested data):

```bash
curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready
```

Expect: `"database":"ok"` and plausible `projects` / `records` counts.

**2. Cloud Run revision rolled:**

```bash
gcloud run services describe tgddata-api \
  --project=taggd-491107 --region=asia-south1 \
  --format='value(status.latestReadyRevisionName,status.url)'
```

**3. Logs — no migration failures:**

```bash
gcloud run services logs read tgddata-api \
  --project=taggd-491107 --region=asia-south1 --limit=50
```

Search for: `pipeline date columns migration`, `Alembic`, `ProgrammingError`, `UndefinedColumn`.

**4. Column exists in Cloud SQL** — use verification SQL in [reference.md](reference.md) via:

- Cloud SQL Studio / authorized proxy session, or
- `./deploy/gcp/05-migrate-database-via-public-ip.sh` path only if you already use it for admin access (do **not** run full SQLite import for schema-only).

**5. Smoke test in UI:** `app.html#/login` → open a record that uses new fields → save → reload → values persist.

### A5 — Rollback if something breaks

1. **API rollback:** deploy previous known-good image revision via Cloud Run console or redeploy prior git commit with `06`.
2. **Database rollback:** restore from backup created in A1:
   ```bash
   gcloud sql backups restore BACKUP_ID \
     --restore-instance=tgddata-pg-prod \
     --backup-instance=tgddata-pg-prod
   ```
   **Warning:** restore replaces the **entire instance** state at backup time — only for serious failure, not for “undo one column.”

---

## Section B — Data promotion (separate from schema)

Use only when user **explicitly** wants to copy **data** (rows) from SQLite or another source into Cloud SQL.

| Goal | Command |
|------|---------|
| SQLite → Cloud SQL (laptop + temp public IP) | `./deploy/gcp/05-migrate-database-via-public-ip.sh` |
| Schema only, skip data copy | `SKIP_DATA_MIGRATION=1 ./deploy/gcp/05-migrate-database-via-public-ip.sh` |
| VM-based migrate | `./deploy/gcp/05-migrate-database-on-vm.sh` |

**Data promotion risks:**

- `--truncate` in migrate scripts **wipes** target tables before load — **never** run on prod without explicit user approval and backup.
- Local Postgres data **does not** sync to cloud when you run `06` alone.

**Schema + data:** run backup → schema via `06` if needed → then data script only if user asked.

---

## Example: requisition pipeline date fields

| UI label | Column | How prod gets it |
|----------|--------|------------------|
| Req offered | `records.req_offered_date` | `_ensure_record_pipeline_date_columns()` on API start |
| Offered accept | `records.offered_accept_date` | same |
| Req cancelled | `records.req_cancelled_date` | same |
| Candidate selection | `records.selection_date_req` | RPO columns (likely already on prod) |

**Steps:** A1 backup (optional) → **A2 `06` only** → A4 verify columns → **A3 `07`** if drawer UI changed.

Existing requisition rows: **unchanged**; new date fields **NULL** until edited in UI.

---

## Local Postgres parity

Local dev uses the same `_ensure_*` helpers when API starts (`init_db()` in `main.py`). Pulling cloud **data** to local is separate:

```bash
./scripts/pull-cloudsql-to-local.sh   # read-only dump; does not write to Cloud SQL
```

---

## Agent checklist

Copy and track:

```
Cloud SQL schema update:
- [ ] Confirmed additive change (no DROP/TRUNCATE)
- [ ] Identified mechanism: Alembic revision and/or _ensure_* helper
- [ ] Tested locally against Postgres (/ready OK)
- [ ] User informed: 07 alone is insufficient for schema
- [ ] Optional: gcloud sql backups create (prod)
- [ ] Ran ./deploy/gcp/06-deploy-api.sh
- [ ] curl /ready — database ok, counts plausible
- [ ] Checked Cloud Run logs for migration errors
- [ ] Verified new columns (reference.md SQL)
- [ ] Ran 07 if frontend uses new fields
- [ ] User smoke-tested save/load in app.html#/login
```

---

## Never do without explicit user request

- `TRUNCATE`, `DROP TABLE`, `DROP COLUMN` on prod
- Restore Cloud SQL backup without confirming downtime/data loss window
- Run `05-migrate-database*.sh` full import against prod “just to update schema”
- Assume `07-deploy-frontend.sh` updates the database
- Commit `.env` or production credentials

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [reference.md](reference.md) | Verification SQL, column inventory queries |
| [../deploy/SKILL.md](../deploy/SKILL.md) | Full Cloud Run + GCS deploy |
| [`deploy/gcp/README.md`](../../deploy/gcp/README.md) | Migrate scripts, IAM, troubleshooting |
| [`docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md`](../../docs/GCP_CLOUD_RUN_DEPLOYMENT_GUIDE.md) | End-to-end cloud workflow |
| [`docs/POSTGRES_MIGRATION.md`](../../docs/POSTGRES_MIGRATION.md) | Postgres / Alembic background |
| [`DATABASE_SCHEMA.md`](../../DATABASE_SCHEMA.md) | Table/column reference |
