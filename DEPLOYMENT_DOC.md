# Revenue Generator: Deployment & Infrastructure

**Last updated:** March 30, 2026  
**GCP project:** `taggd-491107`  
**Deployment status:** Production (Compute Engine VM + Docker Compose + optional Cloudflare quick tunnel)

---

## 1. What runs in production

| Layer | Technology | Notes |
|-------|------------|--------|
| Edge (public HTTPS) | **Cloudflare Quick Tunnel** (`cloudflared` in Docker on the VM) | Proxies to `http://127.0.0.1:80`. Hostname is assigned at tunnel start (`*.trycloudflare.com`); **changes if the tunnel container is recreated**. |
| Frontend | **Nginx** in container | Serves Vite build; SPA fallback; proxies `/api/` → backend. |
| Backend | **FastAPI** (`uvicorn`) | Agents, uploads, auth, APIs. |
| Database | **SQLite** file | Path in container: `/app/db_data/revenue_generator.db` via Docker volume `sqlite_data`. Persists across image rebuilds. |

**VM (Google Compute Engine)**

- **Project ID:** `taggd-491107`
- **Instance:** `revenue-gen-prod`
- **Zone:** `asia-south1-a`
- **Typical machine type:** `n2-standard-2` (confirm in console; subject to change)
- **Networking:** `taggd-vpc` / `taggd-subnet` (see historical notes in §3)
- **App directory on VM:** `~/tgddata_C1` (created by `scripts/deploy-gcp.sh`)

**Repository artifacts used for build**

- `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `nginx.conf`, `requirements.txt`
- Source: `backend/`, `frontend/` (built inside Docker; `node_modules` not shipped in tarball)

---

## 2. Deployment strategy (Docker Compose)

### A. Nginx (port 80)

- Serves static assets from the frontend image.
- `location /api/` → reverse proxy to the `backend` service (FastAPI on port 8000 inside the network).
- `client_max_body_size 50M`; proxy timeouts **300s** for long agent/upload work (`nginx.conf`).

### B. Backend (FastAPI)

- Image built from `Dockerfile.backend` (`pip install -r requirements.txt`).
- Environment from **`.env`** next to `docker-compose.yml` on the VM (not baked into the image).

### C. SQLite

- Compose sets `DATABASE_URL=sqlite:////app/db_data/revenue_generator.db`.
- Volume **`sqlite_data`** → `/app/db_data` so the DB survives container recreation.

---

## 3. Historical issues & fixes (reference)

<details>
<summary>SSH/IAP, localhost URLs, 413/504, VPC, Zscaler, Cloudflare — collapsed for brevity</summary>

- **SSH/SCP timeouts:** use `--tunnel-through-iap` with `gcloud compute scp` / `ssh` when direct access fails.
- **Frontend URLs:** app uses relative `/api/...`; Vite dev proxies `/api` locally; nginx proxies in prod.
- **413 / 504:** nginx body size **50M**, proxy read/send timeouts **300s**.
- **Corporate / Zscaler:** moved VM to `taggd-vpc`; optional **Cloudflare Tunnel** for HTTPS hostname with better reputation than raw IP.
</details>

---

## 4. Prerequisites (before any deploy or update)

1. **Google Cloud CLI** installed; authenticated: `gcloud auth login`
2. **Project set:** `gcloud config set project taggd-491107`
3. **Permissions:** ability to SSH/SCP to `revenue-gen-prod` (IAP tunnel if required).
4. **Local `.env` (recommended):** copy from `.env.example` and set at least:
   - `GEMINI_API_KEY`
   - `JWT_SECRET` (use a long random string in production; keep stable or all sessions invalidate)
   - Optional first admin (empty DB only): `AUTH_BOOTSTRAP_EMAIL`, `AUTH_BOOTSTRAP_PASSWORD`
5. **bcrypt / passlib:** `requirements.txt` pins **`bcrypt` 4.0.x** (`<4.1`) so **passlib** password hashing works. Do not upgrade bcrypt to 5.x without validating passlib compatibility.

---

## 5. Updating code on the cloud (standard workflow)

This is the path to use **every time** you want production to match your local repo.

### Option A — recommended: one command

From the **repository root** on your machine:

```bash
gcloud config set project taggd-491107
./scripts/deploy-gcp.sh
```

**What the script does**

