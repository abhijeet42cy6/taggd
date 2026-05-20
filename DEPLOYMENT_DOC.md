# Revenue Generator: Deployment & Infrastructure

**Last updated:** May 6, 2026  
**GCP project:** `taggd-491107`  
**Deployment status:** Production-capable stack (**Compute Engine** + **Docker Compose** origin tier). **Recommended public access:** dedicated DNS hostname → **Google Cloud HTTPS Load Balancer** → backends → containers (TLS terminated at the load balancer). Ephemeral tunnels are optional for demos only—see §8.

---

## 1. What runs in production

### Recommended enterprise URL model (dedicated domain)

1. Register or reuse a hostname under customer DNS (e.g. **`app.customer.com`**).
2. Create **Google Cloud DNS** managed zone records (**`A`/`AAAA`** or **`CNAME`**) targeting **Google Cloud External HTTPS Load Balancing**.
3. Attach a **Google-managed SSL certificate** (or upload customer-managed certs per policy) to the HTTPS proxy.
4. Configure **backend services / network endpoint groups** (or unmanaged instance groups) forwarding **HTTPS traffic** to the VM NIC **HTTP listener** on port **80** that serves the bundled compose stack—or terminate internal TLS end-to-end if you introduce certificates on the origin.

Users see **only `https://<dedicated-domain>/…`**; **VM IPs** remain non-contractual implementation detail.

### Stack overview


| Layer               | Technology                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge (public HTTPS) | **Dedicated domain + GCP HTTPS LB**             | Cloud DNS records → External HTTPS proxy → backend → VM/container listeners. Managed certs and HTTP→HTTPS redirect at the load balancer.                                                                                                                                                                                                                                                                           |
| Origin routing      | **Containerised reverse routing** (`nginx.conf`) | Inside the Docker network: serves Vite build; SPA fallback; proxies **`/api/`** → FastAPI. Not exposed as the customer-visible hostname—only reachable via LB backends or VPC admin paths.                                                                                                                                                                                                                             |
| Frontend payload    | Static SPA bundle                               | Built in **`Dockerfile.frontend`** image.                                                                                                                                                                                                                                                                                                                                                                          |
| Backend             | **FastAPI** (`uvicorn`)                         | Agents, uploads, auth, APIs.                                                                                                                                                                                                                                                                                                                                                                                        |
| Database            | **SQLite** (compose default) / **Cloud SQL** (recommended prod) | Compose template uses **`DATABASE_URL` sqlite** volume for portability; production deployments should point **`DATABASE_URL`** at **Google Cloud SQL (PostgreSQL)** per assurance docs—see **`DATABASE_URL`** / proxy setup in `.env`.                                                                                                                                                                                  |


**VM (Google Compute Engine)**

- **Project ID:** `taggd-491107`
- **Instance (default in `scripts/deploy-gcp.sh`):** `revenue-gen-prod`
- **Alternate instance (tgddata C1 stack):** `tgddata-c1-prod-2` — point deploys at it with  
`source scripts/gcp-env-tgddata-c1-prod-2.sh` before `./scripts/deploy-gcp.sh` (or set `GCP_INSTANCE=tgddata-c1-prod-2`).
- **Zone:** `asia-south1-a`
- **Typical machine type:** `n2-standard-2` (confirm in console; subject to change)
- **Networking:** `taggd-vpc` / `taggd-subnet` (see historical notes in §3)
- **App directory on VM:** `~/tgddata_C1` (created by `scripts/deploy-gcp.sh`)

**Repository artifacts used for build**

- `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `docker-compose.ngrok.yml` (optional ngrok), `nginx.conf`, `requirements.txt`
- Source: `backend/`, `frontend/` (built inside Docker; `node_modules` not shipped in tarball)

---

## 2. Deployment strategy (Docker Compose — origin tier)

### A. Origin listener (HTTP inside VPC / backend network)

- Serves static assets from the frontend container image.
- `location /api/` → reverse proxy to the `backend` service (FastAPI on port 8000 inside the Docker network).
- `client_max_body_size 50M`; proxy timeouts **300s** for long agent/upload work (`nginx.conf`).
- **External browsers do not hit this port directly** when using the recommended HTTPS load balancer front door—they terminate TLS at the LB and forward to port **80** on the backend instance/group unless you adopt stricter VPC-only exposure.

### B. Backend (FastAPI)

- Image built from `Dockerfile.backend` (`pip install -r requirements.txt`).
- Environment from `**.env`** next to `docker-compose.yml` on the VM (not baked into the image).

### C. Database

- Default compose sets **`DATABASE_URL=sqlite:////app/db_data/revenue_generator.db`** with volume **`sqlite_data`** → `/app/db_data`.
- **Production:** override **`DATABASE_URL`** to **Cloud SQL PostgreSQL** (Auth Proxy / private IP); rotate credentials via Secret Manager as appropriate.

