# Enterprise security analysis and hardening roadmap

This document is an **in-depth product-wide security review** of the tgddata / revenue-agent codebase (FastAPI backend, React frontend, Docker deployment) with the goal of **industry-grade, enterprise-ready** operation. Findings are prioritized; items not present in the repository (e.g. completed pentest reports) are called out as **governance gaps**, not product strengths.

---

## 1. Executive summary

The application has a **coherent authentication and authorization model** (JWT Bearer, role-based and project-scoped access, module-level “vertical” gates for several routers, read-only enforcement for `client_user`). There is **no traditional message broker**; security boundaries are HTTP + DB + optional third-party APIs (Google Gemini, Composio).

**The single largest technical risk** for enterprise deployment is **server-side execution of LLM-generated Python** via `exec()` on revenue logic. That design enables **arbitrary code execution** in the API process context if the model output is malicious or manipulated (prompt injection, poisoned training context, or compromised pipeline). This must be treated as a **supply-chain / RCE class** issue, not a cosmetic AI concern.

Secondary cluster: **operational exposure** — public OpenAPI/Swagger without auth, permissive CORS, JWTs in **localStorage**, long-lived sessions, **SQLite** defaults unsuitable for multi-node HA, **no rate limiting** or WAF in app code, and **telemetry/secrets hygiene** dependent on environment discipline.

---

## 2. Critical findings (address before wide enterprise rollout)

### 2.1 Arbitrary code execution (`exec`) on generated “revenue logic”

**Location:** `backend/main.py` (and related regeneration paths) — `exec(logic_code, globals(), loc)` then `loc['calculate']`.

**Risk:** Any party who can influence `logic_code` (Gemini output, stored DB field after prior compromise, or an insider PATCH) can run arbitrary Python with the **same privileges as the API** — read DB credentials from env, access the database, write files, call network if available in globals.

**Enterprise posture:**


| Direction     | Action                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eliminate** | Replace `exec` with a **restricted DSL**, formula engine (e.g. row-based expressions in JSON), or **sandboxed worker** (separate process/container, seccomp/AppArmor, no network, read-only FS, capped CPU/memory). |
| **Contain**   | Short term: run `calculate` in **subprocess with timeout**, whitelist allowed imports, strip `__builtins__`, deny file/network syscalls (still weak vs determined attacker).                                        |
| **Govern**    | Cryptographic **signing** of approved logic bundles, human approval workflow before persistence, audit all `revenue_logic_code` changes.                                                                            |
| **Detect**    | Static analysis on generated code; block `import os`, `open`, `subprocess`, etc.                                                                                                                                    |


**Why this matters:** SOC2 / ISO 27001 auditors and customer security teams will flag unsandboxed `exec` as **unacceptable** for multi-tenant or regulated data.

### 2.2 Public API documentation and schema without authentication

**Location:** `backend/auth/middleware.py` — paths under `/docs`, `/redoc`, `/openapi.json` bypass JWT.

**Risk:** Full route surface, models, and integration hints are **enumerable by unauthenticated actors** on any host that exposes the API directly.

**Remediation:** Disable in production (`FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` behind env flag), or protect with **reverse-proxy basic auth**, **IP allow list**, or **mTLS** for internal doc portals only.

### 2.3 Third-party AI (Gemini) and data residency

**Locations:** `GEMINI_API_KEY`, agents (`instructor` + `google-generativeai`), routers such as `ceo_deck_ai`, `sla_insights_ai`, `analysis_agent`.

**Risk:** Business spreadsheets, deck JSON, SLA context, and user instructions leave the trust boundary to **Google’s Gemini API** subject to **Google’s terms and regional availability**. No code-level DLP or field-level tokenization before send.

**Remediation:** Contractual **DPA / BAA** as applicable, **GCP region** / **Enterprise Gemini** options, **minimum-necessary prompts**, **log redaction**, optional **on-prem or VPC-hosted models** for regulated customers.

---

## 3. High findings

### 3.1 CORS `allow_origins=["*"]`

**Location:** `backend/main.py` `CORSMiddleware`.

**Risk:** Any origin can call the API **with user-supplied tokens** if an attacker tricks a logged-in user into visiting a malicious site (browser will attach Bearer from JS on same attacker page only if they steal token — XSS is the usual path). Combined with token-in-localStorage, this increases **cross-origin abuse surface**.

**Remediation:** Set explicit origins (customer app URLs); use environment-driven allow list.

