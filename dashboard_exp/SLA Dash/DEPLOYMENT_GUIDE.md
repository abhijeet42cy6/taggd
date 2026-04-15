# TAGGD Dashboard - Live Deployment Guide

**Purpose:** Make your dashboard live and accessible via a public URL that you can share with others

**Current Status:** ✅ Code pushed to GitHub: https://github.com/Rishab25276/SLA-DASHBOARD

---

## 🎯 Deployment Options

You have **3 main options** to make your dashboard live:

### Option 1: Cloudflare Pages (Recommended) ⭐
- **Cost:** FREE (unlimited bandwidth)
- **URL:** `https://your-project.pages.dev`
- **Custom Domain:** Yes (free SSL)
- **Speed:** Very fast (global CDN)
- **Updates:** Automatic (push to GitHub = auto-deploy)

### Option 2: GitHub Pages
- **Cost:** FREE
- **URL:** `https://Rishab25276.github.io/SLA-DASHBOARD/`
- **Custom Domain:** Yes
- **Speed:** Fast
- **Updates:** Automatic (push to GitHub = auto-deploy)

### Option 3: Netlify
- **Cost:** FREE tier available
- **URL:** `https://your-site.netlify.app`
- **Custom Domain:** Yes (free SSL)
- **Speed:** Fast (global CDN)
- **Updates:** Automatic (push to GitHub = auto-deploy)

---

## 🚀 Quick Start: Deploy to Cloudflare Pages

### Step 1: Get Cloudflare API Token

1. Go to **Cloudflare Dashboard**: https://dash.cloudflare.com/
2. Click **"My Profile"** (top right)
3. Select **"API Tokens"** tab
4. Click **"Create Token"**
5. Use template: **"Edit Cloudflare Workers"** or **"Create Custom Token"**
6. **Permissions needed:**
   - Account → Cloudflare Pages → Edit
   - Zone → DNS → Edit (optional, for custom domains)