---

## 3. Historical issues & fixes (reference)

SSH/IAP, localhost URLs, 413/504, VPC — collapsed for brevity

- **SSH/SCP timeouts:** use `--tunnel-through-iap` with `gcloud compute scp` / `ssh` when direct access fails.
- **Frontend URLs:** app uses relative `/api/...`; Vite dev proxies `/api` locally; origin tier proxies on the VM behind the LB.
- **413 / 504:** origin **`nginx.conf`** body size **50M**, proxy read/send timeouts **300s**—mirror limits at **HTTPS LB / Cloud Armor** where applicable.
- **Corporate access:** deploy VM inside **`taggd-vpc`** (or customer VPC); publish **HTTPS on the dedicated hostname** rather than exposing raw ephemeral tunnel URLs for BAU traffic.

---

## 4. Prerequisites (before any deploy or update)

1. **Google Cloud CLI** installed; authenticated: `gcloud auth login`
2. **Project set:** `gcloud config set project taggd-491107`
3. **Permissions:** ability to SSH/SCP to the target VM (default `revenue-gen-prod`, or `tgddata-c1-prod-2` when using the env script above; IAP tunnel if required).
4. **Local `.env` (recommended):** copy from `.env.example` and set at least:
  - `GEMINI_API_KEY`
  - `JWT_SECRET` (use a long random string in production; keep stable or all sessions invalidate)
  - Optional first admin (empty DB only): `AUTH_BOOTSTRAP_EMAIL`, `AUTH_BOOTSTRAP_PASSWORD`
  - Optional **demo tunnels only:** `NGROK_AUTHTOKEN` — see **§8** (not a substitute for dedicated-domain HTTPS LB).
5. **bcrypt / passlib:** `requirements.txt` pins `**bcrypt` 4.0.x** (`<4.1`) so **passlib** password hashing works. Do not upgrade bcrypt to 5.x without validating passlib compatibility.

---

## 5. Updating code on the cloud (standard workflow)

This is the path to use **every time** you want production to match your local repo.

### Option A — recommended: one command

From the **repository root** on your machine:

```bash
gcloud config set project taggd-491107
./scripts/deploy-gcp.sh
```

**tgddata C1 VM (`tgddata-c1-prod-2`):** use the env helper so `deploy-gcp.sh` targets the right instance:

```bash
source scripts/gcp-env-tgddata-c1-prod-2.sh   # sets GCP_INSTANCE, zone, project
./scripts/deploy-gcp.sh
```

**What the script does**

1. Sets `gcloud` project to `taggd-491107` (or `GCP_PROJECT`).
2. Builds a tarball at `/tmp/tgddata-deploy-${GCP_PROJECT}.tar.gz` (excludes `node_modules`, `.git`, local `.db` files, etc.; includes `excel_files_imp`, Dockerfiles, `docker-compose.yml`, `docker-compose.ngrok.yml`, nginx, requirements).
3. Uploads it as `~/deploy.tar.gz` on `${GCP_INSTANCE}` via `gcloud compute scp` (`**--tunnel-through-iap`**).
4. If `./.env` exists locally, uploads it to the VM as `~/tgddata.env` and moves it to `~/tgddata_C1/.env` after extract.
5. On the VM: removes legacy `deploy_frontend_1` / `deploy_backend_1` if present (frees host **port 80** for **host Nginx** when TLS is enabled).
6. Extracts into `~/tgddata_C1`, then runs `docker compose up -d --build` if the Compose v2 plugin is available, else `docker-compose up -d --build`, using `docker-compose.yml` only. Typical containers: `tgddata_c1-backend-1`, `tgddata_c1-frontend-1`. The frontend publishes **`127.0.0.1:8080→80`** (not public `:80`) so the host can terminate TLS — see **§5b**.
7. If **`TGDDATA_HOST_TLS_SETUP=1`** (default when you **`source scripts/gcp-env-tgddata-c1-prod-2.sh`**), runs **`sudo bash scripts/setup-host-nginx-certbot-taggd.sh`** on the VM after compose (host Nginx + Let’s Encrypt for **`taggd.aparatus.in`**). Other instances: leave unset or set **`TGDDATA_HOST_TLS_SETUP=0`** unless that VM serves this hostname.
8. **ngrok** is not started by this step. If you use `docker-compose.ngrok.yml`, SSH after deploy and run the two-file `docker compose` command from the ngrok subsection below so `tgddata_c1-ngrok_tunnel-1` is running.

