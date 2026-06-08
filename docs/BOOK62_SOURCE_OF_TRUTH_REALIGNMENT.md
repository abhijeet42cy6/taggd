# Book62.xlsx — source-of-truth realignment (matched to Cloud SQL)

**Generated:** 2026-06-05  
**Applied to Cloud SQL:** 2026-06-05 08:00 IST (`scripts/apply-book62-via-vm.sh --apply`)

**Pre-change backup (local):**
- `/Users/arjun/Software/tagged_data_sql/tgddata-cloudsql-pre-book62-20260605075004.dump`
- `/Users/arjun/Software/tagged_data_sql/tgddata-cloudsql-20260605074738.dump`

**Source files:**
- Master: `excel_files_imp/Book62.xlsx` (58 rows)
- Database: Cloud SQL `tgddata-pg-prod` (**180** projects per `/ready`)

---

## 1. Executive summary

| Layer | Count | Status (applied) |
|-------|------:|------------------|
| **Book62 portfolio (active)** | **58** projects / **51** canonical clients | `projects.account_status = 'Active'`, `clients.lifecycle_state = 'active'` |
| **Out of scope (inactive)** | **122** projects | `projects.account_status = 'inactive'`, linked clients → `lifecycle_state = 'prospect'` |
| **Total in DB** | **180** | |

**Apply run summary:** 58 matched Book62 rows; 53 projects received RH/PH/region metadata sync; 64 clients demoted to prospect; 1 client promoted to active (others were already active).

| Data on Book62 rows | Coverage |
|---------------------|----------|
| `project_contracts` | 34 / 58 |
| Finance ledger rows | 4356 total across 58 |
| WFM benchmarks | 38 / 58 projects |
| SLA metric definitions | 23 / 58 projects |

**Inactive (non-Book) projects** still hold **3,060** finance rows and **27** contract rows — retained for audit but excluded from executive scope.

---

## 2. Book62 → Cloud SQL — all 58 projects matched

**Proposed status:** `active` for all rows below. **RH/Region match** compares Book62 to current `projects.regional_head` / `projects.region`.

