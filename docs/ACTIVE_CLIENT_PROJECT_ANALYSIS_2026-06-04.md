# Active client–project analysis (Cloud SQL)

**Generated:** 2026-06-04

**Data source:** PostgreSQL `tgddata` (local Docker copy aligned to production project spine; Cloud Run `/ready` reported **180** projects at generation time vs **179** rows in this snapshot — treat counts as ±1 until re-synced).

---

## 1. Executive summary — your 55–60 / 80–100 vs the database

| Business expectation | Best matching DB definition | Count |
|--------------------|-----------------------------|------:|
| **~55–60 active clients** | `clients.lifecycle_state = active` **and** at least one `project_contracts` row | **59 clients** |
| Same, merged name variants (Honeywell + Honeywell Leadership → one group) | Canonical name rollup + active + contract | **59 canonical clients** |
| **~80–100 projects** under those clients | Project rows for active clients with contract | **67 project rows** |
| Same, including Leadership / sibling project rows under canonical name | Canonical active + contract (all project rows in group) | **77 project rows** |
| Broader “active with real ops data” (contract **or** finance **or** records **or** WFM) | Active + any operational fact | **88 clients, 98 projects** |
| Canonical rollup of above | Merge Leadership / (New) client name splits | **84 canonical clients, 104 projects** |

**Conclusion:** Stakeholder numbers (**55–60 clients**, **80–100 projects**) align closely with:

1. **59 active clients with a signed contract row** (not the 179 shown on Executive Overview).
2. **~77–104 project rows** depending on whether you count duplicate **Leadership** / parallel `projects` under the same brand.

The database also contains **~54 prospects**, **~65 active directory-only accounts** (no contract, no finance), and **~53 active accounts with finance but no contract** — these inflate `projects` to **179** but are outside the 55–60 operating set.

---

## 2. Full database inventory

| Entity | Count | Notes |
|--------|------:|-------|
| `projects` | 179 | Primary spine for finance, WFM, ingestion |
| `clients` (linked to projects) | 168 | 1 orphan client row with no project |
| — `active` | 114 | |
| — `prospect` | 54 | |
| `project_contracts` | 61 | 61 rows = 61 projects |

### Project buckets

| Bucket | Projects |
|--------|----------:|
| contract + finance | 49 |
| contract only | 12 |
| finance, no contract | 53 |
| directory only | 65 |

---

## 3. Why data feels disorganised

### 3.1 One project row per `account_name`, not per legal client

Ingest creates **`clients` + `projects` 1:1** via `ensure_project_client()` when directory/finance rows land. A second label (e.g. **Honeywell Leadership**) becomes a **second client_id** and **second project_id**, not a child SBU under one client.

- **11** DB `client_id`s have **2+** project rows (e.g. AMNS + AMNS Leadership, Siemens + Siemens Leadership).
- **11** canonical name groups map to **multiple `client_id`s** (Leadership split).

### 3.2 Contracts are a separate overlay (61 rows)

Only accounts matched from **Project Signup Renewal Detail** (`Contract Data` sheet) get `project_contracts`. Finance and directory can exist **without** a contract.

### 3.3 Prospects mixed into the spine

**54** `clients` are `lifecycle_state = prospect`. Many have **finance ledger rows** (filled `10_finance` template) but are **not** in the 59 active contracted set.

### 3.4 Executive Overview counts projects, labels them clients

`total_projects` = 179/180 → UI pill **"179 clients"** — see `docs/CLIENTS_PROJECTS_CONTRACTS_DATA_MODEL.md`.

---

## 4. Duplicate / same-brand client rows (merge candidates)

