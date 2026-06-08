# Book62 portfolio alignment — changes, current data, and Clients UI report

**Date:** 2026-06-05  
**Scope:** Cloud SQL `tgddata-pg-prod` (production)  
**Source of truth:** `excel_files_imp/Book62.xlsx` (58 project rows → ~51 canonical brands)

Related docs:
- [BOOK62_SOURCE_OF_TRUTH_REALIGNMENT.md](./BOOK62_SOURCE_OF_TRUTH_REALIGNMENT.md) — full match tables
- [CLIENTS_PROJECTS_CONTRACTS_DATA_MODEL.md](./CLIENTS_PROJECTS_CONTRACTS_DATA_MODEL.md) — 179 vs 61 vs clients model

---

## 1. What we did (chronological)

### 1.1 Pre-change backup (required before writes)

| Step | Command / artifact |
|------|-------------------|
| Read-only dump via VM IAP | `./scripts/pull-cloudsql-to-local.sh` |
| Named pre-change copy | `/Users/arjun/Software/tagged_data_sql/tgddata-cloudsql-pre-book62-20260605075004.dump` |
| Timestamped dump | `/Users/arjun/Software/tagged_data_sql/tgddata-cloudsql-20260605074738.dump` |

Cloud SQL was **not modified** during backup. Local Docker Postgres was refreshed from the dump for dry-run testing.

### 1.2 Alignment script

**File:** `backend/scripts/apply_book62_portfolio_alignment.py`

| Book62 row (matched project) | All other projects |
|------------------------------|-------------------|
| `projects.account_status = 'Active'` | `projects.account_status = 'inactive'` |
| Sync `regional_head`, `practice_head`, `region` from workbook | No metadata sync |
| Linked `clients.lifecycle_state = 'active'` | Linked clients (with **no** Book62 project) → `lifecycle_state = 'prospect'` |

Default mode is **dry-run**; production apply used `--apply`.

### 1.3 Production apply

| Step | Detail |
|------|--------|
| Path | `scripts/apply-book62-via-vm.sh --apply` |
| Why VM | Cloud SQL uses a **private IP**; laptop `cloud-sql-proxy` cannot dial it. VM IAP + `--private-ip` proxy (same pattern as `pull-cloudsql-to-local.sh`). |
| Result | **COMMITTED** — see §2 |

### 1.4 Wrapper scripts

| Script | Purpose |
|--------|---------|
| `scripts/apply-book62-via-vm.sh` | Dry-run or apply on Cloud SQL via VM |
| `scripts/backup-and-apply-book62-cloudsql.sh` | Backup → delegate to VM apply |

---

## 2. Current production state (post-apply)

Verified on Cloud SQL 2026-06-05:

### 2.1 Project layer (`projects`)

| `account_status` | Count |
|------------------|------:|
| `Active` (Book62) | **58** |
| `inactive` | **122** |
| **Total** | **180** |

### 2.2 Legal client layer (`clients`)

| `lifecycle_state` | Count |
|-------------------|------:|
| `active` | **53** |
| `prospect` | **117** |
| **Total** | **170** |

**Why 53 active clients vs 58 active projects / ~51 canonical brands?**

- Book62 has **58 SBU/project rows** and **~51 canonical brands** (Leadership rows roll up to parent brands in the workbook).
- The database still has **separate `clients` rows** for some Leadership legal names (e.g. `AMNS Leadership`, `Honeywell Leadership`, `Vertiv Leadership`) instead of one row per canonical brand.
- Some active clients hold **both** Active and inactive child projects (e.g. `Nagarjuna Leadership` → `Nagarjuna Education` inactive + `Nagarjuna Leadership` Active).

### 2.3 Apply run metrics

| Metric | Value |
|--------|------:|
| Book62 rows loaded | 58 |
| Projects matched | 58 |
| Projects marked Active | 58 |
| Project metadata updated (RH / PH / region) | 53 |
| Projects marked inactive | 122 |
| Clients newly set active | 1 |
| Clients demoted to prospect | 64 |

---

