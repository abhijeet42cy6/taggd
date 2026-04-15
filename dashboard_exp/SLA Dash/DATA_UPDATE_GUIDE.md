# 📊 TAGGD Dashboard - Data Update Guide

## Overview

Your TAGGD Dashboard now supports **automatic data loading**! When users visit the live URL, the dashboard automatically loads default data from `sample_data.json` so they can explore features immediately without uploading files.

## 🔄 Two Ways to Use the Dashboard

### Option 1: Demo Mode (Default)
- Dashboard loads `sample_data.json` automatically
- Users can explore all features with sample data
- No file upload required
- Perfect for sharing and demos

### Option 2: Custom Data Upload
- Users click "Upload Your Data" button
- Select their Excel file
- Dashboard processes and displays their data
- Overrides the default sample data

---

## 📁 Data File Structure

The `sample_data.json` file contains 4 main sections:

```json
{
  "fy24_25": [ /* FY 24-25 Summary data */ ],
  "fy25_26": [ /* FY 25-26 Summary data */ ],
  "fy2425NotReported": [ /* FY 24-25 Not Reported data */ ],
  "fy2526NotReported": [ /* FY 25-26 Not Reported data */ ]
}
```

### Required Fields for Each Data Row:

#### Summary Data (fy24_25 and fy25_26):
```json
{
  "Project": "Project Name",
  "Region": "Region Name",
  "Practice Head": "Practice Head Name",
  "Apr MET/NOT_MET": 85,
  "May MET/NOT_MET": 90,
  "Jun MET/NOT_MET": 88,
  "Jul MET/NOT_MET": 92,
  "Aug MET/NOT_MET": 87,
  "Sep MET/NOT_MET": 91,
  "Oct MET/NOT_MET": 89,
  "Nov MET/NOT_MET": 93,
  "Dec MET/NOT_MET": 90,
  "Jan MET/NOT_MET": 88,
  "Feb MET/NOT_MET": 92,
  "Mar MET/NOT_MET": 94
}
```

#### Not Reported Data (fy2425NotReported and fy2526NotReported):
```json
{
  "Project": "Project Name",
  "Region": "Region Name",
  "Practice Head": "Practice Head Name",
  "Apr MET/NOT_MET_NotReported": 5,
  "May MET/NOT_MET_NotReported": 3,
  "Jun MET/NOT_MET_NotReported": 4,
  "Jul MET/NOT_MET_NotReported": 2,
  "Aug MET/NOT_MET_NotReported": 4,
  "Sep MET/NOT_MET_NotReported": 3,
  "Oct MET/NOT_MET_NotReported": 3,
  "Nov MET/NOT_MET_NotReported": 2,
  "Dec MET/NOT_MET_NotReported": 3,
  "Jan MET/NOT_MET_NotReported": 4,
  "Feb MET/NOT_MET_NotReported": 2,
  "Mar MET/NOT_MET_NotReported": 1
}
```

---

## 🔧 How to Update Data

### Method 1: Convert Excel to JSON (Recommended)

You have two options to convert your Excel file to JSON:

#### Option A: Python Script

Create a file called `excel_to_json.py`:

```python
import pandas as pd
import json

# Read Excel file
excel_file = 'your_data_file.xlsx'

# Read sheets
fy24_25 = pd.read_excel(excel_file, sheet_name='FY 24-25 Summary')
fy25_26 = pd.read_excel(excel_file, sheet_name='FY 25-26 Summary')
fy2425_nr = pd.read_excel(excel_file, sheet_name='FY24-25 Not Reported')
fy2526_nr = pd.read_excel(excel_file, sheet_name='FY25-26 Not Reported')

# Convert to dictionary
data = {
    'fy24_25': fy24_25.to_dict('records'),
    'fy25_26': fy25_26.to_dict('records'),
    'fy2425NotReported': fy2425_nr.to_dict('records'),
    'fy2526NotReported': fy2526_nr.to_dict('records')
}

# Save as JSON
with open('sample_data.json', 'w') as f:
    json.dump(data, f, indent=2)

print('✅ Conversion complete! sample_data.json created.')
```

Run with:
```bash
pip install pandas openpyxl
python excel_to_json.py
```

#### Option B: Online Converter

1. Go to https://www.convertcsv.com/xlsx-to-json.htm
2. Upload your Excel file
3. Convert each sheet separately
4. Manually combine into the structure shown above

### Method 2: Manual JSON Editing

1. Open `sample_data.json` in a text editor
2. Update the data arrays directly
3. Ensure JSON syntax is valid
4. Save the file

---

## 🚀 Publishing Updates

### If Using GitHub Pages:

1. **Update the JSON file:**
   ```bash
   # Edit sample_data.json with your new data
   nano sample_data.json
   ```

2. **Commit and push to GitHub:**
   ```bash
   git add sample_data.json
   git commit -m "Update dashboard data for [Month Year]"
   git push origin main
   ```

3. **Wait 1-2 minutes** for GitHub Pages to rebuild
4. **All users see new data automatically** when they visit the URL

### If Using Cloudflare Pages:

1. **Update the JSON file:**
   ```bash
   nano sample_data.json
   ```

