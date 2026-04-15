# 🟠 Taggd Finance Dashboard

> **Executive Finance Dashboard** — Built by Taggd · Powered by AI  
> Live multi-year financial analytics: Revenue, CM%, Collections, Hiring, Projects

---

## 🚀 Live Demo

Once deployed via GitHub Pages, your dashboard will be live at:
```
https://<your-github-username>.github.io/<your-repo-name>/
```

---

## 📂 Project Structure

```
taggd-finance-dashboard/
├── index.html                  ← Main dashboard (all views)
├── upload.html                 ← Data Manager — download template & upload new data
├── css/
│   ├── style.css               ← All dashboard styles (Taggd orange theme)
│   └── lib/
│       └── fontawesome.min.css ← Icons (local, no CDN needed)
│           fa-solid-900.woff2
│           fa-brands-400.woff2
│           fa-regular-400.woff2
├── js/
│   ├── app.js                  ← Dashboard logic, charts, filters, render engine
│   ├── data.js                 ← All financial data (FY24-25, FY25-26)
│   └── lib/
│       ├── chart.umd.min.js               ← Chart.js (local)
│       └── chartjs-plugin-datalabels.min.js
├── images/
│   └── taggd-logo.png          ← Taggd logo
└── .github/
    └── workflows/
        └── deploy.yml          ← GitHub Actions auto-deploy to GitHub Pages
```

---

## 📊 Dashboard Views

| View | Description |
|------|-------------|
| **Executive Overview** | KPI tiles, revenue/CM trend, regional breakdown |
| **P&L Statement** | Monthly Revenue, CM, variance vs budget |
| **Revenue Analysis** | Account scorecard, FY comparison, vertical split |
| **Expense & CM** | CM%, CM amount trends, regional CM |
| **Hiring Analysis** | Joiners (Taggd vs Non-Taggd), headcount trend |
| **Collections & Cash** | Collections attainment, unbilled, bad debt |
| **Project Scorecard** | All accounts grouped by Lateral / Leadership |
| **Data Manager** | Upload new Excel data, download template |

---

## 🔄 Updating Data (No-Code Workflow)

1. Go to the **Upload / Update Data** page (`upload.html`)
2. Click **Download Template** → get `Taggd_Finance_Template.xlsx`
3. Fill in your monthly numbers (RevA, CmA, Collections, Joiners, etc.)
4. Upload the file back → click **Apply to Dashboard**
5. All charts and KPIs refresh instantly in your browser

### To permanently update data (for all users after re-deploy):
1. Open `js/data.js`
2. Update the relevant monthly arrays and totals
3. Commit & push → GitHub Actions auto-deploys in ~60 seconds

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | Vanilla HTML5 + CSS3 |
| Charts | Chart.js v4 + DataLabels plugin (local) |
| Icons | Font Awesome 6 (local) |
| Excel I/O | SheetJS (xlsx) via CDN (upload page only) |
| Hosting | GitHub Pages (static) |
| CI/CD | GitHub Actions |

---

## ⚡ Deploy to GitHub Pages (5 minutes)

See **[DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)** for full step-by-step instructions.

**Quick version:**
```bash
git init
git add .
git commit -m "Initial deploy: Taggd Finance Dashboard"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
Then enable GitHub Pages: **Settings → Pages → Source: GitHub Actions**

---

## 📅 Data Coverage

| Fiscal Year | Months with Actuals | Status |
|-------------|--------------------:|--------|
| FY 2024-25  | 12 / 12 | ✅ Complete |
| FY 2025-26  | 11 / 12 (Apr25–Feb26) | 🔄 In Progress |
| FY 2026-27  | 0 / 12 | 🔲 Template ready |

---

## 🏗 Adding a New Fiscal Year

1. Add a row to `FY_CONFIG` sheet in the Excel template
2. Add 12 monthly data rows to `MONTHLY_DATA`
3. Fill `TOTALS`, `BY_REGION`, `BY_VERTICAL`, `PROJECTS`
4. Upload via `upload.html`  
   **OR** manually add to `js/data.js`:
```js
FY2627: {
  label: 'FY 2026-27', short: 'FY26-27',
  months:  ['Apr26','May26',...,'Mar27'],
  mLabels: ['Apr','May',...,'Mar'],
  totals:  { ... },
  monthly: { revA: [...], revB: [...], ... },
  byRegion: [...], byVertical: [...], projects: [...]
}
```

---

## 👥 Credits

- **Made by Taggd** — [taggd.com](https://taggd.com)
- **Powered by AI** — Built with Genspark AI

---

*Last updated: March 2026 — (1) CM row in summary table: Var vs Forecast column removed (was showing blended value, now shows '—' to avoid confusion). (2) Revenue Forecast logic updated: Monthly/Quarterly periods use pure Rev_Forecast sheet values; YTD/All months use blended actuals+forecast. (3) Actual Revenue confirmed through Jan'26 only (Feb'26 and Mar'26 = 0, only used for YTD blended forecast). (4) Revenue Adjustment added to Collections & Cash view with account-wise table and FY comparison. (5) Account-wise Unbilled & Bad Debt tables added in Collections & Cash view. (6) PPC formula confirmed: Sum of Total Cost / Headcount Overall (weighted avg) — updated with new FY25-26 TC data from FY2526_latest.xlsx. New monthly PPC values: Apr=92602, May=96285, Jun=94563, Jul=103795, Aug=103463, Sep=104367, Oct=106673, Nov=108424, Dec=105658, Jan=100206. (7) Unbilled Revenue and Bad Debt now show FY comparison in both the Summary Table and Collections & Cash view charts. (8) FY25-26 Total Cost per-project data updated with correct values from new Excel file — HPE, SBI Card, Hyundai Motor, Maruti Suzuki, Jindal Stainless, Ambuja Cement, Tata Consumer, Atomberg, Bridgestone all updated. New accounts with TC data added: Optum, Pernod Ricard, Siemens Healthnier, ABB, UniCharm, Saint Gobain, Leap India, NeoSoft, Leadership accounts.*