| Canonical brand | Separate `client_id` rows in DB | Contract on which row? |
|-----------------|--------------------------------|------------------------|
| CG Power | 2 | `CG Power` (id 104, 1 proj, contract); `CG Power Leadership` (id 167, 1 proj, no contract) |
| HPE | 2 | `HPE` (id 18, 1 proj, contract); `HPE Leadership` (id 97, 1 proj, no contract) |
| Honeywell | 2 | `Honeywell` (id 20, 1 proj, contract); `Honeywell Leadership` (id 21, 1 proj, no contract) |
| Hyundai | 2 | `Hyundai` (id 150, 1 proj, contract); `Hyundai Leadership` (id 168, 1 proj, no contract) |
| Jindal | 2 | `Jindal` (id 148, 1 proj, contract); `Jindal Leadership` (id 69, 1 proj, no contract) |
| L&T | 2 | `L&T` (id 27, 1 proj, no contract); `L&T (New)` (id 122, 1 proj, no contract) |
| Mahindra Holidays | 2 | `Mahindra Holidays` (id 30, 1 proj, contract); `Mahindra Holidays Leadership` (id 98, 1 proj, no contract) |
| NCC | 2 | `NCC` (id 119, 1 proj, no contract); `NCC Leadership` (id 83, 1 proj, no contract) |
| Nagarjuna | 2 | `Nagarjuna` (id 120, 1 proj, no contract); `Nagarjuna Leadership` (id 70, 2 proj, contract) |
| Pfizer | 2 | `Pfizer` (id 77, 1 proj, contract); `Pfizer Leadership` (id 125, 1 proj, no contract) |
| Subros | 2 | `Subros` (id 154, 1 proj, contract); `Subros Leadership` (id 87, 2 proj, no contract) |

**Remediation:** Merge Leadership variants under one `clients.id` and use `parent_project_id` / `org_unit_kind` for SBU rows (schema supports this; ingest currently does not).

---

## 5. Draft operating list — 59 active clients with contract

Use this as the working **55–60 client** list. Two prospects also have contract rows (**Ametek**, **Excelacom**) — excluded here because `lifecycle_state = prospect`.