2. **Deploy to Cloudflare:**
   ```bash
   git add sample_data.json
   git commit -m "Update dashboard data"
   git push origin main
   
   # Cloudflare auto-deploys on git push
   # Or manually deploy:
   npx wrangler pages deploy . --project-name taggd-dashboard
   ```

3. **Updates are live immediately**

---

## 📊 Workflow for Regular Updates

### Monthly Update Process:

1. **Prepare Data:**
   - Update your Excel file with latest SLA data
   - Ensure all required sheets exist:
     - `FY 24-25 Summary`
     - `FY 25-26 Summary`
     - `FY24-25 Not Reported`
     - `FY25-26 Not Reported`

2. **Convert to JSON:**
   ```bash
   python excel_to_json.py
   ```

3. **Test Locally:**
   ```bash
   # Start local server
   python -m http.server 3000
   
   # Open browser to http://localhost:3000
   # Verify data loads correctly
   ```

4. **Deploy:**
   ```bash
   git add sample_data.json
   git commit -m "Update data: [Month] [Year]"
   git push origin main
   ```

5. **Verify:**
   - Visit your live URL
   - Confirm new data appears
   - Test all dashboard views
   - Share updated link with team

---

## 🎯 Best Practices

### Data Quality:

1. **Consistent Naming:**
   - Keep project names, regions, and practice head names consistent across months
   - Avoid typos that create duplicate entries

2. **Complete Data:**
   - Include all months up to current period
   - Use actual values, not 0 for future months (the dashboard filters these out)

3. **Validation:**
   - Verify column names match exactly: `"Apr MET/NOT_MET"`, `"May MET/NOT_MET"`, etc.
   - Ensure numeric values are numbers, not strings

### File Management:

1. **Keep Backups:**
   ```bash
   cp sample_data.json sample_data_backup_$(date +%Y%m%d).json
   ```

2. **Version Control:**
   - Use meaningful commit messages
   - Tag major updates: `git tag -a v1.1 -m "Q2 2025 data"`

3. **Documentation:**
   - Update README.md with latest data period
   - Note any significant changes in commit messages

---

## 🔍 Troubleshooting

### Problem: Dashboard shows "Please upload Excel file"

**Cause:** `sample_data.json` file not found or invalid

**Solution:**
```bash
# Check if file exists
ls -la sample_data.json

# Validate JSON syntax
python -m json.tool sample_data.json

# If invalid, fix JSON syntax errors
```

### Problem: Data loads but charts are empty

**Cause:** Missing required fields or incorrect column names

**Solution:**
1. Check column names match exactly: `"Project"`, `"Region"`, `"Practice Head"`
2. Verify month columns: `"Apr MET/NOT_MET"`, `"May MET/NOT_MET"`, etc.
3. Check browser console for error messages (F12)

### Problem: Updates not appearing on live site

**Cause:** Browser cache or deployment delay

**Solution:**
```bash
# Force refresh in browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

# Check deployment status:
git log --oneline -1  # Verify commit was pushed

# For GitHub Pages:
# Check https://github.com/YOUR_USERNAME/YOUR_REPO/actions

# For Cloudflare Pages:
# Check https://dash.cloudflare.com → Pages → Your Project → Deployments
```

---

## 📈 Advanced: Dynamic Data Loading

If you want data to update without redeploying, you can:

### Option 1: External Data Source

Store `sample_data.json` on an external server and update the fetch URL:

```javascript
// In TAGGD_Dashboard_ENHANCED.html, change:
fetch('sample_data.json')

// To:
fetch('https://your-data-server.com/api/latest-data')
```

### Option 2: Google Sheets Integration

1. Publish Google Sheet as JSON
2. Use Google Sheets API
3. Update fetch URL to Google endpoint

### Option 3: Database Backend

For enterprise use:
1. Set up database (e.g., Supabase, Firebase)
2. Create API endpoint
3. Modify dashboard to fetch from API
4. Add authentication if needed

---

## 🎓 Quick Reference

### Essential Files:
- `TAGGD_Dashboard_ENHANCED.html` - Main dashboard
- `sample_data.json` - Auto-loaded data
- `index.html` - Entry point (redirects to dashboard)

### Update Commands:
```bash
# Edit data
nano sample_data.json

# Test locally
python -m http.server 3000

# Deploy
git add sample_data.json
git commit -m "Update data"
git push origin main
```

### Key URLs:
- **Development:** http://localhost:3000
- **Production:** https://YOUR_USERNAME.github.io/YOUR_REPO/

---

## 💡 Tips

1. **Keep it Simple:** Regular updates are better than perfect data
2. **Communicate:** Let users know when data is updated via email/Slack
3. **Schedule Updates:** Set a recurring calendar reminder (e.g., 1st of each month)
4. **Monitor Usage:** Check GitHub/Cloudflare analytics to see who's using the dashboard
5. **Collect Feedback:** Ask users what insights they need

---

## 🆘 Need Help?

- Check browser console (F12) for error messages
- Validate JSON: https://jsonlint.com
- Test locally before deploying
- Review commit history: `git log`
- Revert if needed: `git revert HEAD`

---

**Remember:** The beauty of this system is that data updates happen independently of dashboard code. You can update data monthly without touching the HTML/JavaScript code!
