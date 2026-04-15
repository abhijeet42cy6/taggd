# 🚀 How to Upload and Test Your Base File.xlsx

## Quick Start Guide

### ⚡ 3-Step Process

**Step 1:** Open the Dashboard  
👉 https://3000-ifyzmdkl96jjed6itxsc7-d0b9e1e2.sandbox.novita.ai

**Step 2:** Upload Your Excel File  
- Click the **orange "Upload Excel"** button (top right corner)
- OR drag and drop your file into the upload zone
- OR download sample file from the upload modal

**Step 3:** View Account Summary  
- Click **"Account Summary"** in the left navigation (2nd item)
- Explore filters, KPIs, map, and table

---

## 📊 Detailed Instructions

### Opening the Dashboard

1. **Navigate to:** https://3000-ifyzmdkl96jjed6itxsc7-d0b9e1e2.sandbox.novita.ai
2. **Hard refresh** to clear cache:
   - **Windows/Linux:** `Ctrl + Shift + R`
   - **Mac:** `Cmd + Shift + R`
3. **Open Developer Console** (for debugging):
   - Press `F12` or right-click → "Inspect" → Console tab

---

### Uploading Your File

#### Method 1: Click to Upload
1. Click the **"Upload Excel"** button in the top-right header (orange gradient button)
2. A modal will appear with an upload zone
3. Click the upload zone or click anywhere in the modal
4. Select your **"Base File.xlsx"** from your computer
5. Wait for upload progress bar (30% → 60% → 100%)
6. Success alert will appear: "✅ Data loaded successfully!"

#### Method 2: Drag and Drop
1. Click the **"Upload Excel"** button to open the modal
2. Drag your **"Base File.xlsx"** file
3. Drop it into the dashed border upload zone
4. Upload will start automatically
5. Wait for success alert

#### Method 3: Download Sample First
1. Open upload modal
2. Click **"Download Sample: Base File.xlsx"** link at bottom of upload zone
3. Use this as a reference for your file structure
4. Upload your own file following the same format

---

### What Happens During Upload?

The console will show detailed logs:

```
🔄 File upload started...
📁 File selected: Base File.xlsx Size: 1.70MB
📊 Starting to read file...
📖 File read complete, parsing...
📦 File data loaded: 1782016 bytes
📊 Workbook parsed successfully
📊 Available sheets: ["Parameter_Audit_Count", "Recruiter_Audit_Count", "Account_Summary", ...]
✅ Parameter_Audit_Count rows: 42
✅ Recruiter_Audit_Count rows: 18
✅ Account_Summary rows: 56  👈 YOUR DATA IS HERE
📄 First Account_Summary row: {Account: "...", Practice Head: "...", ...}
✅ RCA_CAPA rows: 12
✅ Projects rows: 8
✅ CSAT rows: 15
💾 Data saved to localStorage
✅ All data loaded successfully!
```

**🎉 Success Alert:**
```
✅ Data loaded successfully!

📊 Summary:
- Parameter Audits: 42
- Account Summary: 56
- Recruiter Audits: 18
```

---

### Viewing Account Summary Tab

After successful upload:

1. **Click "Account Summary"** in the left sidebar (2nd navigation item)
2. You should see:

   **✅ Filter Cards** (top section)
   - Client Interaction (Yes/No with counts)
   - Practice Head (all unique values with counts)
   - Audit Status (Yes/No with counts)
   - Audit Frequency (values with counts)

   **✅ Key Metrics** (4 large KPI cards)
   - Active Accounts (clickable)
   - Regional Heads (clickable)
   - Client Interactions (Yes) (clickable)
   - Audit Status (Yes) (clickable)

   **✅ BE SPOC Boxes** (2 side-by-side cards)
   - BE SPOC - Audit (top 5 SPOCs with counts)
   - BE SPOC - SLAs/KPIs (top 5 SPOCs with counts)

   **✅ India Map** (region visualization)
   - Circles showing North, South, East, West, Central regions
   - Circle size = account count
   - Colors: Green (>10), Orange (5-10), Gray (<5)

   **✅ Account Details Table** (bottom)
   - 9 columns with all account information
   - Up to 100 accounts displayed
   - Row numbers, badges for Audit Status
   - Filtered count display

---

## 🔍 Debugging & Troubleshooting

### Problem: "Upload modal won't open"
**Fix:**
- Hard refresh the page (Ctrl+Shift+R)
- Check console for JavaScript errors
- Try clicking exactly on the orange "Upload Excel" text

### Problem: "File upload fails"
**Check:**
1. **File format:** Must be .xlsx or .xls
2. **File size:** Must be under 5MB
3. **Sheet names:** Must include "Account_Summary" (case-sensitive)
4. **Console errors:** Open F12 → Console to see detailed error
5. **File corruption:** Try opening file in Excel first

**Common Console Errors:**
```
❌ Error parsing Excel: [error message]
⚠️ Sheet 'Account_Summary' not found
❌ Please upload an Excel file (.xlsx or .xls)
```

### Problem: "Account Summary tab is blank"
**Debug Steps:**

1. **Check if data loaded:**
   ```javascript
   // In browser console (F12)
   console.log('Rows:', dashboardData.accountSummary.length);
   console.log('First row:', dashboardData.accountSummary[0]);
   ```

2. **Check column names:**
   ```javascript
   console.log('Columns:', Object.keys(dashboardData.accountSummary[0]));
   ```

3. **Verify sheet name:**
   - Open your Excel file
   - Check the sheet tab name is exactly: `Account_Summary`
   - NOT: `AccountSummary`, `Account Summary`, or `account_summary`