| # | Book62 Project | Canonical client | `project_id` | `client_id` | DB `account_name` | Match | Book RH → DB `regional_head` | RH | Book PH → DB heads | Book Region → DB `region` | Reg | Contract | Fin | WFM | SLA | Rec |
|---|----------------|------------------|-------------:|------------:|-------------------|-------|------------------------------|-----|-------------------|----------------------------------|-----|----------|----:|----:|----:|----:|
| 1 | Honeywell | Honeywell | 22 | 20 | Honeywell | exact | Bapi Reddy → Bapi Reddy | ok | Bapi Reddy → Bapi Reddy | South → South | ok | yes | 96 | 0 | 13 | 0 |
| 2 | Pfizer | Pfizer | 85 | 77 | Pfizer | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Usha Shetty | West → West | ok | yes | 96 | 1 | 0 | 0 |
| 3 | SKF India | SKF India | 46 | 43 | SKF India | exact | Anjli → Anjli Zutshi | ok | Archana Tarikha → Archan Tarika | North → North | ok | yes | 96 | 1 | 0 | 0 |
| 4 | Siemens (Advatnta & GBS) | Siemens (Advatnta & GBS) | 175 | 164 | Siemens (Advatnta & GBS) | exact | Manish Malhotra → — | — | Kunal Sehgal → — | South → — | db_empty | no | 24 | 0 | 0 | 0 |
| 5 | Siemens Energy | Siemens Energy | 176 | 165 | Siemens Energy | exact | Anjli → — | — | Archana Tarikha → — | North → — | db_empty | no | 24 | 0 | 0 | 0 |
| 6 | Pidilite | Pidilite | 61 | 57 | Pidilite | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 96 | 1 | 12 | 0 |
| 7 | Vertiv | Vertiv | 71 | 66 | Vertiv | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Priyam | West → West | ok | yes | 96 | 1 | 0 | 295 |
| 8 | Birla Paints | Birla Paints | 19 | 17 | Birla Paints | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 96 | 1 | 8 | 515 |
| 9 | Mahindra Holidays | Mahindra Holidays | 32 | 30 | Mahindra Holidays | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 96 | 1 | 8 | 0 |
| 10 | HPE | HPE | 20 | 18 | HPE | exact | Mahak → Mahak Kaura | ok | Jyoti Sarwan → Jyoti Sarwan | South → South | ok | yes | 96 | 1 | 30 | 0 |
| 11 | Isuzu | Isuzu | 54 | 51 | Isuzu | exact | Manish Malhotra → Manish Malhotra | ok | Satya → Satya Rautela | South → South | ok | yes | 96 | 1 | 0 | 0 |
| 12 | BITS | BITS | 11 | 10 | BITS | exact | Manish Malhotra → Manish Malhotra | ok | Krishna Pillai → Krishan Pillai | South → South | ok | yes | 96 | 1 | 5 | 0 |
| 13 | M&M | M&M | 58 | 55 | M&M | exact | Anjli → Anjli Zutshi | ok | Saurabh Kumar → Dhriti | West → West | ok | yes | 96 | 1 | 14 | 0 |
| 14 | Wipro | Wipro | 56 | 53 | Wipro | exact | Ashish → Manish Malhotra | mismatch | Subu → Subbramanyam | South → South | ok | yes | 96 | 1 | 8 | 0 |
| 15 | DP World | DP World | 21 | 19 | DP World | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 96 | 1 | 7 | 0 |
| 16 | AMNS | AMNS | 7 | 7 | AMNS | exact | Anjli → Anjli Zutshi | ok | Alifia Hirani → Alifia Hirani | West → West | ok | yes | 96 | 1 | 7 | 5807 |
| 17 | Tata Electronics | Tata Electronics | 48 | 45 | Tata Electronics | exact | Manish Malhotra → Manish Malhotra | ok | Satya → Krishna Pillai | South → South | ok | yes | 96 | 1 | 9 | 0 |
| 18 | Jindal Stainless | Jindal Stainless | 70 | 65 | Jindal Stainless | exact | Anjli → Anjli Zutshi | ok | Archana Tarikha → Archan Tarika | North → North | ok | no | 96 | 1 | 0 | 0 |
| 19 | Schaeffler | Schaeffler | 73 | 67 | Schaeffler | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Priyam | West → West | ok | yes | 96 | 1 | 8 | 0 |
| 20 | Royal Enfield | Royal Enfield | 74 | 68 | Royal Enfield | exact | Manish Malhotra → Manish Malhotra | ok | Manish Malhotra → Naved Falak | South → South | ok | yes | 96 | 1 | 8 | 0 |
| 21 | SBI Card | SBI Card | 81 | 73 | SBI Card | exact | Anjli → Anjli Zutshi | ok | Archana Tarikha → Archan Tarika | North → North | ok | yes | 96 | 1 | 12 | 0 |
| 22 | Hyundai Motor | Hyundai Motor | 66 | 62 | Hyundai Motor | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Priyam | West → West | ok | no | 96 | 1 | 0 | 0 |
| 23 | Maruti Suzuki(MSIL) | Maruti Suzuki(MSIL) | 65 | 61 | Maruti Suzuki(MSIL) | exact | Anjli → Anjli Zutshi | ok | Archana Tarikha → Archan Tarika | North → North | ok | no | 96 | 1 | 0 | 0 |
| 24 | Tata Consumer | Tata Consumer | 82 | 74 | Tata Consumer | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 96 | 1 | 11 | 0 |
| 25 | Tata Play | Tata Play | 87 | 79 | Tata Play | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Alfia Hirani | West → West | ok | yes | 96 | 1 | 0 | 0 |
| 26 | Subros Ltd | Subros Ltd | 96 | 87 | Subros Ltd | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Archan Tarika | West → North | mismatch | no | 96 | 1 | 0 | 96 |
| 27 | Atomberg Technologies | Atomberg Technologies | 95 | 86 | Atomberg Technologies | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | no | 96 | 1 | 0 | 386 |
| 28 | Ambuja Cement | Ambuja Cement | 98 | 88 | Ambuja Cement | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Ankit Dave | West → West | ok | yes | 96 | 1 | 8 | 0 |
| 29 | Ashok Leyland | Ashok Leyland | 99 | 89 | Ashok Leyland | exact | Manish Malhotra → Manish Malhotra | ok | Krishna Pillai → Krishna Pillai | South → South | ok | yes | 96 | 1 | 9 | 0 |
| 30 | Bridgestone | Bridgestone | 100 | 90 | Bridgestone | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Priyam | West → West | ok | yes | 96 | 1 | 8 | 376 |
| 31 | Sterling Tools | Sterling Tools | 101 | 91 | Sterling Tools | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Archan Tarika | West → North | mismatch | yes | 96 | 1 | 6 | 204 |
| 32 | Pernod Ricard | Pernod Ricard | 104 | 93 | Pernod Ricard | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Archan Tarika | West → North | mismatch | yes | 96 | 1 | 8 | 0 |
| 33 | Nagarjuna Leadership | Nagarjuna | 78 | 70 | Nagarjuna Leadership | exact | Manish Malhotra → Manish Malhotra | ok | Parul Jain → Parul Jain | South → South | ok | no | 60 | 0 | 0 | 0 |
| 34 | ABB | ABB | 105 | 94 | ABB | exact | Manish Malhotra → Manish Malhotra | ok | Satya → Satya Rautela | South → South | ok | yes | 96 | 1 | 0 | 288 |
| 35 | Siemens Healthnier | Siemens Healthnier | 106 | 95 | Siemens Healthnier | exact | Manish Malhotra → Manish Malhotra | ok | Lekhana → Lekhana | South → South | ok | no | 60 | 0 | 0 | 174 |
| 36 | LEAP India | LEAP India | 107 | 96 | Leap India | case_insensitive | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 60 | 1 | 6 | 513 |
| 37 | UniCharm | UniCharm | 110 | 99 | UniCharm | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Archan Tarika | West → North | mismatch | yes | 60 | 1 | 0 | 87 |
| 38 | Optum | Optum | 38 | 36 | Optum | exact | Ashish → Ashish Kapur | ok | Ashihs → Kirti Jaitely | North → South | mismatch | yes | 60 | 0 | 0 | 0 |
| 39 | Saint Gobain | Saint Gobain | 114 | 103 | Saint Gobain | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 60 | 1 | 0 | 0 |
| 40 | Proterial | Proterial | 138 | 127 | Proterial | exact | Anjli → — | — | Archana Tarikha → — | North → — | db_empty | no | 48 | 0 | 0 | 0 |
| 41 | NeoSoft | NeoSoft | 113 | 102 | NeoSoft | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Archan Tarika | West → West | ok | yes | 60 | 1 | 0 | 0 |
| 42 | M&M Leadership | M&M | 59 | 55 | M&M Leadership | exact | Anjli → Anjli Zutshi | ok | Parul Jain → Parul Jain | West → West | ok | no | 60 | 0 | 0 | 0 |
| 43 | Honeywell Leadership | Honeywell | 23 | 21 | Honeywell Leadership | exact | Bapi → Bapi Reddy | ok | Parul Jain → Prul Jain | South → South | ok | no | 60 | 0 | 0 | 0 |
| 44 | Vertiv Leadership | Vertiv | 72 | 66 | Vertiv Leadership | exact | Anjli → Anjli Zutshi | ok | Parul Jain → Parul Jain | West → West | ok | no | 60 | 0 | 0 | 0 |
| 45 | Subros Leadership | Subros | 97 | 87 | Subros Leadership | exact | Anjli → Anjli Zutshi | ok | Parul Jain → Archan Tarika | West → North | mismatch | no | 60 | 0 | 0 | 0 |
| 46 | AMNS Leadership | AMNS | 8 | 7 | AMNS Leadership | exact | Anjli → Anjli Zutshi | ok | Alifia Hirani → Alifia Hirani | West → West | ok | no | 60 | 0 | 0 | 0 |
| 47 | Hyundai Motor Leadership | Hyundai Motor | 67 | 62 | Hyundai Motor Leadership | exact | Anjli → Anjli Zutshi | ok | Parul Jain → Parul Jain | West → West | ok | no | 60 | 0 | 0 | 0 |
| 48 | Siemens Leadership | Siemens | 44 | 41 | Siemens Leadership | exact | Manish Malhotra → Manish Malhotra | ok | Parul Jain → Kunal Sehgal | South → South | ok | no | 60 | 0 | 0 | 0 |
| 49 | Royal Enfield Leadership | Royal Enfield | 75 | 68 | Royal Enfield Leadership | exact | Manish Malhotra → Manish Malhotra | ok | Parul Jain → Parul Jain | South → South | ok | no | 60 | 0 | 0 | 0 |
| 50 | CG Power | CG Power | 115 | 104 | CG Power | exact | Anjli → Anjli Zutshi | ok | Archana Tarikha → Anjli Zutshi | North → West | mismatch | yes | 60 | 1 | 0 | 206 |
| 51 | CG Power Leadership | CG Power | 178 | 167 | CG Power Leadership | exact | Anjli → — | — | Archana Tarikha → — | North → — | db_empty | no | 12 | 0 | 0 | 0 |
| 52 | Exclusive | Exclusive | 177 | 166 | Exclusive | exact | Ashish → — | — | Pankaj → — | Exclusive → — | db_empty | no | 24 | 0 | 0 | 0 |
| 53 | Middle East | Middle East | 112 | 101 | Middle East | exact | Amit Jain → Amit Jain | ok | Naved → Naved Falak | Middle East → Middle East | ok | no | 60 | 1 | 0 | 0 |
| 54 | Reliance | Reliance | 123 | 112 | Reliance | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Anjli Zutshi | West → West | ok | yes | 12 | 1 | 0 | 0 |
| 55 | Tata Power | Tata Power | 62 | 58 | Tata Power | exact | Anjli → Baljeet Singh | mismatch | Archana Tarikha → Baljeet Singh | North → West | mismatch | no | 96 | 0 | 7 | 0 |
| 56 | Quantiphi | Quantiphi | 180 | 169 | Quantiphi | exact | Rahul Khurana → — | — | Rahul Khurana → — | West → — | db_empty | no | 12 | 0 | 0 | 0 |
| 57 | Mahindra Finance | Mahindra Finance | 89 | 81 | Mahindra Finance | exact | Anjli → Anjli Zutshi | ok | Sudha Pandey → Geetu Lalwani | West → West | ok | yes | 96 | 1 | 7 | 0 |
| 58 | LAAP India | LAAP India | 124 | 113 | LAAP India | exact | Manish Malhotra → Manish Malhotra | ok | Manish Malhotra → Manish Malhotra | South → South | ok | no | 12 | 0 | 0 | 0 |

