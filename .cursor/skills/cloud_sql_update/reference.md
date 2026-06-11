# Cloud SQL verification reference

Use after API deploy (`06`) to confirm schema changes without modifying data.

## Connection options

| Method | When |
|--------|------|
| **Cloud SQL Studio** (GCP Console → SQL → `tgddata-pg-prod` → Studio) | Quick read-only checks |
| **Cloud SQL Auth Proxy** + `psql` | Laptop with `roles/cloudsql.client` |
| **`05-migrate-database-via-public-ip.sh`** | Only if already used for admin; do not run data import for schema-only |

Proxy example (private IP instance):

```bash
gcloud config set project taggd-491107
cloud-sql-proxy taggd-491107:asia-south1:tgddata-pg-prod --port 9470
# separate terminal:
psql "postgresql://tgddata_app:PASSWORD@127.0.0.1:9470/tgddata"
```

Password from Secret Manager: `tgddata-pg-prod-db-password`.

---

## Row counts (sanity — should not drop after schema-only deploy)

```sql
SELECT
  (SELECT COUNT(*) FROM projects)   AS projects,
  (SELECT COUNT(*) FROM records)    AS records,
  (SELECT COUNT(*) FROM users)      AS users,
  (SELECT COUNT(*) FROM clients)    AS clients;
```

Compare to `curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready` (`projects`, `records`, `users`).

---

## Check specific columns exist

### Pipeline date fields (requisition drawer)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'records'
  AND column_name IN (
    'status',
    'global_status',
    'offered_ctc',
    'creation_date',
    'joining_date',
    'selection_date_req',
    'req_offered_date',
    'offered_accept_date',
    'req_cancelled_date'
  )
ORDER BY column_name;
```

Expect **9 rows** after full pipeline-date deploy. New columns: `TIMESTAMP` (or `timestamp without time zone`), `is_nullable = YES`.

### Any table — list all columns

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'records'
ORDER BY ordinal_position;
```

---

## Confirm additive migration (no row loss)

```sql
-- Sample: records still have historical data
SELECT id, project_id, candidate_name, status, global_status,
       creation_date, joining_date,
       req_offered_date, offered_accept_date, req_cancelled_date, selection_date_req
FROM records
ORDER BY id DESC
LIMIT 10;
```

Old rows: new date columns should be **NULL** unless backfilled.

---

## Alembic revision state

```sql
SELECT * FROM alembic_version;
```

Expect single row: `20260519_0001` (unless team added revisions).

---

## Danger signals in logs (Cloud Run)

```bash
gcloud run services logs read tgddata-api \
  --project=taggd-491107 --region=asia-south1 --limit=100 \
  | grep -iE 'UndefinedColumn|migration|alembic|pipeline date|ProgrammingError|rollback'
```

---

## Backup inventory

```bash
gcloud sql backups list --instance=tgddata-pg-prod --limit=10
```

Note `id` and `windowStartTime` before/after deploy for rollback reference.