4. **Clear cache and retry:**
   ```javascript
   localStorage.clear();
   location.reload();
   ```
   Then re-upload the file

### Problem: "Filters not showing"
**Possible Causes:**
1. Data loaded but columns are named differently
2. Values in filter columns are empty/null
3. Sheet structure doesn't match expected format

**Fix:**
- Console log will show: `📋 Available Account Summary columns: [...]`
- Compare this list with expected columns:
  - Client Interaction
  - Practice Head
  - Audit Status
  - Audit Frequency
- Adjust Excel column names to match exactly

### Problem: "Map shows no data"
**Fix:**
- The map uses "Regional Head" column
- Ensure Regional Head values contain keywords:
  - North, Delhi, Punjab, Haryana
  - South, Bangalore, Chennai, Hyderabad
  - East, Kolkata, Bhubaneswar
  - West, Mumbai, Pune, Ahmedabad
- Check console: `🗺️ India map rendered with region data: {...}`

---

## 📋 Expected File Structure

### Your Excel File Should Have These Sheets:
1. ✅ **Account_Summary** (REQUIRED for Account Summary tab)
2. ✅ Parameter_Audit_Count (for Home tab calculations)
3. ✅ Recruiter_Audit_Count (for Recruiter tab)
4. ⚪ RCA_CAPA (optional)
5. ⚪ Projects (optional)
6. ⚪ CSAT (optional)

### Account_Summary Sheet Columns:
Required or flexible alternatives:

| Column Name | Alternatives | Example Values |
|-------------|--------------|----------------|
| Account | Client, Account Name | "Acme Corp", "TechStart" |
| Practice Head | Practice | "John Doe", "Jane Smith" |
| Regional Head | Region, Regional | "North India", "Mumbai" |
| Audit Status | - | "Yes", "No" |
| Client Interaction | Interaction | "Yes", "No" |
| Audit Frequency | Frequency | "Monthly", "Quarterly" |
| BE SPOC - Audit | BE SPOC Audit, SPOC Audit | "Sarah Johnson" |
| BE SPOC - SLAs/KPIs | BE SPOC SLA, SPOC SLA | "Mike Williams" |

**Note:** Column names are flexible. The code will try common variations.

---

## 🎯 Interactive Features (After Upload)

### Clickable Elements:

1. **Filter Cards**
   - Click any filter card to view only matching accounts
   - Filter applies to table below
   - Orange border shows active filter

2. **KPI Cards (4 cards)**
   - **Active Accounts** → Filters by Audit Status = Yes
   - **Regional Heads** → Shows breakdown alert
   - **Client Interactions (Yes)** → Filters by Client Interaction = Yes
   - **Audit Status (Yes)** → Same as Active Accounts

3. **BE SPOC Boxes**
   - Click to see alert about SPOC details
   - Future: Will show detailed SPOC account lists

4. **India Map Regions**
   - Click circles to see region details
   - Shows region name and account count

5. **Account Table Rows**
   - Click any row to see account details alert
   - Future: Will show detailed account modal

---

## 💡 Pro Tips

### For Best Experience:
1. ✅ Use .xlsx format (not .xls for better compatibility)
2. ✅ Keep file size under 5MB
3. ✅ Ensure sheet name is exactly "Account_Summary"
4. ✅ Use exact column names or common variations
5. ✅ Fill all rows with data (avoid empty rows in middle)
6. ✅ Open console (F12) to see upload progress
7. ✅ Hard refresh after code updates

### Data Persistence:
- Data is saved to browser's localStorage
- Survives page refreshes
- Clear with: `localStorage.clear()` in console
- Upload new file to replace data

### Testing Different Files:
1. Clear existing data: `localStorage.clear()`
2. Refresh page: `location.reload()`
3. Upload new file
4. Navigate to Account Summary tab

---

## 📞 Support & Help

### Console Commands for Debugging:

```javascript
// Check if data exists
dashboardData

// Check Account Summary length
dashboardData.accountSummary.length

// See first account
dashboardData.accountSummary[0]

// See all column names
Object.keys(dashboardData.accountSummary[0])

// Manually refresh Account Summary
refreshAccountSummaryTab()

// Clear all data
localStorage.clear()

// Reload page
location.reload()
```

### Common Issues & Quick Fixes:

| Issue | Quick Fix |
|-------|-----------|
| Upload button not visible | Hard refresh (Ctrl+Shift+R) |
| File won't upload | Check file size < 5MB, format = .xlsx |
| No data in Account Summary | Verify sheet name = "Account_Summary" |
| Filters blank | Check column names in Excel match expected |
| Map blank | Add region keywords to Regional Head column |
| Console errors | Share error message for support |

---

## ✅ Success Checklist

After upload, you should see:

- ✅ Success alert with row counts
- ✅ Console shows "✅ Account_Summary rows: XX"
- ✅ Filter cards with counts (4 types of filters)
- ✅ KPI cards with numbers (4 cards)
- ✅ BE SPOC boxes with names and counts
- ✅ India map with colored circles
- ✅ Account table with data rows
- ✅ All elements are orange/black/white themed
- ✅ All cards and rows are clickable

---

**Need Help?**
- Check browser console (F12)
- Look for red error messages
- Copy console logs and share for support
- Verify file structure matches expected format

**Dashboard URL:**  
🔗 https://3000-ifyzmdkl96jjed6itxsc7-d0b9e1e2.sandbox.novita.ai

**Last Updated:** 2024-12-24  
**Status:** ✅ READY FOR TESTING