## 3. Current Book62-active portfolio (58 projects)

Each row is one **project** (`projects` table). Finance, contracts, WFM, SLA, requisitions, and billing all hang off `project_id`.

| Project (account_name) | Client (official_name) | Region | Regional head | Status |
|------------------------|------------------------|--------|---------------|--------|
| ABB | ABB | South | Manish Malhotra | Active |
| Ambuja Cement | Ambuja Cement | West | Anjli | Active |
| AMNS | AMNS Leadership | West | Anjli | Active |
| AMNS Leadership | AMNS Leadership | West | Anjli | Active |
| Ashok Leyland | Ashok Leyland | South | Manish Malhotra | Active |
| Atomberg Technologies | Atomberg Technologies | West | Anjli | Active |
| Birla Paints | Birla Paints | West | Anjli | Active |
| BITS | BITS | South | Manish Malhotra | Active |
| Bridgestone | Bridgestone | West | Anjli | Active |
| CG Power | CG Power | North | Anjli | Active |
| CG Power Leadership | CG Power Leadership | North | Anjli | Active |
| DP World | DP World | West | Anjli | Active |
| Exclusive | Exclusive | Exclusive | Ashish | Active |
| Honeywell | Honeywell | South | Bapi Reddy | Active |
| Honeywell Leadership | Honeywell Leadership | South | Bapi | Active |
| HPE | HPE | South | Mahak | Active |
| Hyundai Motor | Hyundai Motor Leadership | West | Anjli | Active |
| Hyundai Motor Leadership | Hyundai Motor Leadership | West | Anjli | Active |
| Isuzu | Isuzu | South | Manish Malhotra | Active |
| Jindal Stainless | Jindal Stainless | North | Anjli | Active |
| LAAP India | LAAP India | South | Manish Malhotra | Active |
| Leap India | Leap India | West | Anjli | Active |
| Mahindra Finance | Mahindra Finance | West | Anjli | Active |
| Mahindra Holidays | Mahindra Holidays | West | Anjli | Active |
| Maruti Suzuki(MSIL) | Maruti Suzuki(MSIL) | North | Anjli | Active |
| Middle East | Middle East | Middle East | Amit Jain | Active |
| M&M | M&M Leadership | West | Anjli | Active |
| M&M Leadership | M&M Leadership | West | Anjli | Active |
| Nagarjuna Leadership | Nagarjuna Leadership | South | Manish Malhotra | Active |
| NeoSoft | NeoSoft | West | Anjli | Active |
| Optum | Optum | North | Ashish | Active |
| Pernod Ricard | Pernod Ricard | West | Anjli | Active |
| Pfizer | Pfizer | West | Anjli | Active |
| Pidilite | Pidilite | West | Anjli | Active |
| Proterial | Proterial | North | Anjli | Active |
| Quantiphi | Quantiphi | West | Rahul Khurana | Active |
| Reliance | Reliance | West | Anjli | Active |
| Royal Enfield | Royal Enfield Leadership | South | Manish Malhotra | Active |
| Royal Enfield Leadership | Royal Enfield Leadership | South | Manish Malhotra | Active |
| Saint Gobain | Saint Gobain | West | Anjli | Active |
| SBI Card | SBI Card | North | Anjli | Active |
| Schaeffler | Schaeffler | West | Anjli | Active |
| Siemens (Advatnta & GBS) | Siemens (Advatnta & GBS) | South | Manish Malhotra | Active |
| Siemens Energy | Siemens Energy | North | Anjli | Active |
| Siemens Healthnier | Siemens Healthnier | South | Manish Malhotra | Active |
| Siemens Leadership | Siemens Leadership | South | Manish Malhotra | Active |
| SKF India | SKF India | North | Anjli | Active |
| Sterling Tools | Sterling Tools Leadership | West | Anjli | Active |
| Subros Leadership | Subros Leadership | West | Anjli | Active |
| Subros Ltd | Subros Leadership | West | Anjli | Active |
| Tata Consumer | Tata Consumer | West | Anjli | Active |
| Tata Electronics | Tata Electronics | South | Manish Malhotra | Active |
| Tata Play | Tata Play | West | Anjli | Active |
| Tata Power | Tata Power | North | Anjli | Active |
| UniCharm | UniCharm | West | Anjli | Active |
| Vertiv | Vertiv Leadership | West | Anjli | Active |
| Vertiv Leadership | Vertiv Leadership | West | Anjli | Active |
| Wipro | Wipro | South | Ashish | Active |

