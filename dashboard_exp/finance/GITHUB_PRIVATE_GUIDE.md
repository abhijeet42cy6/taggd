# 🔒 Private GitHub Setup — Taggd Finance Dashboard

How to store your dashboard on GitHub **privately** (no public access)
and deploy it so only invited people can view it.

---

## Option A — Private GitHub Repo (Storage Only, No Live URL)

This keeps your code safe and version-controlled.
The dashboard won't have a public URL — you open it locally or share files manually.

### Steps:

**1. Download your project from Genspark**
- Go to the **Publish tab** in Genspark
- Download the project as a ZIP
- Extract to a folder, e.g. `C:\taggd-dashboard\`

**2. Create a Private GitHub repo**
- Go to → https://github.com/new
- Name: `taggd-finance-dashboard`
- Visibility: ✅ **Private**
- Click **Create repository**

**3. Push from your computer**

Open Terminal / Git Bash in your project folder:

```bash
git init
git add .
git commit -m "Taggd Finance Dashboard — initial"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/taggd-finance-dashboard.git
git push -u origin main
```

✅ Code is now safely stored on GitHub — **private, no one else can see it**.

**4. To update data in future**
```bash
# Edit js/data.js with new monthly numbers, then:
git add js/data.js
git commit -m "Update: March 2026 data"
git push
```

---

## Option B — Private Repo + Live URL (Paid GitHub Plan OR Free via Netlify)

### Sub-option B1: GitHub Pages on Private Repo
⚠️ GitHub Pages on **private repos requires GitHub Pro / Team** ($4/month).
Not recommended unless you already have a paid plan.

### Sub-option B2: Netlify (FREE — Recommended ✅)

Netlify lets you deploy a **private GitHub repo** to a live URL for FREE,
with optional password protection.

**Steps:**

1. Push your code to a **private GitHub repo** (follow Option A above)

2. Go to → https://netlify.com → Sign up free (use your GitHub account)

3. Click **"Add new site"** → **"Import an existing project"**

4. Choose **GitHub** → Authorize Netlify → Select your private repo

5. Build settings (leave defaults):
   - Base directory: *(leave blank)*
   - Build command: *(leave blank)*
   - Publish directory: `.` *(or leave blank)*

6. Click **Deploy site**

✅ You get a live URL like: `https://taggd-finance-xyz.netlify.app`

**To make it password protected (free):**
- Netlify dashboard → Site settings → **Access control** → **Password protection**
- Set a password → only people with the password can open the URL

**To use a custom domain like `finance.taggd.com`:**
- Netlify dashboard → Domain settings → Add custom domain

---

## Option C — Run Entirely Locally (No Internet Needed)

If you just want to use the dashboard on your own computer:

1. Download the project ZIP from Genspark
2. Extract it
3. Open `index.html` directly in Chrome or Edge

> ⚠️ Note: Some browsers block local JS files for security.
> If charts don't load, use this instead:

**Install a simple local server (one-time):**
```bash
# Requires Node.js installed (nodejs.org)
npx serve .
```
Then open: `http://localhost:3000`

---

## Summary: Which Option to Choose?

| Your Need | Best Option |
|-----------|------------|
| Just backup/version control, no live URL | **Option A** — Private GitHub repo |
| Live URL, access for your team, free | **Option B2** — Netlify (free) |
| Live URL, willing to pay $4/mo | **Option B1** — GitHub Pro + GitHub Pages |
| Only you need it, no sharing | **Option C** — Local file |

---

## 🔑 Getting a GitHub Personal Access Token (for git push)

When you run `git push`, GitHub may ask for your password.
**GitHub no longer accepts passwords** — use a token instead:

1. GitHub → top-right profile → **Settings**
2. Left sidebar → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token (classic)**
5. Give it a name: `taggd-dashboard`
6. Expiration: `No expiration` (or 1 year)
7. Check: ✅ `repo` (full control)
8. Click **Generate token**
9. **Copy the token immediately** — you won't see it again

Use this token as your password when `git push` asks.

---

*Made by Taggd · Powered by AI*
