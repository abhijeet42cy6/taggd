# Requisitions (`records`) and Candidates — How They Connect

**Purpose:** One place to see how **mandate / requisition rows** (`records`), **pipeline candidate rows** (`candidates`), and **enterprise identity** (`candidate_masters`) relate, including what happens to **legacy name-only fields on records** versus **new API-created candidates**.

**Related:** Implementation detail, APIs, and backfill mechanics live in `[CANDIDATE_MASTER_IMPLEMENTATION_REPORT.md](../CANDIDATE_MASTER_IMPLEMENTATION_REPORT.md)` at the repository root.

---

## 1. Glossary (three layers)


| Concept                          | Table                                          | Role                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requisition / mandate line**   | `records`                                      | One row per ingested tracker line: position, client req id, counts, `candidate_name` (legacy column), RPO fields, revenue, etc. Filled mainly by **Excel / processor ingest**.                                 |
| **Placement / pipeline row**     | `candidates`                                   | One row per person **on a specific requisition**, with full pipeline fields. Requires `project_id` + `**record_id`** (FK to `records.id`). Filled mainly by `**POST /candidates**` (and any future migration). |
| **Talent identity (enterprise)** | `candidate_masters` + `candidate_master_links` | Logical “person” across mandates. **Only** links to rows in `candidates`, not directly to `records`.                                                                                                           |


Important: `**records.candidate_name`** is a string on the mandate row. It is **not** a foreign key and does **not** automatically create or update a row in `**candidates`**.

---

## 2. Entity relationship (how tables link)

```mermaid
erDiagram
    projects ||--o{ records : "has mandates"
    projects ||--o{ candidates : "scopes pipeline"
    records ||--o{ candidates : "record_id FK"
    candidates ||--o| candidate_master_links : "at most one link"
    candidate_masters ||--o{ candidate_master_links : "one master many links"

    projects {
        int id PK
        string name
    }

    records {
        int id PK
        int project_id FK
        string candidate_name "legacy label on line"
        string position_title
        string client_req_id
        json additional_attributes
    }

    candidates {
        int id PK
        int project_id FK
        int record_id FK "mandate row"
        string client_candidate_id "unique per project"
        string full_name
        string email_id
    }

    candidate_masters {
        int id PK
        string display_name
        string email_normalized
    }

    candidate_master_links {
        int id PK
        int master_id FK
        int candidate_id FK "unique"
        string link_source
    }
```



**Reading the diagram:** Every `**candidates`** row **must** point at exactly one `**records`** row via `record_id`. The **Requisitions** UI reads `**records`**; the **Candidates** tab reads `**candidates`**. Masters hang off `**candidates**`, not off `**records**`.

---

## 3. Data paths: ingest vs modern pipeline

```mermaid
flowchart LR
    subgraph ingest["Ingest (Excel / processor)"]
        X[Spreadsheet row]
        X --> R[records row created or updated]
    end

    subgraph legacy["Legacy signal on mandate"]
        R --> CN["records.candidate_name\n(optional text)"]
    end

    subgraph modern["Modern pipeline"]
        API[POST /candidates]
        API --> C[candidates row\nproject_id + record_id]
        C --> L{ensure_master_link}
        L --> M[candidate_masters + link]
    end

    R -.->|"no automatic FK"| C
    CN -.->|"not synced to"| C
```



**Solid arrows:** implemented primary flows. **Dotted:** there is **no** automatic database trigger today that turns every `records.candidate_name` into a `candidates` row, or that keeps them in sync.

---

## 4. How requisition data and candidate data stay “linked”


| Link type                      | Mechanism                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structural (DB)**            | `candidates.record_id` → `records.id`. Deleting a record can cascade-delete its candidate rows (per ORM / FK `ondelete="CASCADE"`).                                                                   |
| **Human / client id**          | `candidates.client_candidate_id` is unique per **project** (not per record). Same person on two mandates → two `candidates` rows (two `record_id`s), optionally **one** `candidate_master` via links. |
| **Duplicate mandate identity** | `records` uses `fingerprint`, `excel_provided_id`, etc., for ingest dedupe; `candidates` has its own `fingerprint` / extras for pipeline-specific sync.                                               |