---

## 4. How active projects connect to the rest of the data

```mermaid
flowchart TB
  Book62["Book62.xlsx\n58 rows"]
  Book62 --> Apply["apply_book62_portfolio_alignment.py"]
  Apply --> Projects["projects\naccount_status Active/inactive"]
  Apply --> Clients["clients\nlifecycle_state active/prospect"]

  Projects --> Contracts["project_contracts"]
  Projects --> Finance["records / finance ledger"]
  Projects --> WFM["wfm_hr_benchmarks\nwfm_resource_gaps"]
  Projects --> SLA["sla metrics"]
  Projects --> Req["requisitions / candidates"]
  Projects --> Billing["billing rows"]
  Projects --> Tasks["tasks"]

  Clients --> ClientsAPI["GET /clients\nlegal parent + nested projects"]
  Projects --> ProjectsAPI["GET /projects\nscoped flat list"]
  Projects --> StatsAPI["GET /stats/global\nstill counts ALL projects"]
```

| Downstream | Join key | Filtered by `account_status` today? |
|------------|----------|-------------------------------------|
| `project_contracts` | `project_id` | **No** — 27 contracts still on inactive projects |
| Finance `records` | `project_id` | **No** — inactive projects retain ~3,060 rows |
| `wfm_hr_benchmarks` | `project_id` | **No** — 12 inactive projects still have WFM rows |
| SLA definitions | `project_id` | **No** |
| Requisitions / candidates | `project_id` | Scoped by user project access, not status |
| `GET /clients` | `client_id` → projects | **Partial** — filters `clients.lifecycle_state`, not `projects.account_status` |
| Executive “clients” pill | `COUNT(projects)` | **No** — still shows **180**, not 58 |

**Important:** Alignment updated **status flags and org metadata** only. It did **not** delete or move finance, contracts, WFM, or SLA data. Inactive projects remain in the DB for audit.

---

## 5. Clients page UI analysis (`/clients`)

### 5.1 What the page actually loads

| Piece | Source |
|-------|--------|
| Client list | `GET /clients` → groups scoped `projects` under each `clients` row |
| Default filter | **Active only** → `clients.lifecycle_state !== 'prospect'` (`ClientsHub.tsx`) |
| Project stats (revenue, reqs) | `GET /stats/global` → `project_stats` by `project_id` |
| Display name | `clients.official_name` (legal client), not always the SBU `account_name` |

`GET /clients` returns **every scoped project** under each client — it does **not** strip projects where `account_status = 'inactive'`.

### 5.2 Expected vs actual on `/clients` (Active only)

| Expectation after Book62 | Actual in DB / UI |
|--------------------------|-------------------|
| ~51 canonical brands | **53** legal clients with `lifecycle_state = active` |
| Only Book62 SBUs visible | Inactive SBUs can still appear **under** an active parent (e.g. Nagarjuna Education under Nagarjuna Leadership) |
| Names match Book62 brands | Several cards use **Leadership** as the legal name (`AMNS Leadership`, `Hyundai Motor Leadership`, …) while Book62 canonical brand is the parent (AMNS, Hyundai Motor, …) |
| Prospect clients hidden | **Correct** — e.g. Ametek, Robert Bosch are `prospect` and **should not** appear with default “Active only” |

### 5.3 Screenshot you shared — important correction

The sidebar selection is **`/clients` (Clients)**, but the **table layout** in the screenshot (region sub-line, “Assign regional head”, revenue target, productivity in **lacs**, ideal HC columns) matches **`WorkforceManagement.tsx`** (`/workforce` or WFM route), **not** `ClientsHub` Overview / Table tabs.

