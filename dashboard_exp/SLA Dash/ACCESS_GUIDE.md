# 🌐 TAGGD Dashboard - Access Guide

## 📱 How to Preview the Dashboard

You have **THREE ways** to access your TAGGD Dashboard:

---

## 🎯 METHOD 1: Direct Dashboard Access (Recommended)

**Full Dashboard URL:**
```
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai/index.html
```

Or simply:
```
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
```

**What you'll see:**
- Complete TAGGD Dashboard with all 11 views
- Auto-loaded sample data (484 projects)
- Full functionality: filters, drill-down, exports, voice features
- TAGGD orange theme with dark mode toggle

---

## 🎨 METHOD 2: Preview Page (Quick Overview)

**Preview Page URL:**
```
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai/preview.html
```

**What you'll see:**
- Beautiful landing page with dashboard overview
- Feature highlights and statistics
- "Open Dashboard" button to access full dashboard
- Quick introduction to dashboard capabilities

---

## 🔧 METHOD 3: From AI Developer Preview Section

If you're trying to use the AI Developer preview section in the interface:

### Option A: Click the preview button
The preview section should automatically detect port 3000 and show the dashboard.

### Option B: Manual URL entry
If the preview section allows URL input, enter:
```
http://localhost:3000
```
or
```
http://localhost:3000/preview.html
```

### Option C: Browser iframe
Some preview sections use iframes. Make sure:
1. The port is set to **3000**
2. The service is running (check with `pm2 list`)
3. Try refreshing the preview if it doesn't load

---

## 🚀 Accessing from Your Browser

**Best Method:**
Just open your web browser and paste this URL:

```
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
```

**Alternative URLs:**
- Main Dashboard: `/index.html`
- Preview Page: `/preview.html`
- Sample Data: `/sample_data.json`
- TAGGD Logo: `/taggd-logo.png`
- Company Logos: `/public/logos/TITAN.png` (example)

---

## ✅ Verification Steps

### 1. Check Service Status
```bash
pm2 list
```
**Expected:** `taggd-dashboard` should show `status: online`

### 2. Test Local Access
```bash
curl http://localhost:3000
```
**Expected:** HTML content of the dashboard

### 3. Test Public Access
```bash
curl https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
```
**Expected:** Same HTML content

### 4. Open in Browser
Click this link: https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai

**Expected:** Full dashboard loads with TAGGD branding

---

## 🐛 Troubleshooting

### Preview Not Loading in AI Developer Section?

**Try these solutions:**

1. **Use Direct Browser Access Instead**
   - Copy URL: `https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai`
   - Paste into your web browser (Chrome, Firefox, Safari, Edge)
   - This bypasses any iframe/preview restrictions

2. **Check Service Status**
   ```bash
   pm2 list
   ```
   If offline, restart:
   ```bash
   pm2 restart taggd-dashboard
   ```

3. **Clear Browser Cache**
   - Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - Or try incognito/private browsing mode

4. **Check Port**
   ```bash
   netstat -tuln | grep 3000
   ```
   Should show port 3000 is LISTENING

5. **Restart Service**
   ```bash
   fuser -k 3000/tcp 2>/dev/null || true
   pm2 restart taggd-dashboard
   ```

---

## 📊 What You'll See When It Loads

### First Screen (Welcome Modal)
- Welcome message: "Welcome, Tagger!"
- Dashboard introduction
- "Get Started" button
- Can be dismissed (won't show again)

### Main Dashboard Layout
- **Left Sidebar** - Navigation menu with 11 views
- **Header** - TAGGD logo, filters, dark mode toggle
- **Main Content** - Currently selected view with charts and data
- **Footer** - Confidentiality notice

### 11 Available Views
1. Overview
2. Executive View ⭐
3. Monthly Performance
4. Quarterly Performance
5. Year-over-Year
6. Account Analysis 🔍
7. Regional Analysis
8. Practice Head Analysis
9. Industry Benchmarking
10. Not Reported Analysis
11. About Dashboard

---

## 🎯 Quick Test Steps

1. **Open URL** in browser:
   ```
   https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
   ```

2. **Wait 2-3 seconds** for data to auto-load

3. **Dismiss welcome modal** by clicking "Get Started"

4. **Navigate views** using left sidebar

5. **Try a filter:**
   - Select "FY 25-26" from Fiscal Year
   - Click "Apply Filters"
   - See data update

6. **Try drill-down:**
   - Click "Account Analysis" in sidebar
   - Click any project name in the table
   - See performance measures modal

7. **Try export:**
   - Click "Export Dashboard" in sidebar
   - Select "PDF"
   - Wait for download

---

## 💡 Pro Tips

### For Best Experience:
- ✅ Use **Chrome** or **Edge** browser (best compatibility)
- ✅ Allow **JavaScript** to run
- ✅ Allow **pop-ups** for exports
- ✅ Use **desktop/laptop** for full features (mobile works but limited)
- ✅ Stable **internet connection** for CDN libraries

### For Fastest Loading:
- ✅ Dashboard auto-loads sample data
- ✅ First load may take 2-3 seconds (loading libraries)
- ✅ Subsequent navigation is instant
- ✅ Charts render on-demand

### For Sharing:
- ✅ Share the public URL with team members
- ✅ No authentication required (demo mode)
- ✅ Everyone sees the same data (sample_data.json)
- ✅ Filters apply per browser session

---

## 📞 Still Can't Preview?

If you still can't see the dashboard in the AI Developer preview section:

**Solution: Use Direct Browser Access**

The dashboard is **100% accessible** via the public URL. The AI Developer preview section might have iframe restrictions or limitations, but the dashboard itself is fully functional.

**Just open your web browser and go to:**
```
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
```

This will give you the **exact same experience** as the preview section would, with full functionality.

---

## ✨ Summary

**Your dashboard IS working and accessible!**

- ✅ Service is running (PM2 status: online)
- ✅ Port 3000 is accessible
- ✅ Public URL is active and responding
- ✅ All files are serving correctly
- ✅ All features are functional

**Access it now:**
👉 https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai

---

*If you continue to have issues, please provide details about what error message or behavior you're seeing, and I can help troubleshoot further.*