### 2.1 Canonical client groups (50 brands, 58 project rows)

| Canonical client | Book62 project rows | # |
|------------------|---------------------|----:|
| ABB | ABB | 1 |
| Ambuja Cement | Ambuja Cement | 1 |
| AMNS | AMNS; AMNS Leadership | 2 |
| Ashok Leyland | Ashok Leyland | 1 |
| Atomberg Technologies | Atomberg Technologies | 1 |
| Birla Paints | Birla Paints | 1 |
| BITS | BITS | 1 |
| Bridgestone | Bridgestone | 1 |
| CG Power | CG Power; CG Power Leadership | 2 |
| DP World | DP World | 1 |
| Exclusive | Exclusive | 1 |
| Honeywell | Honeywell; Honeywell Leadership | 2 |
| HPE | HPE | 1 |
| Hyundai Motor | Hyundai Motor; Hyundai Motor Leadership | 2 |
| Isuzu | Isuzu | 1 |
| Jindal Stainless | Jindal Stainless | 1 |
| LAAP India | LAAP India | 1 |
| LEAP India | LEAP India | 1 |
| M&M | M&M; M&M Leadership | 2 |
| Mahindra Finance | Mahindra Finance | 1 |
| Mahindra Holidays | Mahindra Holidays | 1 |
| Maruti Suzuki(MSIL) | Maruti Suzuki(MSIL) | 1 |
| Middle East | Middle East | 1 |
| Nagarjuna | Nagarjuna Leadership | 1 |
| NeoSoft | NeoSoft | 1 |
| Optum | Optum | 1 |
| Pernod Ricard | Pernod Ricard | 1 |
| Pfizer | Pfizer | 1 |
| Pidilite | Pidilite | 1 |
| Proterial | Proterial | 1 |
| Quantiphi | Quantiphi | 1 |
| Reliance | Reliance | 1 |
| Royal Enfield | Royal Enfield; Royal Enfield Leadership | 2 |
| Saint Gobain | Saint Gobain | 1 |
| SBI Card | SBI Card | 1 |
| Schaeffler | Schaeffler | 1 |
| Siemens | Siemens Leadership | 1 |
| Siemens (Advatnta & GBS) | Siemens (Advatnta & GBS) | 1 |
| Siemens Energy | Siemens Energy | 1 |
| Siemens Healthnier | Siemens Healthnier | 1 |
| SKF India | SKF India | 1 |
| Sterling Tools | Sterling Tools | 1 |
| Subros | Subros Leadership | 1 |
| Subros Ltd | Subros Ltd | 1 |
| Tata Consumer | Tata Consumer | 1 |
| Tata Electronics | Tata Electronics | 1 |
| Tata Play | Tata Play | 1 |
| Tata Power | Tata Power | 1 |
| UniCharm | UniCharm | 1 |
| Vertiv | Vertiv; Vertiv Leadership | 2 |
| Wipro | Wipro | 1 |