| Screenshot name | In Book62 (58)? | DB `account_status` | DB `clients.lifecycle_state` | Verdict for Book62 scope |
|-----------------|-----------------|---------------------|------------------------------|--------------------------|
| Siemens Healthnier | Yes | Active | active | Correct |
| Hyundai Motor | Yes | Active | active (under Hyundai Motor Leadership client) | Correct |
| AMNS | Yes | Active | active | Correct |
| AMNS Leadership | Yes | Active | active | Correct |
| Honeywell Leadership | Yes | Active | active | Correct |
| Mahindra Finance | Yes | Active | active | Correct |
| Isuzu | Yes | Active | active | Correct |
| Royal Enfield Leadership | Yes | Active | active | Correct |
| Tata Electronics | Yes | Active | active | Correct |
| Vertiv | Yes | Active | active | Correct |
| NeoSoft | Yes | Active | active | Correct |
| **Ametek** | **No** | **inactive** | **prospect** | **Incorrect** — out of Book62 scope |
| **Robert Bosch** | **No** | **inactive** | **prospect** | **Incorrect** — out of Book62 scope |
| **Mahindra Holidays Leadership** | **No** (Book has Mahindra Holidays, not Leadership row) | **inactive** | **prospect** | **Incorrect** — demoted; should not show if filters respected |

**Root cause for the three incorrect rows:** `GET /wfm/data` joins `wfm_hr_benchmarks` → `projects` with **no** `account_status = 'Active'` filter. **12** inactive projects (including Ametek) still have WFM benchmark rows and appear in the WFM client table.

### 5.4 Summary verdict

| Surface | Aligned with Book62? | Notes |
|---------|---------------------|-------|
| **Database** `projects.account_status` | **Yes** | 58 Active / 122 inactive |
| **Database** `clients.lifecycle_state` | **Mostly** | 53 active legal clients; Leadership naming split |
| **`/clients` hub (Active only)** | **Mostly** | Hides prospect clients; may still show inactive SBUs under active parents; count 53 ≠ 51 brands |
| **WFM table (your screenshot)** | **No** | Still lists inactive / non-Book62 accounts that have WFM data |
| **Executive global stats pill** | **No** | Still counts all 180 projects |

---

## 6. Recommended follow-ups (not done in this pass)

1. **API filters** — Add `account_status=Active` (or `lifecycle_state=active`) to:
   - `GET /wfm/data`
   - `GET /stats/global` (or add `active_projects` count)
   - Optionally `GET /clients` project children list
2. **Client merge** — Consolidate Leadership legal rows under canonical brand `client_id` (AMNS, Honeywell, Vertiv, …) to match Book62 §2.1 groups.
3. **UI label** — Clients hub could show `account_status` badge per SBU and filter “Active portfolio only”.
4. **Reconcile contracts** — 27 `project_contracts` rows still reference inactive (non-Book) projects.

---

## 7. Rollback

If needed, restore from pre-change dump (local test first):

```bash
# Example: restore to local Docker for validation
pg_restore -h 127.0.0.1 -p 5432 -U tgddata -d tgddata \
  --clean --if-exists --no-owner --no-acl \
  /Users/arjun/Software/tagged_data_sql/tgddata-cloudsql-pre-book62-20260605075004.dump
```

Production rollback requires a controlled `pg_restore` or point-in-time recovery on Cloud SQL — coordinate with ops; do not run blindly against prod.

---

## 8. Quick reference commands

```bash
# Backup only
LOCAL_DUMP_DIR=/Users/arjun/Software/tagged_data_sql ./scripts/pull-cloudsql-to-local.sh

# Dry-run alignment on Cloud SQL
./scripts/apply-book62-via-vm.sh

# Apply alignment on Cloud SQL
./scripts/apply-book62-via-vm.sh --apply

# Local dry-run (Docker Postgres)
DATABASE_URL=postgresql+psycopg://tgddata:tgddata_dev@127.0.0.1:5432/tgddata \
  python3 backend/scripts/apply_book62_portfolio_alignment.py
```