| # | Client (`official_name`) | `client_id` | # Projects | Project `account_name`(s) | Charge code(s) | Finance rows |
|---|--------------------------|-------------|------------|---------------------------|----------------|--------------|
| 1 | ABB | 94 | 1 | ABB | TRP0182T00NE1GIA | 96 |
| 2 | Ambuja Cement | 88 | 1 | Ambuja Cement | TRP0147T00DE1GIA | 96 |
| 3 | AMNS Leadership | 7 | 2 | AMNS; AMNS Leadership | TRP0008T00ME1GIA; TRP0008T04ME1GIA | 156 |
| 4 | Arvind Smartspaces | 110 | 1 | Arvind Smartspaces | TRP0249T07SE1GIA | 60 |
| 5 | Ashok Leyland | 89 | 1 | Ashok Leyland | TRP0148T00DE1GIA | 96 |
| 6 | Atomberg | 153 | 1 | Atomberg | — | 0 |
| 7 | Autofit | 111 | 1 | Autofit | TRP0252T07DE1GIA | 60 |
| 8 | Banswara | 106 | 1 | Banswara | TRP0239T07DE1GIA | 60 |
| 9 | Birla Paints | 17 | 1 | Birla Paints | TRP0020T00DE1GIA | 96 |
| 10 | BITS | 10 | 1 | BITS | TRP0011T00EE1GIA | 96 |
| 11 | Bridgestone | 90 | 1 | Bridgestone | TRP0162T00DE1GIA | 96 |
| 12 | Carplai | 128 | 1 | Carplai | — | 60 |
| 13 | CG Power | 104 | 1 | CG Power | TRP0251T00DE1GIA | 60 |
| 14 | DP World | 19 | 1 | DP World | TRP0032T00RE1GIA | 96 |
| 15 | Epack Petroleum | 159 | 1 | Epack Petroleum | — | 0 |
| 16 | Gala Precision | 107 | 1 | Gala Precision | TRP0240T07DE1GIA | 60 |
| 17 | Honeywell | 20 | 1 | Honeywell | TRP0033T00KE1GIA | 96 |
| 18 | HPE | 18 | 1 | HPE | TRP0028T00TE1GIA | 96 |
| 19 | Hyundai | 150 | 1 | Hyundai | — | 0 |
| 20 | Indosol Solar | 162 | 1 | Indosol Solar | — | 0 |
| 21 | Ingram Micro | 25 | 1 | Ingram Micro | TRP0041T00TE1GIA | 96 |
| 22 | Isuzu | 51 | 1 | Isuzu | TRP0077T00DE1GIA | 96 |
| 23 | ITW India | 108 | 1 | ITW India | TRP0241T07DE1GIA | 60 |
| 24 | Jindal | 148 | 1 | Jindal | — | 0 |
| 25 | Leap India | 96 | 1 | Leap India | TRP0196T00RE1GIA | 60 |
| 26 | M&M Leadership | 55 | 2 | M&M; M&M Leadership | TRP0089T00AE1GIA; TRP0089T04AE1GIA | 156 |
| 27 | M2P Solutions | 158 | 1 | M2P Solutions | — | 0 |
| 28 | Mahindra Finance | 81 | 1 | Mahindra Finance | TRP0132T00BE1GIA | 96 |
| 29 | Mahindra Holidays | 30 | 1 | Mahindra Holidays | TRP0046T00YE1GIA | 96 |
| 30 | Maruti Suzuki | 151 | 1 | Maruti Suzuki | — | 0 |
| 31 | Metglas | 105 | 1 | Metglas | TRP0248T00DE1GIA | 60 |
| 32 | Nagarjuna Leadership | 70 | 2 | Nagarjuna Education; Nagarjuna Leadership | TRP0116T00EE1GIA; TRP0116T04EE1GIA | 60 |
| 33 | NeoSoft | 102 | 1 | NeoSoft | TRP0236T00TE1GIA | 60 |
| 34 | Optum | 36 | 1 | Optum | TRP0052T00TM1GIA | 60 |
| 35 | Pernod Ricard | 93 | 1 | Pernod Ricard | TRP0178T00DE1GIA | 96 |
| 36 | Pfizer | 77 | 1 | Pfizer | TRP0127T00PE1GIA | 96 |
| 37 | Pidilite | 57 | 1 | Pidilite | TRP0093T00DE1GIA | 96 |
| 38 | Primetals Technologies | 109 | 1 | Primetals Technologies | TRP0242T07DE1GIA | 60 |
| 39 | Reliance | 112 | 1 | Reliance | TRP0253T07TE1GIA | 12 |
| 40 | Royal Enfield Leadership | 68 | 2 | Royal Enfield; Royal Enfield Leadership | TRP0109T00AE1GIA; TRP0109T04AE1GIA | 156 |
| 41 | Saint Gobain | 103 | 1 | Saint Gobain | TRP0238T00DE1GIA | 60 |
| 42 | SBI Card | 73 | 1 | SBI Card | TRP0122T00BE1GIA | 96 |
| 43 | Schaeffler | 67 | 1 | Schaeffler | TRP0107T00DE1GIA | 96 |
| 44 | Siemens Leadership | 41 | 2 | Siemens; Siemens Leadership | TRP0065T00TE1GIA; TRP0065T04TE1GIA | 144 |
| 45 | SKF India | 43 | 1 | SKF India | TRP0067T00DM1GIA | 96 |
| 46 | Sterling Tools Leadership | 91 | 2 | Sterling Tools; Sterling Tools Leadership | TRP0163T00DE1GIA; TRP0163T04DE1GIA | 156 |
| 47 | Subros | 154 | 1 | Subros | — | 0 |
| 48 | Suzuki R&D_Leadership | 84 | 2 | Suzuki R&D; Suzuki R&D_Leadership | TRP0139T00DE1GIA; TRP0139T04DE1GIA | 96 |
| 49 | Synergy Maritime | 160 | 1 | Synergy Maritime | — | 0 |
| 50 | Tata Consumer | 74 | 1 | Tata Consumer | TRP0123T00OE1GIA | 96 |
| 51 | Tata Electronics | 45 | 1 | Tata Electronics | TRP0069T00WE1GIA | 96 |
| 52 | Tata Play | 79 | 1 | Tata Play | TRP0129T00CE1GIA | 96 |
| 53 | TCG Group | 126 | 1 | TCG Group | — | 60 |
| 54 | Transport Corporation of India | 161 | 1 | Transport Corporation of India | — | 0 |
| 55 | Triveni | 100 | 1 | Triveni | TRP0224T00GE1GIA | 60 |
| 56 | UniCharm | 99 | 1 | UniCharm | TRP0223T00DE1GIA | 60 |
| 57 | Vertiv Leadership | 66 | 2 | Vertiv; Vertiv Leadership | TRP0106T00TE1GIA; TRP0106T04TE1GIA | 156 |
| 58 | Wipro | 53 | 1 | Wipro | TRP0079T00TE1GIA | 96 |
| 59 | Yash Technologies | 163 | 1 | Yash Technologies | — | 0 |