### 2.2 Metadata drift on Book62 rows (fix on sync)

- **RH mismatch:** 2 rows (Book short name vs DB full name — overwrite from Book62 on sync)
- **Region mismatch:** 8 rows
- **No contract row:** 24 Book62 projects (finance may still exist)

<details><summary>RH mismatches (sample)</summary>

| Project | Book RH | DB regional_head |
|---------|---------|------------------|
| Wipro | Ashish | Manish Malhotra |
| Tata Power | Anjli | Baljeet Singh |
</details>

<details><summary>Region mismatches</summary>

| Project | Book Region | DB region |
|---------|-------------|-----------|
| Subros Ltd | West | North |
| Sterling Tools | West | North |
| Pernod Ricard | West | North |
| UniCharm | West | North |
| Optum | North | South |
| Subros Leadership | West | North |
| CG Power | North | West |
| Tata Power | North | West |
</details>

<details><summary>Book62 rows without contract</summary>

| Project | Finance rows |
|---------|-------------:|
| Siemens (Advatnta & GBS) | 24 |
| Siemens Energy | 24 |
| Jindal Stainless | 96 |
| Hyundai Motor | 96 |
| Maruti Suzuki(MSIL) | 96 |
| Subros Ltd | 96 |
| Atomberg Technologies | 96 |
| Nagarjuna Leadership | 60 |
| Siemens Healthnier | 60 |
| Proterial | 48 |
| M&M Leadership | 60 |
| Honeywell Leadership | 60 |
| Vertiv Leadership | 60 |
| Subros Leadership | 60 |
| AMNS Leadership | 60 |
| Hyundai Motor Leadership | 60 |
| Siemens Leadership | 60 |
| Royal Enfield Leadership | 60 |
| CG Power Leadership | 12 |
| Exclusive | 24 |
| Middle East | 60 |
| Tata Power | 96 |
| Quantiphi | 12 |
| LAAP India | 12 |
</details>

