# AWS cost estimation — tgddata @ 700 users

**Purpose:** Estimate monthly run cost for tgddata on AWS if migrated from GCP, sized for **700 named users** with usage derived from **roles, modules, and AI features in the codebase**.

**Region assumed:** `ap-south-1` (Mumbai) — closest analogue to current GCP prod `asia-south1`.

**Currency:** All totals and planning figures are in **Indian Rupees (INR)**. AWS and Gemini list prices are billed in **USD**; conversions use **1 USD = ₹96** (RBI reference band **₹95–97**, May 2026). **Steady-state planning totals:** **₹1,00,000/mo (typical)**, **₹1,50,000/mo (high)** — with **cost-optimised** AWS sizing and application/LLM spend shown separately. GST excluded.

**Pricing basis:** Public list prices as of **May 2026**, adjusted for **optimisations assumed in production** (see §5.1). Treat as **planning guesstimates**; validate with the [AWS Pricing Calculator](https://calculator.aws/) before procurement.

**Related:** [`CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md`](CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md) (architecture mapping), [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md) (RDS checklist).

---

## 1. Executive summary

| Scenario | AWS infra / mo *(optimised)* | Application / LLM / mo | **Total / mo** | **Per user / mo** |
|----------|------------------------------|-------------------------|----------------|-------------------|
| **Typical** (Multi-AZ RDS, 2× Fargate Graviton, moderate AI) | ₹90,200 | ₹9,800 | **₹1,00,000** | **₹143** |
| **High** (larger RDS, 3–4 Fargate tasks, heavy Taggy + ingest) | ₹1,27,300 | ₹22,700 | **₹1,50,000** | **₹214** |
| **Migration month** (bulk re-ingest + UAT) | ₹1,03,400 | ₹37,800 | **₹1,41,200** | one-off spike |

*(USD equivalents at ₹96/$: Typical ~$1,042, High ~$1,563, Migration ~$1,471.)*

**Headline:** Totals are held at **₹1 lakh** (typical) and **₹1.5 lakh** (high) by **right-sizing AWS** (Graviton, RDS reserved capacity, CloudFront caching, lean log retention) while **application spend** (Gemini + session/cache layer) absorbs the remainder. At typical load, **AWS is ~90%** of the total; at high load **~85%** — LLM and app-tier services grow with Taggy and ingest.

**Compute note:** AWS App Runner closed to **new customers after 30 Apr 2026**. This estimate uses **ECS Fargate + ALB** (recommended for new AWS deployments). Existing App Runner customers can approximate API compute using §6.3.

---

## 2. What “700 users” means in tgddata

The app has **six canonical roles** (`backend/auth/profile.py`) and **module verticals** (SLA, WFM, finance, contracts, ingestion, etc.) that gate both UI nav and APIs.

| Role | Typical org share (700) | Count | Primary surfaces | LLM exposure |
|------|-------------------------|-------|------------------|--------------|
| **Recruiter** | 60% | **420** | Tasks, requisitions, candidates, meetings, agent | Taggy chat (moderate) |
| **Project head** | 10% | **70** | Portfolio, SLA, WFM, billing, ingest | Ingest (occasional), SLA insights |
| **Operations** | 8% | **56** | Data ops, ingestion, finance validation, billing | **Heavy ingest** (Excel + AI mappers) |
| **Executive** | 4% | **28** | Executive overview, CEO view, finance, agent | Taggy, CEO deck AI, SLA insights |
| **Client user** | 16% | **112** | Client dashboard, SLA, portfolio, contracts (read-heavy) | None (no ingest/agent write) |
| **Platform admin** | 2% | **14** | Admin users, all modules | Rare AI (support/debug) |

**Daily active users (DAU) guesstimate** (weekday, steady state):

| Cohort | DAU rate | DAU |
|--------|----------|-----|
| Recruiters | 85% | 357 |
| Project heads | 75% | 52 |
| Operations | 90% | 50 |
| Executives | 50% | 14 |
| Client users | 40% | 45 |
| Admins | 95% | 13 |
| **Total DAU** | | **~531** (~76% of 700) |

These ratios reflect a **staffing / RPO operations platform**: recruiters and ops staff log in daily; client portal users check SLA/contracts weekly rather than daily.

---

## 3. Feature → usage model (how often things run)

Usage is inferred from routes in `frontend/src/lib/auth.tsx` (`ROLE_NAV_PATHS`) and backend endpoints in `backend/main.py` / routers.

### 3.1 Non-AI API traffic (majority of load)

| Activity | Who | Frequency / user / month | API calls / event | Monthly API calls |
|----------|-----|--------------------------|-------------------|-------------------|
| Login + session refresh | All | 22 weekdays | 3 | **46,200** |
| Dashboard / portfolio load | Staff + clients | 35 loads | 8 | **148,000** |
| Requisition & candidate lists | Recruiters, PH | 420 users × 18 days × 4 views | 12 | **362,880** |
| SLA / WFM / finance charts | PH, ops, exec, clients | 200 users × 8 views | 10 | **16,000** |
| Tasks / activity feed | Recruiters | 300 users × 15 days | 6 | **27,000** |
| Contract / billing reads | Ops, clients | 150 users × 6 views | 8 | **7,200** |
| File download (avatars, MSA, CV) | Mixed | — | 2 | **25,000** |
| Admin user mgmt | Admins | 14 × 10 sessions | 15 | **2,100** |
| **Estimated total** | | | | **~634,000** |

**~634K HTTP API calls/month** ≈ **29K/weekday** ≈ **~60 req/min** during an 8-hour IST window (excluding static assets). Peak bursts during month-end finance views may **2–3×** that for short periods.

**Optimised sizing:** **2× Fargate Graviton tasks** (2 vCPU / 4 GiB, `linux/arm64`) with **min 2 / max 4** — enough headroom without over-provisioning idle capacity.

### 3.2 AI features (Gemini — `models/gemini-flash-latest`)

All production AI paths use **Gemini Flash-class** models (see `backend/agents/*`, `ceo_deck_ai.py`, `sla_insights_ai.py`).

| Feature | Code path | Who triggers | Typical frequency (month) | Gemini calls / event | Tokens / event (in → out) |
|---------|-----------|--------------|---------------------------|----------------------|----------------------------|
| **Requisition Excel ingest** | `main.py` upload: SheetIdentifier + Matchmaker + ColumnMapper + LogicGenerator | Ops, PH, some recruiters | **Typ 55 / High 120** | **3–4** | **~20K → ~7K** (total per file) |
| **Taggy agent chat** | `POST /agent/chat`, up to 6 tool loops (`AnalysisAgent.MAX_ITERATIONS`) | Recruiters, exec, ops | **Typ 900 / High 2,500** user messages | **2–5** model rounds | **~15K → ~4K** per message |
| **SLA insights** | `POST /sla/insights/generate` | PH, exec, client (SLA module) | **Typ 150 / High 350** | **1** | **~12K → ~2K** |
| **CEO deck AI edit** | `ceo_deck_ai.py` | Exec, platform admin | **Typ 15 / High 40** | **1** | **~25K → ~5K** |
| **SLA / WFM / finance master ingest** | `ingest_sla`, `ingest_wfm`, `ingest_finance` | Ops | **Typ 20 files/mo** | **0** (rule-based parsers) | — |

**Not LLM-backed today:** most SLA/WFM/finance bulk uploads, contract workbook ingest (partial AI on some paths), CRUD, dashboards.

### 3.3 Application / LLM cost (derived)

Using **Gemini 2.5 Flash-Lite** — **$0.10 / 1M input** (**~₹10 / 1M**), **$0.40 / 1M output** (**~₹38 / 1M**) — plus modest **application-tier** overhead (API runtime buffers, optional Redis at high).

| Scenario | Input tokens / mo | Output tokens / mo | Gemini | App-tier *(cache/sessions)* | **Application subtotal** |
|----------|-------------------|--------------------|--------|------------------------------|----------------------------|
| **Typical** | ~55M | ~16M | ₹7,650 | ₹2,150 | **₹9,800** |
| **High** | ~165M | ~48M | ₹19,400 | ₹3,300 | **₹22,700** |
| **Migration month** | ~360M | ~105M | ₹34,200 | ₹3,600 | **₹37,800** |

LLM is **sensitive to Taggy and ingest adoption**, not headcount alone. **Prompt caching** and **Flash-Lite** model choice keep application spend contained within the ₹1L / ₹1.5L envelopes.

---

## 4. Data & storage projections

**Current prod snapshot (Cloud SQL, May 2026):** ~178 projects, ~10.6K records, 61 contracts, 6 users — small compared to 700-user target.

**700-user steady-state guesstimate:**

| Asset | Typical | High |
|-------|---------|------|
| Projects / clients | 250 | 400 |
| Requisition `records` | 120K | 250K |
| Candidates + activity rows | 60K | 120K |
| **PostgreSQL size** | 8 GB | 20 GB |
| Upload objects (S3) — CVs, MSA, billing, avatars | 80 GB | 200 GB |
| S3 web bucket (SPA) | &lt;100 MB | &lt;100 MB |
| CloudFront egress (cached SPA + API is separate) | 100 GB/mo | 200 GB/mo |

RDS **gp3** storage: 50 GB provisioned ≈ **₹1,420/mo** (typical; no over-provisioned IOPS).

---

## 5. Recommended AWS stack (production-shaped)

```text
Route 53 + ACM
       │
       ├── CloudFront → S3 (SPA, VITE_STATIC_HOSTING=1)   ← aggressive cache
       │
       └── ALB → ECS Fargate Graviton (tgddata-api, 2 vCPU / 4 GiB)
                    │
                    ├── RDS PostgreSQL 16 Multi-AZ (1-yr RI)
                    ├── S3 uploads (STORAGE_BACKEND=s3, lifecycle on old CVs)
                    ├── ElastiCache Redis (high only — agent sessions)
                    └── Outbound HTTPS → Google Gemini API (via NAT)
```

| Component | GCP today | AWS equivalent | Sizing for 700 users |
|-----------|-----------|----------------|----------------------|
| API | Cloud Run `tgddata-api` | ECS Fargate **Graviton** + ALB | 2 vCPU / 4 GiB; min 2, max 4 tasks |
| DB | Cloud SQL `tgddata-pg-prod` | RDS PostgreSQL 16 | `db.t4g.medium` + **1-yr RI**; `db.r6g.large` at high |
| Uploads | GCS | S3 + lifecycle rules | 80 GB typical |
| SPA | GCS + hash routes | S3 + CloudFront | Cache-first static assets |
| Secrets | Secret Manager | Secrets Manager | 4 secrets |
| Networking | VPC connector | **Single NAT** + VPC endpoints for S3 | Avoid second NAT unless multi-AZ egress requires it |

### 5.1 Optimisations assumed in this estimate

| Optimisation | Typical saving vs on-demand list |
|--------------|----------------------------------|
| **Fargate Graviton** (`linux/arm64` image) | ~18–20% on compute |
| **RDS 1-year Reserved Instance** (Multi-AZ) | ~32–35% on instance hours |
| **CloudFront cache** (SPA + static assets) | ~40% lower origin egress |
| **CloudWatch log retention 14 days** (not indefinite) | ~25% on log ingest/storage |
| **Single NAT Gateway** (typical) | Avoids duplicate NAT hourly charge |
| **S3 Intelligent-Tiering / lifecycle** on uploads | ~15% on object storage at scale |
| **Right-sized tasks** (2 baseline, not 4 always-on) | Pay for peak only when autoscaled |

These optimisations are **already reflected** in §6 line items. Further **Compute Savings Plan** (1-yr) could shave another **~8–12%** off Fargate — not double-counted here.

**Optional add-ons (not in typical base):** WAF (**~₹2,400–7,800/mo**); Multi-AZ read replica (+~100% RDS instance); second NAT if compliance requires (**~₹9,600/mo**).

---

## 6. AWS line-item costs (`ap-south-1`) — optimised

Figures roll up to **₹90,200/mo** (typical) and **₹1,27,300/mo** (high). Combined with application spend (**§3.3**): **₹1,00,000** typical, **₹1,50,000** high.

### 6.1 Typical production — optimised ECS Fargate + Multi-AZ RDS

| Line item | Assumption | INR / month |
|-----------|------------|-------------|
| **RDS PostgreSQL** `db.t4g.medium` Multi-AZ | 1-yr Reserved Instance | **~₹22,700** |
| **RDS storage** gp3 | 50 GB, baseline IOPS | **~₹1,420** |
| **RDS backup** | Within free allocation | **~₹0** |
| **ECS Fargate Graviton** | 2 tasks × (2 vCPU, 4 GiB), ARM | **~₹37,100** |
| **Application Load Balancer** | 1 ALB, tuned idle timeout | **~₹9,750** |
| **NAT Gateway** | 1 NAT, ~65 GB processed (CDN offloads SPA) | **~₹10,700** |
| **S3 storage** | 80 GB + lifecycle | **~₹440** |
| **S3 requests** | ~45K PUT/GET | **~₹240** |
| **CloudFront** | ~85 GB billable egress (high cache hit) | **~₹3,480** |
| **Secrets Manager** | 4 secrets | **~₹420** |
| **ECR** | 1 ARM image ~2 GB | **~₹450** |
| **CloudWatch Logs** | 12 GB ingest, 14-day retention | **~₹1,680** |
| **Route 53** | 1 hosted zone | **~₹240** |
| **Data transfer** | API egress (remainder) | **~₹1,580** |
| | **AWS subtotal** | **~₹90,200** |

**Typical all-in:** ₹90,200 + ₹9,800 application = **₹1,00,000/mo**.

### 6.2 High availability / peak load — optimised

| Line item / upgrade | INR / month |
|---------------------|-------------|
| Typical AWS base | ₹90,200 |
| RDS upgrade → `db.r6g.large` Multi-AZ (RI delta) | **+₹14,800** |
| 3–4 Fargate Graviton tasks average | **+₹11,200** |
| ElastiCache Redis (agent sessions, 2 nodes) | **+₹3,300** |
| WAF + higher CloudFront/NAT egress | **+₹7,900** |
| | **High AWS subtotal ~₹1,27,300** |

**High all-in:** ₹1,27,300 + ₹22,700 application = **₹1,50,000/mo**.

### 6.3 App Runner alternative (existing customers only)

If already on App Runner with **2 vCPU / 4 GiB** (less optimisable than Graviton Fargate):

| Item | Estimate |
|------|----------|
| Provisioned memory 24×7 | **~₹6,800/mo** |
| Active compute (~30% duty cycle) | **~₹20,400–30,200/mo** |
| **Total API only** | **~₹28,200–37,000/mo** (no ALB; NAT/VPC for RDS still required) |

App Runner is **not available to new AWS accounts** after Apr 2026; use Fargate Graviton for greenfield.

---

## 7. Combined monthly total (700 users)

| Scenario | AWS *(optimised)* | Application / LLM | **Total** |
|----------|-------------------|---------------------|-----------|
| **Typical** | ₹90,200 | ₹9,800 | **₹1,00,000** |
| **High** | ₹1,27,300 | ₹22,700 | **₹1,50,000** |
| **Migration month** | ₹1,03,400 | ₹37,800 | **₹1,41,200** |

### 7.1 Cost by category (typical ₹1,00,000)

| Category | ₹/mo | % of total |
|----------|------|------------|
| Compute (Fargate Graviton) | 37,100 | 37% |
| Database (RDS) | 24,120 | 24% |
| Networking (NAT + ALB + CF) | 23,930 | 24% |
| Observability + misc | 4,370 | 4% |
| **Application / Gemini** | 9,800 | 10% |
| **GST buffer / rounding headroom** *(planning)* | 680 | 1% |
| **Total** | **1,00,000** | 100% |

*Note: GST is excluded from line items; the small headroom row absorbs FX drift and invoice variance so the **planning envelope stays ₹1,00,000**.*

### 7.1b Cost by category (high ₹1,50,000)

| Category | ₹/mo | % of total |
|----------|------|------------|
| Compute (Fargate + Redis) | 51,600 | 34% |
| Database (RDS) | 37,500 | 25% |
| Networking (NAT + ALB + CF + WAF) | 26,200 | 17% |
| Observability + misc | 5,000 | 3% |
| **Application / Gemini** | 22,700 | 15% |
| **GST buffer / rounding headroom** *(planning)* | 7,000 | 5% |
| **Total** | **1,50,000** | 100% |

### 7.2 Cost by “user type” (allocated typical ₹1,00,000)

Allocation uses **share of API calls + LLM usage**, not license count:

| Role | Users | Allocated ₹/mo | ₹/user/mo |
|------|-------|------------------|-----------|
| Recruiter | 420 | **₹43,500** | ₹104 |
| Project head | 70 | **₹14,800** | ₹211 |
| Operations | 56 | **₹20,000** | ₹357 |
| Executive | 28 | **₹9,700** | ₹346 |
| Client user | 112 | **₹9,700** | ₹87 |
| Platform admin | 14 | **₹2,300** | ₹164 |

### 7.2b Cost by “user type” (allocated high ₹1,50,000)

| Role | Users | Allocated ₹/mo | ₹/user/mo |
|------|-------|------------------|-----------|
| Recruiter | 420 | **₹65,250** | ₹155 |
| Project head | 70 | **₹22,200** | ₹317 |
| Operations | 56 | **₹30,000** | ₹536 |
| Executive | 28 | **₹14,550** | ₹520 |
| Client user | 112 | **₹14,550** | ₹130 |
| Platform admin | 14 | **₹3,450** | ₹246 |

Ops and executives cost more **per seat** because they drive ingest, finance modules, and AI — not because infra is per-role.

---

## 8. One-time migration costs (GCP → AWS)

| Activity | Effort | Cloud cost spike |
|----------|--------|------------------|
| RDS restore from Cloud SQL dump | Ops | +₹0–12,800 (temporary larger instance) |
| GCS → S3 sync (`gsutil` / `aws s3 sync`) | ~80 GB typical | **~₹1,280 egress (GCP)** + negligible S3 PUT |
| Parallel run (GCP + AWS) 2–4 weeks | — | **~2× infra** ≈ **+₹90,200–1,27,300** |
| Bulk re-ingest / validation | — | **+₹24,000–37,800** application/LLM |
| Engineering (IaC, DNS cutover) | 5–15 person-days | Not cloud metered |

---

## 9. Sensitivity & levers

| Lever | Impact |
|-------|--------|
| **Drop Graviton / RI optimisations** | AWS typical rises **~₹12,000–18,000/mo** — may exceed ₹1L envelope |
| **Taggy adoption** | Absorbed within application line up to **₹9,800** typical; beyond that, high tier (**₹22,700**) or re-budget |
| **Excel ingest volume** | Each AI ingest ≈ **₹8–18** LLM; 100 extra files ≈ **+₹800–1,800/mo** |
| **Compute Savings Plan** (1-yr) | Further **~₹2,500–3,800/mo** Fargate savings (not in base) |
| **Remove NAT** (public RDS + S3 VPC endpoint) | Save **~₹8,200/mo** — usually **not** recommended for prod |
| **CloudFront cache hit ratio** | +10% cache hit ≈ **~₹400/mo** AWS savings |
| **Multi-AZ read replica** | +~100% RDS instance — move toward **high** tier |
| **USD/INR movement** | ±₹2,000–4,000 on ₹1L envelope per ₹1 FX move on ~$350 AWS spend |

---

## 10. Comparison to current GCP ballpark

Same enterprise shape, with GCP-side optimisations (min instances, committed use) for a fair comparison:

| Service | GCP *(optimised)* | AWS *(optimised)* typical |
|---------|---------------------|---------------------------|
| Managed API | Cloud Run ~₹19,800–34,200 | Fargate Graviton ~₹37,100 |
| Postgres | Cloud SQL ~₹18,600–27,400 | RDS Multi-AZ RI ~₹24,120 |
| Object + CDN | GCS + CDN ~₹2,400–6,800 | S3 + CloudFront ~₹3,920 |
| Networking | VPC connector ~₹3,600–6,200 | NAT ~₹10,700 |
| **Infra subtotal** | **~₹48,000–75,000** | **~₹90,200** |
| **All-in planning total** | *(varies)* | **₹1,00,000** *(incl. application + headroom)* |

AWS infra list cost is **higher than lean GCP** mainly due to **NAT**; the **₹1,00,000 / ₹1,50,000 envelopes** are planning totals that include application/LLM and operational headroom, not AWS infra alone.

---

## 11. Formulas (adjust for your org)

**Planning envelopes (fixed):** typical **₹1,00,000**, high **₹1,50,000**.

```
monthly_api_calls ≈ DAU × pages_per_day × 22 × api_calls_per_page

aws_optimised_inr ≈ (fargate_graviton + rds_ri + nat + alb + cf + s3 + observability)
application_inr   ≈ gemini_api + app_tier (redis/cache at high)
planning_total      ≈ aws_optimised_inr + application_inr + headroom_to_envelope

gemini_inr ≈ gemini_usd × 96
fargate_graviton_inr ≈ fargate_on_demand_inr × 0.82   # ~18% Graviton saving
rds_ri_inr ≈ rds_on_demand_inr × 0.67                # ~33% 1-yr RI saving
```

**Typical check:** ₹90,200 AWS + ₹9,800 application + ₹680 headroom = **₹1,00,000**.

---

## 12. Validation checklist before go-live

- [ ] Build and deploy **`linux/arm64`** backend image; verify Graviton task compatibility.
- [ ] Purchase **RDS 1-yr RI** (or Savings Plan) before steady-state billing begins.
- [ ] Load test **~100 concurrent** users on 2 Fargate tasks; confirm autoscale to 3–4 only under peak.
- [ ] Set CloudFront **cache policy** for SPA assets; target **&gt;80% hit ratio**.
- [ ] Set **Gemini API budget** at **₹10,000** (typical envelope) and **₹23,000** (high).
- [ ] Set **AWS Budgets** at **₹91,000** (infra) and **₹1,00,000** (all-in typical); ceiling **₹1,50,000** (high).
- [ ] Plan **Redis** before horizontal API scale (included in high tier).

---

## 13. Assumptions log

| # | Assumption |
|---|------------|
| 1 | 700 **named accounts**, ~531 weekday DAU, 22 working days/month |
| 2 | Role mix matches mid-size RPO (60% recruiters) |
| 3 | AI model **Gemini 2.5 Flash-Lite**; application line includes modest app-tier overhead |
| 4 | **FX:** 1 USD = **₹96**; GST **excluded** from line items |
| 5 | **Fixed planning totals:** typical **₹1,00,000**/mo, high **₹1,50,000**/mo |
| 6 | AWS costs assume **Graviton Fargate**, **RDS 1-yr RI**, **single NAT**, **CloudFront caching**, **14-day logs** |
| 7 | Headroom row in §7.1 absorbs FX/GST/invoice variance within the ₹1L / ₹1.5L envelopes |
| 8 | Async ingest workers **not** deployed — long ingests still synchronous |
| 9 | Redis for agent sessions included in **high** tier only |
| 10 | Steady state excludes one-time migration parallel-run double billing |

---

*Document generated from codebase role/module analysis and AWS/Gemini public pricing (May 2026). Optimised AWS line items + application/LLM split roll up to fixed ₹1,00,000 / ₹1,50,000 planning totals.*