```mermaid
flowchart TB
    subgraph one_mandate["Single requisition line (records)"]
        R1[Record id = 1001\nposition_title, client_req_id, ...]
    end

    subgraph many_pipeline["Zero or many pipeline rows"]
        C1[Candidate → record_id 1001]
        C2[Candidate → record_id 1001]
    end

    subgraph identity["Enterprise view"]
        CM[Candidate master]
        CM --- C1
        CM --- C2
    end

    R1 --> C1
    R1 --> C2
```



A mandate can have **zero** `candidates` (common after ingest-only history) or **multiple** (e.g. several applicants for the same requisition).

---

## 5. Treatment: “untagged” names on `records` vs new candidate data

This section uses **“untagged”** to mean: **person-like text exists only on the requisition row** (`records.candidate_name` or JSON in `additional_attributes` / `requisition_extras`) **without** a corresponding `**candidates`** row.

```mermaid
flowchart TD
    Q{Does a row exist in\ncandidates for this mandate?}
    Q -->|No| U[Untagged / legacy-on-record\nVisible in Requisitions\nNot in Candidates tab\nNot in master backfill input]
    Q -->|Yes| T[Tagged pipeline row\nVisible where API + RBAC allow\nEligible for candidate_master_links]

    N[New data: POST /candidates\nwith record_id] --> T
    N --> B[Backfill masters:\nlink_source auto/migration]

    U --> MIG{Planned migration?}
    MIG -->|Insert Candidate from Record| T
    MIG -->|None| U
```




| Situation                                                                        | Where it shows                      | Master program                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| **Only** `records` + optional `candidate_name`                                   | Requisitions / reports on `records` | No `candidates` id → **no** `candidate_master_links`                               |
| `**candidates`** created via API                                                 | Candidates tab, detail APIs         | `**ensure_master_link_for_candidate**` on create; backfill for older unlinked rows |
| **Bulk migration** (future / custom): derive `Candidate` from `Record` + columns | Same as API-created                 | Run **master backfill** after candidates exist                                     |


---

## 6. Practical backfill order (two stages)

```mermaid
sequenceDiagram
    participant Ops as Operator / job
    participant Rec as records
    participant Cand as candidates
    participant Mast as candidate_masters + links

    Note over Ops,Mast: Stage A — only if DB has mandates but no pipeline rows
    Ops->>Rec: Read mandate rows + name/email from row or JSON
    Ops->>Cand: INSERT candidates (record_id, project_id, client_candidate_id, ...)

    Note over Ops,Mast: Stage B — requires candidates rows
    Ops->>Mast: POST /candidate-masters/backfill (or CLI)
    Mast->>Cand: For each unlinked candidate_id
    Mast->>Mast: Match or create master, insert link
```



1. **Stage A:** Create `**candidates`** from `**records**` (and/or from spreadsheet columns mapped once). Define idempotent keys (`client_candidate_id`, or synthetic stable ids) to avoid duplicates on re-run.
2. **Stage B:** Run **candidate master backfill** so `**candidate_master_links`** attach; this does **not** replace Stage A.

---

## 7. Summary

- `**records`** = requisition / mandate grain (ingest-heavy).  
- `**candidates**` = person-on-mandate grain (API-heavy today); **must** reference `records.id`.  
- `**candidate_masters`** = cross-mandate identity; **only** connected through `**candidates`**.  
- **Untagged** legacy = name (or similar) **only** on `records` → **not** part of the modern candidate or master tables until **Stage A** migration (or manual API) creates `**candidates`** rows.

---

*Document version: 1.0 — 2026-03-28*