1. Sets `gcloud` project to `taggd-491107`.
2. Builds `deploy.tar.gz` (excludes `node_modules`, `.git`, local `.db` files, etc.).
3. Uploads the tarball to `revenue-gen-prod` via `gcloud compute scp` (**`--tunnel-through-iap`**).
4. If **`./.env`** exists locally, uploads it to the VM as `~/tgddata.env` and moves it to **`~/tgddata_C1/.env`** after extract.
5. On the VM: removes old **`deploy_frontend_1` / `deploy_backend_1`** containers if present (frees host **port 80** from legacy stacks).
6. Extracts into **`~/tgddata_C1`**, then runs **`docker-compose up -d --build`** (prefers `docker-compose` v1; falls back to `docker compose` if available).

**Overrides (optional)**

```bash
GCP_PROJECT=taggd-491107 GCP_INSTANCE=revenue-gen-prod GCP_ZONE=asia-south1-a ./scripts/deploy-gcp.sh
```

### Option B — manual (same outcome as the script)

1. Create the tarball (same file list as in `scripts/deploy-gcp.sh`).
2. `gcloud compute scp … deploy.tar.gz arjun@revenue-gen-prod:~/deploy.tar.gz --project=taggd-491107 --zone=asia-south1-a --tunnel-through-iap`
3. SSH and extract, ensure **`.env`** exists under `~/tgddata_C1/`, then:

```bash
cd ~/tgddata_C1 && docker-compose up -d --build
```

(On this VM, use **`docker-compose`**, not **`docker compose`**, unless the Compose V2 plugin is installed.)

### After every update — quick verification

**On the VM (SSH):**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/
curl -s http://127.0.0.1/api/
docker ps
```

**Public URL (Cloudflare):** find the current hostname:

```bash
docker logs cloudflare_tunnel 2>&1 | grep -E 'trycloudflare\.com'
```

Then open `https://<hostname>/` in a browser.

---

## 6. Authentication & first admin

- **Bootstrap:** If the **`users`** table is **empty** and **`AUTH_BOOTSTRAP_EMAIL` / `AUTH_BOOTSTRAP_PASSWORD`** are set in the environment, **`bootstrap_default_admin()`** creates that user as **`admin`** on backend startup (see `backend/auth/bootstrap.py`).
- **Production:** ensure **`~/tgddata_C1/.env`** on the VM includes those variables when you need a guaranteed first user on a fresh DB.
- **Known issue resolved:** bcrypt **5.x** breaks passlib **1.7.x** hashing; **`requirements.txt`** pins **`bcrypt>=4.0.1,<4.1.0`**. If login fails with empty users despite bootstrap env, check backend logs for passlib/bcrypt errors and confirm the pin is installed in the image.

---

## 7. Troubleshooting

| Symptom | Likely cause | What to do |
|--------|----------------|------------|
| `Bind for 0.0.0.0:80 failed: port is already allocated` | Old compose stack (e.g. **`deploy_frontend_1`**) still bound to 80 | `docker rm -f deploy_frontend_1 deploy_backend_1` (or run **`./scripts/deploy-gcp.sh`**, which removes them before `up`). |
| Cannot SSH/SCP | Network / firewall | Add **`--tunnel-through-iap`** to `gcloud compute scp` / `ssh`. |
| Login fails, 0 users | Bootstrap not run or bcrypt/passlib error | Fix bcrypt pin; restart backend; or run `bootstrap_default_admin()` once inside the backend container (see §6). |
| Cloudflare URL unknown | Quick tunnel hostname not logged | `docker logs cloudflare_tunnel 2>&1 \| grep trycloudflare.com` |

---

## 8. Security notes

- **Secrets:** Keep **`GEMINI_API_KEY`**, **`JWT_SECRET`**, and passwords in **`.env`** on the VM or a secret manager — not in git, Dockerfiles, or `docker-compose.yml` committed to the repo.
- **IAP:** Prefer IAP tunneling for SSH/SCP where direct access is blocked.
- **Firewall:** VM firewall / tags control HTTP(S); the app behind Cloudflare is still served from nginx on **80** inside the VM.

---

## 9. Local development (no Docker)

1. Copy **`.env.example`** → **`.env`** and fill keys.
2. Backend: `pip install -r requirements.txt` then from repo root:  
   `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
3. Frontend: `cd frontend && npm ci && npm run dev` — Vite proxies **`/api`** to **`localhost:8000`**.

---

*Earlier narrative sections (February 2026) were consolidated into this document; IAP, VPC, and Cloudflare rationales remain valid operational context.*
