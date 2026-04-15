# 🚀 GitHub Deployment Guide — Taggd Finance Dashboard

This guide walks you through deploying your dashboard to GitHub Pages so it's live on the internet — **completely free, no server needed.**

---

## ✅ Prerequisites

- A **GitHub account** → [github.com/signup](https://github.com/signup) (free)
- **Git** installed on your computer → [git-scm.com](https://git-scm.com/downloads)
- Your project files downloaded from Genspark (use the Publish/Download option)

---

## 📋 Step-by-Step Instructions

---

### STEP 1 — Download Your Project Files

In Genspark, go to the **Publish tab** and download the project as a ZIP.  
Extract the ZIP to a folder on your computer, e.g.:
```
C:\Users\YourName\taggd-dashboard\
```
or on Mac:
```
~/Documents/taggd-dashboard/
```

---

### STEP 2 — Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name:** `taggd-finance-dashboard` (or any name you like)
   - **Visibility:** ✅ Public *(required for free GitHub Pages)*
   - **Do NOT** check "Add README" — your project already has one
3. Click **"Create repository"**
4. Copy the repository URL shown (looks like `https://github.com/yourname/taggd-finance-dashboard.git`)

---

### STEP 3 — Push Your Files to GitHub

Open **Terminal** (Mac/Linux) or **Command Prompt / Git Bash** (Windows).

Navigate to your project folder:
```bash
cd path/to/taggd-dashboard
```

Run these commands **one by one**:
```bash
# 1. Initialize git
git init

# 2. Stage all files
git add .

# 3. First commit
git commit -m "🚀 Initial deploy: Taggd Finance Dashboard"

# 4. Set branch name to main
git branch -M main

# 5. Connect to your GitHub repo (REPLACE with your actual URL)
git remote add origin https://github.com/YOUR_USERNAME/taggd-finance-dashboard.git

# 6. Push to GitHub
git push -u origin main
```

✅ Your files are now on GitHub.

---

### STEP 4 — Enable GitHub Pages with Auto-Deploy

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys every time you push changes.

To enable it:

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar, under "Code and automation")
4. Under **"Build and deployment"**, set:
   - **Source:** `GitHub Actions`
5. Click **Save**

⏱ Wait about **60–90 seconds**, then visit:
```
https://YOUR_USERNAME.github.io/taggd-finance-dashboard/
```

🎉 **Your dashboard is live!**

---

### STEP 5 — Updating Data in the Future

**Option A — Via Excel Upload (no Git needed):**
1. Open your live dashboard URL
2. Click "Upload / Update Data" in the sidebar
3. Download template → fill data → upload → Apply
4. *(Data only persists for your browser session)*

**Option B — Permanent update via Git push:**
1. Edit `js/data.js` on your computer with new monthly data
2. Run:
```bash
git add js/data.js
git commit -m "📊 Update: FY25-26 Mar data added"
git push
```
3. GitHub Actions auto-deploys in ~60 seconds → everyone sees the new data

---

## 🔒 Making It Private (Optional)

If you want only certain people to access the dashboard:
- Keep the repo **Private** (GitHub Pages requires a paid plan for private repos)
- **Free alternative:** Use [Netlify](https://netlify.com) or [Cloudflare Pages](https://pages.cloudflare.com) — both support private site access with free plans

---

## 🌐 Custom Domain (Optional)

To use `finance.taggd.com` instead of `yourname.github.io/...`:

1. In GitHub → Settings → Pages → **Custom domain** → enter `finance.taggd.com`
2. In your DNS provider (GoDaddy, Cloudflare etc.), add a **CNAME record**:
   - **Name:** `finance`
   - **Value:** `YOUR_USERNAME.github.io`
3. Check **"Enforce HTTPS"** after DNS propagates (~10 mins)

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| `git push` asks for password | Use a **Personal Access Token** instead of password. Generate at: GitHub → Settings → Developer settings → Personal access tokens |
| Page shows 404 | Wait 2 minutes after enabling Pages. Check Settings → Pages to confirm source is "GitHub Actions" |
| Charts not showing | Open browser DevTools (F12) → Console tab → share any red errors |
| Old data showing after push | Hard refresh with `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac) |

---

## 📞 Quick Command Reference

```bash
# Check status of changes
git status

# Pull latest from GitHub
git pull

# Push a single file update
git add js/data.js
git commit -m "Update monthly data"
git push

# Push all changes
git add .
git commit -m "Your message here"
git push
```

---

*Made by Taggd · Powered by AI*