---

## 3. Out of scope — 121 projects **not in Book62** (mark `inactive`)

These accounts exist in Cloud SQL but are **absent from Book62**. Recommended: `projects.account_status = inactive`, `clients.lifecycle_state = archived` (or `prospect` where appropriate). Data (finance, contracts) is **not deleted** — only excluded from portfolio KPIs.

| `project_id` | `account_name` | `client_id` | `official_name` | lifecycle | current status | Contract | Fin | WFM | SLA | Rec | → Proposed |
|-------------:|----------------|------------:|-----------------|-----------|----------------|----------|----:|----:|----:|----:|------------|
| 140 | Ace Designers | 129 | Ace Designers | active | — | no | 60 | 0 | 0 | 0 | **inactive** |
| 144 | Allocable | 133 | Allocable | active | — | no | 0 | 1 | 0 | 0 | **inactive** |
| 143 | Arvind | 132 | Arvind | active | — | no | 0 | 0 | 0 | 0 | **inactive** |
| 121 | Arvind Smartspaces | 110 | Arvind Smartspaces | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 164 | Atomberg | 153 | Atomberg | active | — | yes | 0 | 0 | 49 | 0 | **inactive** |
| 122 | Autofit | 111 | Autofit | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 117 | Banswara | 106 | Banswara | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 129 | Bench | 118 | Bench | active | — | no | 12 | 0 | 0 | 0 | **inactive** |
| 139 | Carplai | 128 | Carplai | active | — | yes | 60 | 0 | 0 | 0 | **inactive** |
| 141 | Century Link | 130 | Century Link | active | — | no | 36 | 0 | 0 | 0 | **inactive** |
| 126 | Common | 115 | Common | active | — | no | 36 | 0 | 0 | 0 | **inactive** |
| 170 | Epack Petroleum | 159 | Epack Petroleum | active | — | yes | 0 | 0 | 0 | 0 | **inactive** |
| 118 | Gala Precision | 107 | Gala Precision | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 108 | HPE Leadership | 97 | HPE Leadership | active | Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 161 | Hyundai | 150 | Hyundai | active | — | yes | 0 | 0 | 8 | 764 | **inactive** |
| 179 | Hyundai Leadership | 168 | Hyundai Leadership | active | — | no | 12 | 0 | 0 | 0 | **inactive** |
| 151 | ISUZU (UD Trucks) | 140 | ISUZU (UD Trucks) | active | — | no | 0 | 0 | 8 | 276 | **inactive** |
| 119 | ITW India | 108 | ITW India | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 173 | Indosol Solar | 162 | Indosol Solar | active | — | yes | 0 | 0 | 0 | 0 | **inactive** |
| 27 | Ingram Micro | 25 | Ingram Micro | active | Active | yes | 96 | 1 | 8 | 0 | **inactive** |
| 134 | JINDAL STAINLESS Leadership | 123 | JINDAL STAINLESS Leadership | active | — | no | 60 | 0 | 0 | 0 | **inactive** |
| 159 | Jindal | 148 | Jindal | active | — | yes | 0 | 0 | 8 | 0 | **inactive** |
| 76 | Jindal Leadership | 69 | Jindal Leadership | active | Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 132 | Kale Logistics | 121 | Kale Logistics | active | — | no | 0 | 0 | 0 | 0 | **inactive** |
| 133 | L&T (New) | 122 | L&T (New) | active | — | no | 60 | 0 | 0 | 0 | **inactive** |
| 169 | M2P Solutions | 158 | M2P Solutions | active | — | yes | 0 | 0 | 0 | 0 | **inactive** |
| 109 | Mahindra Holidays Leadership | 98 | Mahindra Holidays Leadership | active | Active | no | 60 | 0 | 0 | 0 | **inactive** |
| 162 | Maruti Suzuki | 151 | Maruti Suzuki | active | — | yes | 0 | 0 | 8 | 620 | **inactive** |
| 116 | Metglas | 105 | Metglas | active | Active | yes | 60 | 1 | 0 | 21 | **inactive** |
| 130 | NCC | 119 | NCC | active | — | no | 0 | 0 | 0 | 0 | **inactive** |
| 131 | Nagarjuna | 120 | Nagarjuna | active | — | no | 0 | 1 | 0 | 0 | **inactive** |
| 77 | Nagarjuna Education | 70 | Nagarjuna Leadership | active | Active | yes | 0 | 0 | 0 | 0 | **inactive** |
| 127 | New Sales + Mining | 116 | New Sales + Mining | active | — | no | 84 | 0 | 0 | 0 | **inactive** |
| 84 | P&G | 76 | P&G | active | Active | no | 96 | 0 | 5 | 0 | **inactive** |
| 146 | Pfizer (FLM/RBM) | 135 | Pfizer (FLM/RBM) | active | — | no | 0 | 0 | 6 | 0 | **inactive** |
| 147 | Pfizer (FS & FLM) | 136 | Pfizer (FS & FLM) | active | — | no | 0 | 0 | 2 | 0 | **inactive** |
| 150 | Pfizer (FS & FLM) (Chennai) | 139 | Pfizer (FS & FLM) (Chennai) | active | — | no | 0 | 0 | 2 | 0 | **inactive** |
| 148 | Pfizer (FS) | 137 | Pfizer (FS) | active | — | no | 0 | 0 | 7 | 0 | **inactive** |
| 149 | Pfizer (FS/FLM/RBM) | 138 | Pfizer (FS/FLM/RBM) | active | — | no | 0 | 0 | 7 | 0 | **inactive** |
| 136 | Pfizer Leadership | 125 | Pfizer Leadership | active | — | no | 60 | 0 | 0 | 0 | **inactive** |
| 120 | Primetals Technologies | 109 | Primetals Technologies | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 166 | SKF | 155 | SKF | active | — | no | 0 | 0 | 14 | 0 | **inactive** |
| 167 | SKF Auto | 156 | SKF Auto | active | — | no | 0 | 0 | 14 | 0 | **inactive** |
| 168 | SKF Industrial | 157 | SKF Industrial | active | — | no | 0 | 0 | 14 | 0 | **inactive** |
| 135 | SUZUKI R&D Leadership | 124 | SUZUKI R&D Leadership | active | — | no | 60 | 0 | 0 | 0 | **inactive** |
| 43 | Siemens | 41 | Siemens Leadership | active | Active | yes | 84 | 2 | 0 | 0 | **inactive** |
| 154 | Siemens - Advanta | 143 | Siemens - Advanta | active | — | no | 0 | 0 | 11 | 0 | **inactive** |
| 155 | Siemens - Energy | 144 | Siemens - Energy | active | — | no | 0 | 0 | 11 | 0 | **inactive** |
| 153 | Siemens - GBS | 142 | Siemens - GBS | active | — | no | 0 | 0 | 11 | 0 | **inactive** |
| 102 | Sterling Tools Leadership | 91 | Sterling Tools Leadership | active | Active | no | 60 | 0 | 0 | 204 | **inactive** |
| 165 | Subros | 154 | Subros | active | — | yes | 0 | 0 | 8 | 0 | **inactive** |
| 92 | Suzuki R&D | 84 | Suzuki R&D_Leadership | active | Active | yes | 96 | 1 | 0 | 0 | **inactive** |
| 93 | Suzuki R&D_Leadership | 84 | Suzuki R&D_Leadership | active | Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 171 | Synergy Maritime | 160 | Synergy Maritime | active | — | yes | 0 | 0 | 0 | 0 | **inactive** |
| 163 | TATA Fiber | 152 | TATA Fiber | active | — | no | 0 | 0 | 7 | 0 | **inactive** |
| 160 | TATA Tele | 149 | TATA Tele | active | — | no | 0 | 0 | 7 | 0 | **inactive** |
| 137 | TCG Group | 126 | TCG Group | active | — | yes | 60 | 1 | 0 | 0 | **inactive** |
| 145 | Taggd Exclusive | 134 | Taggd Exclusive | active | — | no | 0 | 1 | 0 | 0 | **inactive** |
| 172 | Transport Corporation of India | 161 | Transport Corporation of India | active | — | yes | 0 | 0 | 0 | 0 | **inactive** |
| 111 | Triveni | 100 | Triveni | active | Active | yes | 60 | 0 | 0 | 0 | **inactive** |
| 142 | Triveni Eng | 131 | Triveni Eng | active | — | no | 0 | 0 | 0 | 0 | **inactive** |
| 152 | Vertiv Energy | 141 | Vertiv Energy | active | — | no | 0 | 0 | 8 | 0 | **inactive** |
| 125 | Viteos | 114 | Viteos | active | — | no | 36 | 0 | 0 | 0 | **inactive** |
| 158 | WTW (Ops & Tech) | 147 | WTW (Ops & Tech) | active | — | no | 0 | 0 | 7 | 0 | **inactive** |
| 156 | WTW (Ops) | 145 | WTW (Ops) | active | — | no | 0 | 0 | 5 | 0 | **inactive** |
| 157 | WTW (Tech) | 146 | WTW (Tech) | active | — | no | 0 | 0 | 5 | 0 | **inactive** |
| 174 | Yash Technologies | 163 | Yash Technologies | active | — | yes | 0 | 0 | 0 | 0 | **inactive** |
| 2 | ABFRL | 2 | ABFRL | prospect | Not Active | no | 36 | 0 | 0 | 0 | **inactive** |
| 1 | Accolite | 1 | Accolite | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 3 | Air India | 3 | Air India | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 4 | Alankit | 4 | Alankit | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 5 | Ametek | 5 | Ametek | prospect | Not Active | yes | 96 | 1 | 7 | 0 | **inactive** |
| 6 | Aptiv | 6 | Aptiv | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 39 | Atos | 37 | Atos | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 9 | Atul | 8 | Atul | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 34 | Bayer | 32 | Bayer | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 12 | Bitwise | 11 | Bitwise | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 15 | Centum | 13 | Centum | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 31 | Century Links | 29 | Century Links | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 17 | DDB MUDRA | 15 | DDB MUDRA | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 83 | DRL | 75 | DRL | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 47 | Dentsu | 44 | Dentsu | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 68 | Excelacom | 63 | Excelacom | prospect | Not Active | yes | 96 | 0 | 7 | 0 | **inactive** |
| 18 | FedEx | 16 | FedEx | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 24 | HTC Global | 22 | HTC Global | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 90 | IBM | 82 | IBM | prospect | Not Active | no | 36 | 0 | 0 | 0 | **inactive** |
| 25 | IPA | 23 | IPA | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 26 | Infocepts | 24 | Infocepts | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 88 | Intertrust (Viteos) | 80 | Intertrust (Viteos) | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 28 | Kotak Securities | 26 | Kotak Securities | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 29 | L&T | 27 | L&T | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 64 | L&T Energy | 60 | L&T Energy | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 30 | LSSSDC | 28 | LSSSDC | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 103 | M2P Fintech | 92 | M2P Fintech | prospect | Not Active | no | 96 | 1 | 0 | 0 | **inactive** |
| 33 | Metricstream | 31 | Metricstream | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 35 | Morning Star | 33 | Morning Star | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 91 | NCC Leadership | 83 | NCC Leadership | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 36 | Nielsen | 34 | Nielsen | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 60 | Nomiso | 56 | Nomiso | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 37 | Ognam | 35 | Ognam | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 40 | PAN | 38 | PAN | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 41 | Philips | 39 | Philips | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 13 | Robert Bosch | 12 | Robert Bosch_Leadership | prospect | Not Active | no | 96 | 0 | 7 | 0 | **inactive** |
| 14 | Robert Bosch_Leadership | 12 | Robert Bosch_Leadership | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 42 | Servify | 40 | Servify | prospect | Not Active | no | 0 | 0 | 5 | 0 | **inactive** |
| 94 | Shanti Informatics (Masters' Union) | 85 | Shanti Informatics (Masters' Union) | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 45 | Sirion Labs | 42 | Sirion Labs | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 79 | Sopra Steria | 71 | Sopra Steria | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 69 | Tata Marcopolo | 64 | Tata Marcopolo | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 63 | Tata Motors | 59 | Tata Motors | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 49 | Tata Technologies | 46 | Tata Technologies | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 80 | Tata Teleservices | 72 | Tata Teleservices | prospect | Not Active | no | 96 | 0 | 0 | 0 | **inactive** |
| 16 | Teleperformance | 14 | Teleperformance | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 50 | Thyssenkrupp | 47 | Thyssenkrupp | prospect | Not Active | no | 96 | 1 | 0 | 0 | **inactive** |
| 51 | Titan | 48 | Titan | prospect | Not Active | no | 96 | 0 | 7 | 0 | **inactive** |
| 52 | Tresvista | 49 | Tresvista | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 55 | Ultratech | 52 | Ultratech | prospect | Not Active | no | 96 | 0 | 14 | 0 | **inactive** |
| 57 | WTW | 54 | WTW | prospect | Not Active | no | 36 | 0 | 0 | 0 | **inactive** |
| 10 | Yocket | 9 | Yocket | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 86 | Zeo Fin | 78 | Zeo Fin | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |
| 53 | t-systems | 50 | t-systems | prospect | Not Active | no | 0 | 0 | 0 | 0 | **inactive** |