---

## 6. Canonical view — 59 clients, 77 project rows (recommended for ~80–100 project budget)

Rolls up Leadership / (New) name splits. Includes sibling project rows (e.g. Honeywell + Honeywell Leadership) under one brand.

| # | Canonical client | DB name variant(s) | Projects | `account_name` | Contract? | Fin rows |
|---|------------------|--------------------|---------:|----------------|-----------|----------:|
| 1 | ABB | ABB | 1 | ABB | yes | 96 |
| 2 | Ambuja Cement | Ambuja Cement | 1 | Ambuja Cement | yes | 96 |
| 3 | AMNS | AMNS Leadership | 2 | AMNS | yes | 96 |
|  |  |  |  | AMNS Leadership | no | 60 |
| 4 | Arvind Smartspaces | Arvind Smartspaces | 1 | Arvind Smartspaces | yes | 60 |
| 5 | Ashok Leyland | Ashok Leyland | 1 | Ashok Leyland | yes | 96 |
| 6 | Atomberg | Atomberg | 1 | Atomberg | yes | 0 |
| 7 | Autofit | Autofit | 1 | Autofit | yes | 60 |
| 8 | Banswara | Banswara | 1 | Banswara | yes | 60 |
| 9 | Birla Paints | Birla Paints | 1 | Birla Paints | yes | 96 |
| 10 | BITS | BITS | 1 | BITS | yes | 96 |
| 11 | Bridgestone | Bridgestone | 1 | Bridgestone | yes | 96 |
| 12 | Carplai | Carplai | 1 | Carplai | yes | 60 |
| 13 | CG Power | CG Power; CG Power Leadership | 2 | CG Power | yes | 60 |
|  |  |  |  | CG Power Leadership | no | 12 |
| 14 | DP World | DP World | 1 | DP World | yes | 96 |
| 15 | Epack Petroleum | Epack Petroleum | 1 | Epack Petroleum | yes | 0 |
| 16 | Gala Precision | Gala Precision | 1 | Gala Precision | yes | 60 |
| 17 | Honeywell | Honeywell; Honeywell Leadership | 2 | Honeywell | yes | 96 |
|  |  |  |  | Honeywell Leadership | no | 60 |
| 18 | HPE | HPE; HPE Leadership | 2 | HPE | yes | 96 |
|  |  |  |  | HPE Leadership | no | 0 |
| 19 | Hyundai | Hyundai; Hyundai Leadership | 2 | Hyundai | yes | 0 |
|  |  |  |  | Hyundai Leadership | no | 12 |
| 20 | Indosol Solar | Indosol Solar | 1 | Indosol Solar | yes | 0 |
| 21 | Ingram Micro | Ingram Micro | 1 | Ingram Micro | yes | 96 |
| 22 | Isuzu | Isuzu | 1 | Isuzu | yes | 96 |
| 23 | ITW India | ITW India | 1 | ITW India | yes | 60 |
| 24 | Jindal | Jindal; Jindal Leadership | 2 | Jindal | yes | 0 |
|  |  |  |  | Jindal Leadership | no | 0 |
| 25 | Leap India | Leap India | 1 | Leap India | yes | 60 |
| 26 | M&M | M&M Leadership | 2 | M&M | yes | 96 |
|  |  |  |  | M&M Leadership | no | 60 |
| 27 | M2P Solutions | M2P Solutions | 1 | M2P Solutions | yes | 0 |
| 28 | Mahindra Finance | Mahindra Finance | 1 | Mahindra Finance | yes | 96 |
| 29 | Mahindra Holidays | Mahindra Holidays; Mahindra Holidays Leadership | 2 | Mahindra Holidays | yes | 96 |
|  |  |  |  | Mahindra Holidays Leadership | no | 60 |
| 30 | Maruti Suzuki | Maruti Suzuki | 1 | Maruti Suzuki | yes | 0 |
| 31 | Metglas | Metglas | 1 | Metglas | yes | 60 |
| 32 | Nagarjuna | Nagarjuna; Nagarjuna Leadership | 3 | Nagarjuna | no | 0 |
|  |  |  |  | Nagarjuna Education | yes | 0 |
|  |  |  |  | Nagarjuna Leadership | no | 60 |
| 33 | NeoSoft | NeoSoft | 1 | NeoSoft | yes | 60 |
| 34 | Optum | Optum | 1 | Optum | yes | 60 |
| 35 | Pernod Ricard | Pernod Ricard | 1 | Pernod Ricard | yes | 96 |
| 36 | Pfizer | Pfizer; Pfizer Leadership | 2 | Pfizer | yes | 96 |
|  |  |  |  | Pfizer Leadership | no | 60 |
| 37 | Pidilite | Pidilite | 1 | Pidilite | yes | 96 |
| 38 | Primetals Technologies | Primetals Technologies | 1 | Primetals Technologies | yes | 60 |
| 39 | Reliance | Reliance | 1 | Reliance | yes | 12 |
| 40 | Royal Enfield | Royal Enfield Leadership | 2 | Royal Enfield | yes | 96 |
|  |  |  |  | Royal Enfield Leadership | no | 60 |
| 41 | Saint Gobain | Saint Gobain | 1 | Saint Gobain | yes | 60 |
| 42 | SBI Card | SBI Card | 1 | SBI Card | yes | 96 |
| 43 | Schaeffler | Schaeffler | 1 | Schaeffler | yes | 96 |
| 44 | Siemens | Siemens Leadership | 2 | Siemens | yes | 84 |
|  |  |  |  | Siemens Leadership | no | 60 |
| 45 | SKF India | SKF India | 1 | SKF India | yes | 96 |
| 46 | Sterling Tools | Sterling Tools Leadership | 2 | Sterling Tools | yes | 96 |
|  |  |  |  | Sterling Tools Leadership | no | 60 |
| 47 | Subros | Subros; Subros Leadership | 3 | Subros | yes | 0 |
|  |  |  |  | Subros Leadership | no | 60 |
|  |  |  |  | Subros Ltd | no | 96 |
| 48 | Suzuki R&D_Leadership | Suzuki R&D_Leadership | 2 | Suzuki R&D | yes | 96 |
|  |  |  |  | Suzuki R&D_Leadership | no | 0 |
| 49 | Synergy Maritime | Synergy Maritime | 1 | Synergy Maritime | yes | 0 |
| 50 | Tata Consumer | Tata Consumer | 1 | Tata Consumer | yes | 96 |
| 51 | Tata Electronics | Tata Electronics | 1 | Tata Electronics | yes | 96 |
| 52 | Tata Play | Tata Play | 1 | Tata Play | yes | 96 |
| 53 | TCG Group | TCG Group | 1 | TCG Group | yes | 60 |
| 54 | Transport Corporation of India | Transport Corporation of India | 1 | Transport Corporation of India | yes | 0 |
| 55 | Triveni | Triveni | 1 | Triveni | yes | 60 |
| 56 | UniCharm | UniCharm | 1 | UniCharm | yes | 60 |
| 57 | Vertiv | Vertiv Leadership | 2 | Vertiv | yes | 96 |
|  |  |  |  | Vertiv Leadership | no | 60 |
| 58 | Wipro | Wipro | 1 | Wipro | yes | 96 |
| 59 | Yash Technologies | Yash Technologies | 1 | Yash Technologies | yes | 0 |