### 3.2 JWT storage in `localStorage`

**Locations:** `frontend/src/lib/api.ts`, `frontend/src/lib/auth.tsx` (`tgddata_access_token`).

**Risk:** Any XSS flaw yields **immediate account takeover**. Refresh tokens not implemented; session length tied to `JWT_EXPIRE_MINUTES` (default 24h).

**Remediation:** Prefer **HttpOnly Secure SameSite cookies** for session transport (with CSRF protection for cookie-based auth), or **BFF** pattern; shorten TTL + **refresh**; enforce **Content-Security-Policy** on the SPA.

### 3.3 No application-layer rate limiting or abuse detection

**Observation:** No global throttling on `/auth/login`, uploads, or agent endpoints (`time.sleep` in upload is not a security control).

**Remediation:** Reverse proxy (Nginx, Cloud Armor, API Gateway) limits; optional `slowapi` / Redis counters per IP and per user; **CAPTCHA** after failures; lockout policy documented.

### 3.4 Error handling and information disclosure

**Pattern:** Many paths raise `HTTPException(500, detail=str(e))` — stack traces are often **printed server-side** (good), but stringified exceptions can still leak **internal identifiers** or **path names**.

**Remediation:** Generic client messages in production; map internal errors to stable codes; central **error_id** with server-side logging only.

### 3.5 SQLite as default production database

**Location:** `docker-compose.yml`, `DEPLOYMENT_DOC.md`.

**Risk:** **File locking**, **backup consistency**, and **no horizontal scaling** of API replicas against one writer. Enterprise customers typically require **PostgreSQL** (or another managed RDBMS) with **encryption at rest**, **replication**, and **IAM DB auth**.

### 3.6 Large upload surface (DoS / malware)

**Location:** Compose/origin `**client_max_body_size`** (often **50M** in bundled origin config); many `UploadFile` endpoints.

**Risk:** Disk exhaustion, CPU exhaustion parsing XLSX/PDF, malicious archives if ever supported.

**Remediation:** Per-route smaller limits where possible; **ClamAV** or cloud malware scan; async virus scan before processing; **content-type** validation beyond extension.

### 3.7 Supply chain and dependencies

**Location:** `requirements.txt`, `frontend/package.json`.

**Risk:** Transitive vulnerabilities; stale majors.

**Remediation:** **Dependabot / Snyk / OSV** in CI; **lockfile** discipline (`package-lock.json` committed); **SBOM** per release; **signed images**.

---

## 4. Medium findings

### 4.1 Authorization complexity and monolithic `main.py`

Many routes live in `**backend/main.py`** with manual `apply_project_scope` / `assert_project_access`. Sub-routers use `require_vertical`. Risk: **inconsistent** application of scope on a **new endpoint** → **IDOR**.

**Remediation:** **Centralized policy** (e.g. decorator or FastAPI dependencies) per resource; **automated tests** per role; periodic **authorization review** checklist for new routes.

### 4.2 `client_user` vertical read guard coverage

**Location:** `backend/auth/client_vertical_read_guard.py` — only certain legacy GET prefixes are mapped; other routers self-enforce `require_vertical`.

**Risk:** **Mismatch** between middleware map and router set could theoretically leave a read path exposed — requires manual upkeep.

### 4.3 Integration: Composio OAuth and webhook

**Location:** `backend/routers/composio_integrations.py` — HMAC state for callback; webhook checks signature when `webhook_secret` configured.

**Risk:** Default / missing secrets in dev; ensure **production env** always sets strong secrets; **rotate** on compromise.

### 4.4 Secrets in environment

**Pattern:** `.env` for `JWT_SECRET`, `GEMINI_API_KEY`, DB URL.

**Remediation:** **Vault** (GCP Secret Manager, AWS Secrets Manager, HashiCorp), **no secrets in images**, **short-lived DB credentials**, **key rotation runbooks**.

### 4.5 Audit and non-repudiation

**Pieces exist:** `IngestionEvent`, `ActivityLog`, ingestion audit.

**Gaps:** Not all mutating APIs may log **who** changed **what** with tamper-evident storage; enterprise often wants **immutable audit** store or SIEM export.

### 4.6 TLS termination

**Production posture:** Public access uses a **dedicated domain** in **Google Cloud DNS** (or delegated registrar) pointing at **Google Cloud HTTPS Load Balancing** with **managed TLS certificates**, HTTP→HTTPS redirection, and modern cipher policies—consistent with enterprise DMZ expectations.