### 3.1 Inactive breakdown

| Category | Count |
|----------|------:|
| Total inactive (non-Book) | 121 |
| — with `project_contracts` | 27 |
| — with finance ledger | 44 |
| — `lifecycle_state = prospect` | 54 |
| — `lifecycle_state = active` | 67 |

By lifecycle: active=67, prospect=54

### 3.2 Inactive but contracted (review before demote)

These **27** accounts have contracts but are **not** in Book62 — merge into Book row, or retire contract deliberately.

| `project_id` | account_name | client | signed ACV (INR) | finance_rows |
|-------------:|--------------|--------|-----------------:|-------------:|
| 121 | Arvind Smartspaces | Arvind Smartspaces | 2000000 | 60 |
| 164 | Atomberg | Atomberg | 10300000 | 0 |
| 122 | Autofit | Autofit | 2000000 | 60 |
| 117 | Banswara | Banswara | 2000000 | 60 |
| 139 | Carplai | Carplai | 2000000 | 60 |
| 170 | Epack Petroleum | Epack Petroleum | 2000000 | 0 |
| 118 | Gala Precision | Gala Precision | 2000000 | 60 |
| 161 | Hyundai | Hyundai | 13700000 | 0 |
| 119 | ITW India | ITW India | 2000000 | 60 |
| 173 | Indosol Solar | Indosol Solar | 2000000 | 0 |
| 27 | Ingram Micro | Ingram Micro | 58400000 | 96 |
| 159 | Jindal | Jindal | 17600000 | 0 |
| 169 | M2P Solutions | M2P Solutions | 25000000 | 0 |
| 162 | Maruti Suzuki | Maruti Suzuki | 22100000 | 0 |
| 116 | Metglas | Metglas | 10190000 | 60 |
| 77 | Nagarjuna Education | Nagarjuna Leadership | 22100000 | 0 |
| 120 | Primetals Technologies | Primetals Technologies | 2000000 | 60 |
| 43 | Siemens | Siemens Leadership | 30400000 | 84 |
| 165 | Subros | Subros | 10300000 | 0 |
| 92 | Suzuki R&D | Suzuki R&D_Leadership | 3420000 | 96 |
| 171 | Synergy Maritime | Synergy Maritime | 2000000 | 0 |
| 137 | TCG Group | TCG Group | 13800000 | 60 |
| 172 | Transport Corporation of India | Transport Corporation of India | 2000000 | 0 |
| 111 | Triveni | Triveni | 2000000 | 60 |
| 174 | Yash Technologies | Yash Technologies | 2000000 | 0 |
| 5 | Ametek | Ametek | 9600000 | 96 |
| 68 | Excelacom | Excelacom | 9350000 | 96 |