---

## 7. Accounts outside the 59 (why they inflate totals)

### 7.1 Active, finance loaded, no contract (25+ accounts)

Examples: P&G, Tata Power, FedEx, L&T Energy, Atomberg Technologies (duplicate `Atomberg` vs contracted `Atomberg`), Jindal Stainless, etc. Finance ingest resolved these to `projects` but contract workbook did not.

### 7.2 Prospects with heavy finance (not in 59)

| Prospect | Finance rows | Contract? |
|----------|-------------:|-----------|
| Ametek | 96 | yes |
| DRL | 96 | no |
| Excelacom | 96 | yes |
| FedEx | 96 | no |
| L&T Energy | 96 | no |
| M2P Fintech | 96 | no |
| Nomiso | 96 | no |
| Robert Bosch_Leadership | 96 | no |
| Tata Marcopolo | 96 | no |
| Tata Motors | 96 | no |
| Tata Power | 96 | no |
| Tata Teleservices | 96 | no |
| Thyssenkrupp | 96 | no |
| Titan | 96 | no |
| Ultratech | 96 | no |
| ABFRL | 36 | no |
| IBM | 36 | no |
| WTW | 36 | no |

### 7.3 Multi-project clients (DB `client_id` level)

| Client | Projects | Notes |
|--------|----------|-------|
| AMNS Leadership | 2 | AMNS, AMNS Leadership (1 with contract) |
| Hyundai Motor Leadership | 2 | Hyundai Motor, Hyundai Motor Leadership (0 with contract) |
| M&M Leadership | 2 | M&M, M&M Leadership (1 with contract) |
| Nagarjuna Leadership | 2 | Nagarjuna Education, Nagarjuna Leadership (1 with contract) |
| Robert Bosch_Leadership | 2 | Robert Bosch, Robert Bosch_Leadership (0 with contract) |
| Royal Enfield Leadership | 2 | Royal Enfield, Royal Enfield Leadership (1 with contract) |
| Siemens Leadership | 2 | Siemens, Siemens Leadership (1 with contract) |
| Sterling Tools Leadership | 2 | Sterling Tools, Sterling Tools Leadership (1 with contract) |
| Subros Leadership | 2 | Subros Leadership, Subros Ltd (0 with contract) |
| Suzuki R&D_Leadership | 2 | Suzuki R&D, Suzuki R&D_Leadership (1 with contract) |
| Vertiv Leadership | 2 | Vertiv, Vertiv Leadership (1 with contract) |

