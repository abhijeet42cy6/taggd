# Custom domain: `trops.taggd.in` (single hostname)

One domain serves **both** the React app and the FastAPI API. The browser calls `https://trops.taggd.in/auth/login`, `https://trops.taggd.in/stats/global`, etc. — no `api.taggd.in`.

---

## DNS for the client (only record needed)

In the **`taggd.in`** DNS zone:

| Type | Host / name | Value | TTL |
|------|-------------|-------|-----|
| **A** | `trops` | **`8.232.241.48`** | 300 |

**FQDN:** `trops.taggd.in` → `8.232.241.48`

GCP resource: global address `tgddata-trops-ip` (project `taggd-491107`).

Do **not** add `api.taggd.in` or a CNAME to `ghs.googlehosted.com` for this layout.

---

## How traffic is routed (GCP)

```text
https://trops.taggd.in
        │
        ▼
  Global HTTPS Load Balancer (8.232.241.48)
        │
        ├── /assets/*, /finance-dashboard/*, …  →  GCS gs://taggd-tgddata-prod-web (SPA)
        └── /auth/*, /projects/*, /stats/*, …   →  Cloud Run tgddata-api
```

Setup script: [`deploy/gcp/08-setup-trops-lb.sh`](../deploy/gcp/08-setup-trops-lb.sh)

---

## Cutover checklist (our side)

1. Client adds **A** record `trops` → `8.232.241.48`.
2. Run `./deploy/gcp/08-setup-trops-lb.sh` (LB + managed SSL).
3. Wait for certificate **ACTIVE** (DNS must propagate first).
4. Update CORS and redeploy API:
   ```bash
   export CORS_ALLOW_ORIGINS='https://trops.taggd.in,https://storage.googleapis.com'
   ./deploy/gcp/06-deploy-api.sh
   ```
5. Rebuild frontend for custom domain:
   ```bash
   export VITE_API_BASE_URL='https://trops.taggd.in'
   export GCS_WEB_BASE='/'
   export VITE_STATIC_HOSTING='0'
   ./deploy/gcp/07-deploy-frontend.sh
   ```
6. Open **https://trops.taggd.in/** (BrowserRouter, not `#/login`).

---

## Verify

```bash
curl -sI https://trops.taggd.in/ready
curl -sI https://trops.taggd.in/
```

Login in browser; DevTools → Network → API calls stay on `https://trops.taggd.in/...`.