---

## 4. Rearrangement actions

1. **Upsert Book62** — for each of 58 rows: set `regional_head`, `practice_head`, `region`, `account_status=active`, merge Leadership rows under canonical `client_id`.
2. **Demote 121 rows** — set `account_status=inactive` for every project in §3.
3. **Merge duplicates** before demote where Book62 has the truth name (`Atomberg` → `Atomberg Technologies`, `Hyundai` → `Hyundai Motor`, `Leap India` → `LEAP India`, etc.).
4. **Re-scope APIs** — `/stats/global`, Executive Overview, finance/SLA/WFM default filters: active Book62 portfolio only.
5. **Contracts** — keep on Book62 `project_id`s; review §3.2 contracted inactive accounts.

---

## 5. SQL to apply status (after review)

```sql
-- Active: projects listed in Book62 (58 account names)
UPDATE projects SET account_status = 'active'
WHERE account_name IN (SELECT ... FROM book62_import) OR lower(account_name) IN (...);

-- Inactive: all others
UPDATE projects SET account_status = 'inactive'
WHERE account_name NOT IN (SELECT ... FROM book62_import);
```

---

## Related docs

- `docs/ACTIVE_CLIENT_PROJECT_ANALYSIS_2026-06-04.md`
- `docs/CLIENTS_PROJECTS_CONTRACTS_DATA_MODEL.md`
- `docs/DATA_INGESTION_RUNBOOK.md`