---

## 8. Recommended operating definitions going forward

| Use case | Filter |
|----------|--------|
| **Executive client count (55–60)** | `active` + `EXISTS project_contracts` → **59** |
| **Project count (80–100)** | Same clients, all `projects` under canonical brand → **77**; or active + ops data → **98–104** |
| **Exclude from KPIs** | `prospect`, `directory_only`, `finance_no_contract` unless promoted |
| **Data cleanup** | Merge Leadership duplicate `clients`; link SBUs via `parent_project_id`; align contract ingest for finance-only actives |

---

## 9. Verification SQL

```sql
-- Active clients with at least one contract (59)
SELECT COUNT(DISTINCT c.id)
FROM clients c
JOIN projects p ON p.client_id = c.id
JOIN project_contracts pc ON pc.project_id = p.id
WHERE c.lifecycle_state = 'active';

-- Project rows under those clients (67)
SELECT COUNT(*)
FROM projects p
JOIN clients c ON c.id = p.client_id
JOIN project_contracts pc ON pc.project_id = p.id
WHERE c.lifecycle_state = 'active';
```

---

## Related docs

- `docs/CLIENTS_PROJECTS_CONTRACTS_DATA_MODEL.md` — why 179 vs 61
- `docs/DATA_INGESTION_RUNBOOK.md` — ingest order