**Remediation checklist:** TLS **1.2+**, **HSTS**, strong cipher suites, rate limits and request-size limits at **ingress / Cloud Armor**, independent verification against the branded hostname—not raw VM IPs.

---

## 5. Lower priority / hygiene

- **Content-Security-Policy**, **X-Frame-Options**, **Referrer-Policy** — configure at **HTTPS ingress / CDN policy** alongside static asset delivery.
- **Subresource integrity** for third-party scripts if any are added.
- **Robots / `favicon`** public paths — low risk.
- `**/auth/login**` public — **brute-force** mitigation belongs in edge rate limits + lockout policy.

---

## 6. AI-specific governance (finance and narrative features)


| Topic              | Current behavior                                                         | Enterprise recommendation                                                                 |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Model choice**   | Primarily `gemini-flash-latest`                                          | Model approval list per customer; freeze versions for regulated runs.                     |
| **Validation**     | Deck JSON schema / merge; finance ingest uses numeric coercion in Python | Add **golden-file tests** for ingest; **human sign-off** for billing numbers touching GL. |
| **Prompt content** | Can include spreadsheet snippets, instructions                           | **PII minimization**, **retention limits**, **no training** clauses with provider.        |
| **Output trust**   | LLM assists; DB writes often via deterministic pipelines                 | Present AI as **assistant**; **dual control** for financial postings where required.      |


---

## 7. Suggested hardening roadmap (phased)

**Phase A — Minimum viable enterprise (weeks)**

1. **Remove or lock** `/docs`, `/openapi.json`, `/redoc` in production builds.
2. **Restrict CORS** and configure **trusted hosts** if using FastAPI’s middleware.
3. **PostgreSQL** migration path + encrypted backups documented.
4. **Ingress:** managed TLS on **dedicated domain**, rate limits, request size per route, security headers on static responses.
5. **Secrets** out of flat files in prod; rotate `JWT_SECRET` procedure.
6. **SBOM + dependency CI.**

**Phase B — Application controls (1–2 quarters)**

1. **Replace or sandbox** `exec()` revenue logic — highest priority.
2. **Auth hardening:** HttpOnly cookies *or* BFF; optional **MFA / SSO** (OIDC/SAML) for enterprise IdP.
3. **Structured logging** (JSON) with **PII scrubbing**; SIEM integration.
4. **Authorization tests** (pytest) per role for top 50 endpoints.
5. **File pipeline:** antivirus, stricter MIME checks.

**Phase C — Assurance and operations**

1. **Annual penetration test** + remediation tracker (customer shareable).
2. **Incident response** runbook; **backup/restore** drills.
3. **Data processing agreement** templates for Gemini and hosting.
4. Optional **on-prem / air-gapped** deployment guide without cloud AI.

---

## 8. Task tracker (actionable workstreams)

Use this as a program checklist; owners TBD per team.


| ID  | Workstream                                          | Outcome                                                        |
| --- | --------------------------------------------------- | -------------------------------------------------------------- |
| T1  | **RCE elimination** — revenue logic execution model | Sandboxed DSL or isolated worker; no raw `exec` in API process |
| T2  | **Edge security** — CORS, docs, TLS, rate limits    | Hardened ingress config + env-flagged FastAPI docs             |
| T3  | **Session / token** — storage & lifetime            | HttpOnly/SameSite or short JWT + refresh; MFA/SSO roadmap      |
| T4  | **Data layer** — Postgres + HA                      | Migration + connection security + backups                      |
| T5  | **AI governance** — prompts, logging, contracts     | DPA, redaction, optional regional inference                    |
| T6  | **Authorization QA** — IDOR prevention              | Automated tests + route audit checklist                        |
| T7  | **Supply chain** — deps & images                    | Lockfiles, SBOM, signed containers                             |
| T8  | **Assurance** — pentest, SOC2 evidence              | External test + tracking; policies                             |


---

## 9. Closing note

“Industry grade” is not a single patch: it is **defense in depth** (network, app, data, identity, AI usage, and process). This codebase already implements **meaningful access control primitives**; the path to enterprise readiness is dominated by **removing unrestricted code execution**, **tightening exposure defaults**, **hardening session and transport**, and **formalizing assurance artifacts** customers can rely on under contract.

*This analysis reflects static review of the repository; dynamic testing and third-party penetration testing remain necessary for a complete risk picture.*