7. **Copy the token** (you'll only see it once!)

### Step 2: Configure API Key in This Environment

**In the Deploy tab of this interface:**
1. Click the **"Deploy"** tab in sidebar
2. Paste your Cloudflare API token
3. Save it

**OR use command line (if available):**
```bash
# This will be done for you once you provide the token
export CLOUDFLARE_API_TOKEN="your-token-here"
```

### Step 3: Deploy to Cloudflare Pages

Once your API token is configured, run these commands:

```bash
cd /home/user/webapp

# Create Cloudflare Pages project
npx wrangler pages project create taggd-dashboard --production-branch main

# Deploy the dashboard
npx wrangler pages deploy . --project-name taggd-dashboard
```

**Your live URL will be:** `https://taggd-dashboard.pages.dev`

---

## 🔧 Alternative: Manual Cloudflare Pages Setup (No CLI)

If you prefer a visual interface:

### Step 1: Go to Cloudflare Dashboard
1. Visit: https://dash.cloudflare.com/
2. Click **"Workers & Pages"** in sidebar
3. Click **"Create application"**
4. Select **"Pages"** tab
5. Click **"Connect to Git"**

### Step 2: Connect GitHub Repository
1. Click **"Connect GitHub"**
2. Authorize Cloudflare to access your repositories
3. Select repository: **"SLA-DASHBOARD"**
4. Click **"Begin setup"**

### Step 3: Configure Build Settings
```
Project name: taggd-dashboard
Production branch: main
Build command: (leave empty - it's static HTML)
Build output directory: / (root directory)
```

### Step 4: Deploy
1. Click **"Save and Deploy"**
2. Wait 1-2 minutes for deployment
3. Your live URL will appear: `https://taggd-dashboard.pages.dev`

**Done!** Share this URL with anyone.

---

## 🌐 Deploy to GitHub Pages (Simplest Option)

This is the **easiest option** if you want something quick:

### Step 1: Enable GitHub Pages

1. Go to your repository: https://github.com/Rishab25276/SLA-DASHBOARD
2. Click **"Settings"** tab
3. Click **"Pages"** in left sidebar
4. Under **"Source"**, select:
   - Branch: **main**
   - Folder: **/ (root)**
5. Click **"Save"**

### Step 2: Wait for Deployment

- GitHub will automatically deploy your site
- Takes 1-2 minutes
- You'll see a URL: `https://Rishab25276.github.io/SLA-DASHBOARD/`

### Step 3: Access Your Dashboard

Your live URL: **https://Rishab25276.github.io/SLA-DASHBOARD/TAGGD_Dashboard_ENHANCED.html**

**Important:** You need to include the full filename in the URL for GitHub Pages.

### Optional: Create index.html Redirect

To make the URL cleaner, the `index.html` we created will automatically redirect to the dashboard.

**Short URL:** `https://Rishab25276.github.io/SLA-DASHBOARD/`  
**Redirects to:** `TAGGD_Dashboard_ENHANCED.html`

---

## 📱 Deploy to Netlify

### Step 1: Create Netlify Account
1. Go to: https://app.netlify.com/signup
2. Sign up with GitHub (easiest)

### Step 2: Add New Site
1. Click **"Add new site"**
2. Select **"Import an existing project"**
3. Choose **"Deploy with GitHub"**
4. Authorize Netlify
5. Select repository: **SLA-DASHBOARD**

### Step 3: Configure Build Settings
```
Build command: (leave empty)
Publish directory: / (root)
```

### Step 4: Deploy
1. Click **"Deploy site"**
2. Wait 1-2 minutes
3. Your URL: `https://random-name-12345.netlify.app`

### Step 5: Customize URL (Optional)
1. Go to **Site settings**
2. Change site name to: `taggd-dashboard`
3. Your new URL: `https://taggd-dashboard.netlify.app`

---

## 🔄 How Updates Work (All Options)

Once deployed, updates are **AUTOMATIC**:

### Method 1: Update via GitHub Web Interface (Easiest)

1. Go to: https://github.com/Rishab25276/SLA-DASHBOARD
2. Navigate to file you want to update
3. Click the **pencil icon** (Edit)
4. Make your changes
5. Click **"Commit changes"**
6. **Automatic:** Site redeploys in 1-2 minutes!

### Method 2: Update via Git Commands

```bash
# Make changes to your files locally
cd /home/user/webapp

# Commit and push
git add .
git commit -m "Update dashboard data"
git push origin main

# Automatic deployment happens!
```

### Method 3: Update Data File Only

If you just want to update the data:

1. **Edit the HTML file** (lines with embedded data)
2. OR **Use a separate data loading approach** (see Advanced section below)
3. **Commit and push** to GitHub
4. **Automatic redeploy** happens

---

## 📊 How to Update Dashboard Data

### Current Setup: Embedded Data

Your dashboard currently loads data via **Excel file upload** in the browser. This means:

**Users need to:**
1. Visit your live dashboard URL
2. Click "Upload Excel File"
3. Select their local Excel file
4. Dashboard displays the data

**Pros:**
- ✅ No backend needed
- ✅ Data stays private (not stored on server)
- ✅ Works with any Excel file format

**Cons:**
- ❌ Users must upload file each time
- ❌ Can't share a specific data view via URL

### Option A: Pre-load Default Data (Recommended)

To have the dashboard **automatically show data** when loaded:

**Step 1: Convert Excel to JSON**
```bash
# Use online tool or script to convert Excel to JSON
# Example: https://www.convertcsv.com/excel-to-json.htm
```

**Step 2: Embed JSON in HTML**

Add this in your `TAGGD_Dashboard_ENHANCED.html` around line 1570:

```javascript
// Default data (auto-loads on page load)
const defaultData = {
    fy24_25: [
        // Your FY 24-25 data as JSON array
    ],
    fy25_26: [
        // Your FY 25-26 data as JSON array
    ]
};

// Auto-load default data
window.addEventListener('DOMContentLoaded', () => {
    if (defaultData) {
        rawData = defaultData;
        processData();
        showView('overview');
    }
});
```

**Step 3: Update Data**
1. Convert new Excel to JSON
2. Update the `defaultData` object
3. Commit and push to GitHub
4. Automatic redeploy!

### Option B: Load Data from External JSON File

**Step 1: Create data.json**

Create `/home/user/webapp/data.json`:
```json
{
    "fy24_25": [...],
    "fy25_26": [...]
}
```

**Step 2: Modify Dashboard to Fetch JSON**

Add this code in `TAGGD_Dashboard_ENHANCED.html`:

```javascript
// Fetch external data
async function loadExternalData() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        rawData = data;
        processData();
        showView('overview');
    } catch (error) {
        console.error('Failed to load data:', error);
        // Still allow manual upload
    }
}

// Auto-load on page load
window.addEventListener('DOMContentLoaded', loadExternalData);
```

**Step 3: Update Data**
1. Update `data.json` file
2. Commit and push to GitHub
3. Automatic redeploy!

**Pros:**
- ✅ Easy to update (just edit JSON file)
- ✅ Data loads automatically
- ✅ Can still allow manual upload

---

## 🔐 Data Privacy Options

### Option 1: Public Dashboard with Private Data (Current)
- Dashboard is public (anyone can access)
- Users upload their own data
- Data never leaves their browser
- **Best for:** Sharing dashboard tool, not data

### Option 2: Public Dashboard with Public Data
- Dashboard is public
- Data is embedded or loaded from JSON
- Everyone sees the same data
- **Best for:** Sharing reports with team

### Option 3: Password-Protected Dashboard
- Add authentication layer
- Requires: Cloudflare Access or custom auth
- **Best for:** Sensitive data with authorized users

### Option 4: Private GitHub Repository
- Keep repo private
- Only authorized users can deploy
- **Best for:** Internal team use only

---

## 🎨 Custom Domain Setup

Once deployed, you can use your own domain:

### For Cloudflare Pages:
1. Go to your Pages project
2. Click **"Custom domains"**
3. Add your domain (e.g., `dashboard.yourcompany.com`)
4. Update DNS records as instructed
5. SSL certificate is automatic (free)

### For GitHub Pages:
1. Go to **Settings → Pages**
2. Enter custom domain
3. Update DNS to point to GitHub
4. Enable HTTPS (automatic)

### For Netlify:
1. Go to **Domain settings**
2. Add custom domain
3. Update DNS records
4. SSL is automatic (free)

---

## 📋 Recommended Workflow

### For Quick Sharing (Easiest):

1. ✅ **Deploy to GitHub Pages** (5 minutes)
   - Enable in repository settings
   - URL: `https://Rishab25276.github.io/SLA-DASHBOARD/`
   - Share URL with team
   - Users upload their own Excel files

### For Production Use (Best):

1. ✅ **Deploy to Cloudflare Pages** (10 minutes)
   - Faster performance
   - Better URL
   - Professional setup
   
2. ✅ **Embed default data** (optional)
   - Convert Excel to JSON
   - Add to HTML file
   - Auto-loads for users

3. ✅ **Set up custom domain** (optional)
   - Use your company domain
   - Professional appearance

---

## 🚀 Quick Deploy Commands

### GitHub Pages (Easiest):
```bash
# Already done! Just enable in repository settings
# Visit: https://github.com/Rishab25276/SLA-DASHBOARD/settings/pages
```

### Cloudflare Pages (Best):
```bash
cd /home/user/webapp

# After getting your Cloudflare API token:
npx wrangler pages project create taggd-dashboard --production-branch main
npx wrangler pages deploy . --project-name taggd-dashboard

# Your URL: https://taggd-dashboard.pages.dev
```

### Netlify (Alternative):
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login and deploy
netlify login
netlify deploy --prod

# Follow prompts
```

---

## 📞 Support & Troubleshooting

### GitHub Pages Not Working?
- Check repository is public or GitHub Pages enabled
- Verify main branch is selected
- Wait 2-3 minutes for deployment
- Check Actions tab for deployment status

### Cloudflare Pages Issues?
- Verify API token has correct permissions
- Check project name is unique
- Ensure files are in root directory
- Check Cloudflare dashboard for errors

### Data Not Loading?
- Check browser console (F12) for errors
- Verify JSON format is correct
- Check file paths are correct
- Test with manual Excel upload first

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Choose deployment platform (GitHub Pages/Cloudflare/Netlify)
- [ ] Enable deployment
- [ ] Verify live URL works
- [ ] Test Excel file upload
- [ ] (Optional) Embed default data
- [ ] (Optional) Set up custom domain
- [ ] Share URL with team!

---

## 🎉 Next Steps

**Immediate (5 minutes):**
1. Enable GitHub Pages in repository settings
2. Get live URL
3. Share with team

**Recommended (30 minutes):**
1. Get Cloudflare API token
2. Deploy to Cloudflare Pages
3. Get professional URL
4. Share with team

**Advanced (1 hour):**
1. Convert Excel to JSON
2. Embed default data
3. Set up custom domain
4. Create update workflow

---

## 📧 Need Help?

If you need assistance:
1. Check the deployment status in your chosen platform
2. Look for error messages in browser console (F12)
3. Verify all files are committed to GitHub
4. Check that index.html redirects correctly

**Your dashboard is ready to go live! Choose your preferred deployment method and share the URL.** 🚀