**Overrides (optional)**

```bash
GCP_PROJECT=taggd-491107 GCP_INSTANCE=revenue-gen-prod GCP_ZONE=asia-south1-a ./scripts/deploy-gcp.sh
# or
GCP_PROJECT=taggd-491107 GCP_INSTANCE=tgddata-c1-prod-2 GCP_ZONE=asia-south1-a ./scripts/deploy-gcp.sh
```

### Option B — manual (same outcome as the script)

1. Create the tarball (same file list as in `scripts/deploy-gcp.sh`).
2. `gcloud compute scp … /tmp/tgddata-deploy-taggd-491107.tar.gz USER@INSTANCE:~/deploy.tar.gz --project=taggd-491107 --zone=asia-south1-a --tunnel-through-iap` (match `USER` / `INSTANCE` to your VM)
3. SSH and extract, ensure `**.env**` exists under `~/tgddata_C1/`, then:

```bash
cd ~/tgddata_C1 && docker-compose up -d --build
```

(Prefer `docker compose` when available; otherwise use `docker-compose`.)

### 5b. Permanent domain — host Nginx + Certbot (`taggd.aparatus.in`)

**DNS:** **`A`** record for **`taggd.aparatus.in`** → VM static IP (required before Certbot).

**Compose:** `docker-compose.yml` maps the frontend to **`127.0.0.1:8080:80`** only. **Host** Nginx listens on **80/443**, proxies to **`http://127.0.0.1:8080`** (container `nginx.conf` still proxies **`/api/`** → backend).

**Automated (recommended for `tgddata-c1-prod-2`):**

```bash
source scripts/gcp-env-tgddata-c1-prod-2.sh   # sets TGDDATA_HOST_TLS_SETUP=1 by default
./scripts/deploy-gcp.sh
```

**Manual on the VM** (e.g. after a deploy without TLS, or to re-run):

```bash
cd ~/tgddata_C1 && sudo bash scripts/setup-host-nginx-certbot-taggd.sh
```

Optional overrides: **`TGDDATA_TLS_DOMAIN`**, **`TGDDATA_TLS_EMAIL`** (defaults: `taggd.aparatus.in`, `arjun@aocr.in`).

**Local development:** open **`http://127.0.0.1:8080/`** (or **`http://localhost:8080/`**) after `docker compose up` because the published port is **8080** on the loopback interface.

### After every update — quick verification

**On the VM (SSH):**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/
curl -s http://127.0.0.1:8080/api/
curl -sI https://taggd.aparatus.in/ | head -5
docker ps
```

**Public URL (Cloudflare):** find the current hostname:

```bash
docker logs cloudflare_tunnel 2>&1 | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | tail -1
```

Then open `https://<hostname>/` in a browser.

### Optional — ngrok (second public URL, same app)

**Compose file:** `docker-compose.ngrok.yml` (bundled in the deploy tarball). **Service:** `ngrok_tunnel` → `**http://frontend:80`**. **Token:** [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) → set `**NGROK_AUTHTOKEN`** in `**.env**` (local for upload, and/or edit `**~/tgddata_C1/.env**` on the VM).

1. Ensure `**NGROK_AUTHTOKEN**` is in `**~/tgddata_C1/.env**` on the VM (deploy uploads from local `**.env**` when present).
2. Start or refresh the tunnel (with or without a full rebuild):

```bash
cd ~/tgddata_C1
docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up -d --build
```

1. **Public URL** — pick one:

```bash
docker logs tgddata_c1-ngrok_tunnel-1 2>&1 | grep -oE 'https://[^ ]+\.ngrok[^ ]*' | head -1
```

Or:

```bash
docker compose -f docker-compose.yml -f docker-compose.ngrok.yml logs ngrok_tunnel 2>&1 | tail -40
```

**With Cloudflare:** keep your existing `**cloudflare_tunnel`** container; ngrok adds a second hostname to the **same** nginx on port 80.

**Stop only ngrok:**  
`docker compose -f docker-compose.yml -f docker-compose.ngrok.yml stop ngrok_tunnel`

**After every `./scripts/deploy-gcp.sh`:** the remote step only runs `**docker compose up -d --build`** on `**docker-compose.yml**`, so `**ngrok_tunnel` may be missing** until you run the **two-file** `up` again (step 2 above). Re-run that after deploys if you rely on ngrok.

---

## 6. Authentication & first admin

- **Bootstrap:** If the `**users`** table is **empty** and `**AUTH_BOOTSTRAP_EMAIL` / `AUTH_BOOTSTRAP_PASSWORD`** are set in the environment, `**bootstrap_default_admin()`** creates that user as `**admin`** on backend startup (see `backend/auth/bootstrap.py`).
- **Production:** ensure `**~/tgddata_C1/.env`** on the VM includes those variables when you need a guaranteed first user on a fresh DB.
- **Known issue resolved:** bcrypt **5.x** breaks passlib **1.7.x** hashing; `**requirements.txt`** pins `**bcrypt>=4.0.1,<4.1.0`**. If login fails with empty users despite bootstrap env, check backend logs for passlib/bcrypt errors and confirm the pin is installed in the image.

---

## 7. Troubleshooting


| Symptom                                                 | Likely cause                                                       | What to do                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bind for 0.0.0.0:80 failed: port is already allocated` | Old compose stack (e.g. `**deploy_frontend_1**`) still bound to 80 | `docker rm -f deploy_frontend_1 deploy_backend_1` (or run `**./scripts/deploy-gcp.sh**`, which removes them before `up`).                                                           |
| Cannot SSH/SCP                                          | Network / firewall                                                 | Add `**--tunnel-through-iap**` to `gcloud compute scp` / `ssh`.                                                                                                                     |
| Login fails, 0 users                                    | Bootstrap not run or bcrypt/passlib error                          | Fix bcrypt pin; restart backend; or run `bootstrap_default_admin()` once inside the backend container (see §6).                                                                     |
| Cloudflare URL unknown                                  | Quick tunnel hostname not logged                                   | `docker logs cloudflare_tunnel 2>&1 | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | tail -1`                                                                              |
| ngrok URL unknown / missing after deploy                | Deploy only applies `docker-compose.yml`                           | On VM: `docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up -d`, then `docker logs tgddata_c1-ngrok_tunnel-1 2>&1 | grep -oE 'https://[^ ]+\.ngrok[^ ]*' | head -1` |
| ngrok not starting                                      | Missing or invalid `NGROK_AUTHTOKEN` in `.env`                     | Set token in `~/tgddata_C1/.env`, then `docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up -d`. Check logs: `docker logs tgddata_c1-ngrok_tunnel-1`.               |


---

## 8. Security notes

- **Secrets:** Keep `GEMINI_API_KEY`, `JWT_SECRET`, `NGROK_AUTHTOKEN` (if used), and passwords in `.env` on the VM or a secret manager — not in git, chat, Dockerfiles, or committed compose. **Rotate ngrok tokens** if they are ever pasted into tickets or chat.
- **IAP:** Prefer IAP tunneling for SSH/SCP where direct access is blocked.
- **Firewall:** VM firewall / tags control HTTP(S); the app is still served from nginx on **80** inside the VM; public HTTPS may reach it via **Cloudflare**, **ngrok**, or another tunnel to that port.

---

## 9. Local development (no Docker)

1. Copy `**.env.example`** → `**.env`** and fill keys.
2. Backend: `pip install -r requirements.txt` then from repo root:
  `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
3. Frontend: `cd frontend && npm ci && npm run dev` — Vite proxies `**/api`** to `**localhost:8000**`.

---

*Earlier narrative sections (February 2026) were consolidated into this document; IAP, VPC, and tunnel (Cloudflare / ngrok) notes remain valid operational context.*