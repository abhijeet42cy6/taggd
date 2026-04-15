# 🔍 DECEMBER DATA - TROUBLESHOOTING CHECKLIST

## ⚡ Quick Fix (Do This First!)

### **1. Clear Browser Cache - CRITICAL!**

**Option A: Hard Refresh (Fastest)**
- Windows: `Ctrl + Shift + R` or `Ctrl + F5`
- Mac: `Cmd + Shift + R`

**Option B: Full Cache Clear (Most Effective)**
- Windows Chrome/Edge: `Ctrl + Shift + Delete`
- Mac Chrome/Edge: `Cmd + Shift + Delete`
- Select "All time"
- Check "Cached images and files"
- Click "Clear data"

**Option C: Incognito Mode (Guaranteed Fresh)**
- Windows: `Ctrl + Shift + N`
- Mac: `Cmd + Shift + N`
- Navigate to dashboard URL

---

## ✅ Verification Checklist

### **Open Dashboard & Press F12 (DevTools)**

Then check each item:

- [ ] **Console shows:** "Dashboard Version: 2.1.0"
- [ ] **Console shows:** "December 2025 Data Update"
- [ ] **Console shows:** `["Dec_Met", "Dec_Not_Met"]`
- [ ] **Console shows:** Sample data: `[3, 0, 0, 0, 19]`
- [ ] **Overview chart** has 9 bars (Apr-Dec)
- [ ] **Monthly Performance** table shows December column
- [ ] **Quarterly view** shows Q3 complete (Oct-Dec)
- [ ] **Project drill-down** shows Dec25 Score
- [ ] **Not Reported view** shows December data
- [ ] **Project name** is "Ambuja Cement" (not Adani)

---

## 🔴 If December STILL Not Visible

### **Check 1: Verify Excel File Timestamp**

In browser console (F12), you should see:
```
🔄 Auto-loading Excel file from server...
📅 Dashboard Version: 2.1.0 - December 2025 Data Update
```

If NOT, go to Network tab:
1. Press F12
2. Click "Network" tab
3. Refresh page (F5)
4. Find "SLA_Monthly_Status_Summary_FINAL.xlsx"
5. Check URL - should have `?v=TIMESTAMP`
6. Example: `...xlsx?v=1738003200000` ✅
7. Without `?v=`: ❌ (cache-busting not working)

---

### **Check 2: Verify File on Server**

**For Sandbox URL:**
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai

**For GitHub Pages:**
https://businessexcellence.github.io/SLA-DASHBOARD/

1. Wait 2-3 minutes after push (GitHub Pages needs time)
2. Clear cache completely
3. Open in Incognito mode

---

### **Check 3: Console Errors**

Press F12 and look for:

**❌ BAD (means there's an error):**
```
❌ Error auto-loading Excel file: ...
Failed to fetch
404 Not Found
```

**✅ GOOD (means it's working):**
```
✅ Excel file fetched from server
✅ December columns found in FY 25-26: ["Dec_Met", "Dec_Not_Met"]
📊 Sample Dec_Met values: [3, 0, 0, 0, 19]
✅ Data auto-loaded successfully!
```

---

### **Check 4: Browser Issues**

Try these in order:

1. **Different Browser**
   - Chrome → Edge
   - Edge → Firefox
   - Firefox → Chrome

2. **Clear ALL Browser Data**
   - Settings → Privacy
   - Clear ALL browsing data
   - "All time" period
   - ALL checkboxes checked

3. **Reset Browser**
   - Chrome: Settings → Reset settings
   - Edge: Settings → Reset settings

---

### **Check 5: Network Issues**

**Test file loads directly:**

Sandbox:
```
https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai/SLA_Monthly_Status_Summary_FINAL.xlsx
```

GitHub Pages:
```
https://businessexcellence.github.io/SLA-DASHBOARD/SLA_Monthly_Status_Summary_FINAL.xlsx
```

If file downloads:
- ✅ File is accessible
- ❌ Cache issue - clear cache again

If file doesn't download:
- ❌ File not uploaded properly
- Contact technical support

---

## 🎯 Quick Test Commands

### **For Technical Team:**

**Test 1: Check service**
```bash
curl -s http://localhost:3000 | grep "Dashboard Version" | head -1
```
Should show: "Dashboard Version: 2.1.0"

**Test 2: Check file exists**
```bash
ls -lh /home/user/webapp/public/SLA_Monthly_Status_Summary_FINAL.xlsx
```
Should show: 478K size

**Test 3: Check December in Excel**
```bash
cd /home/user/webapp && python3 -c "
import openpyxl
wb = openpyxl.load_workbook('public/SLA_Monthly_Status_Summary_FINAL.xlsx')
ws = wb['FY 25-26 Summary']
headers = [cell.value for cell in ws[1]]
dec_cols = [h for h in headers if h and 'Dec' in str(h)]
print('December columns:', dec_cols)
"
```
Should show: `['Dec_Met', 'Dec_Not_Met']`

**Test 4: Check PM2 service**
```bash
pm2 list | grep taggd-dashboard
```
Should show: "online"

---

## 📊 What You Should See

### **Console Output (F12):**
```
🔄 Auto-loading Excel file from server...
📅 Dashboard Version: 2.1.0 - December 2025 Data Update
🕐 Load Time: 1/27/2026, 4:45:00 PM
✅ Excel file fetched from server
Workbook sheets: (4) ['FY 24-25 Summary', 'FY 25-26 Summary', 'FY24-25 Not Reported', 'FY25-26 Not Reported']
✅ FY24-25 Not Reported data loaded: 42 rows
✅ FY25-26 Not Reported data loaded: 42 rows
✅ FY 25-26 Metrics Details loaded: 1024 performance measures
FY 24-25 rows: 42
FY 25-26 rows: 42
✅ December columns found in FY 25-26: (2) ['Dec_Met', 'Dec_Not_Met']
📊 Sample Dec_Met values: (5) [3, 0, 0, 0, 19]
📊 Sample Dec_Not_Met values: (5) [5, 0, 0, 0, 22]
✅ Data auto-loaded successfully!
🎉 Dashboard ready with auto-loaded data!
```

### **Overview Chart:**
```
Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
 |    |    |    |    |    |    |    |    |
 ■    ■    ■    ■    ■    ■    ■    ■    ■  ← 9 bars!
```

### **Monthly Performance Table:**
```
Month    | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
---------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
FY 25-26 | 85% | 87% | 84% | 86% | 88% | 85% | 87% | 86% | 85% |
                                                              ↑
                                                       December!
```

---

## ✅ Success Indicators

### **All Green = Working:**

- ✅ Console: "2.1.0 - December 2025 Data Update"
- ✅ Console: December columns found
- ✅ Console: Sample data visible
- ✅ Chart: 9 months shown
- ✅ Table: December column
- ✅ Name: "Ambuja Cement"

### **Any Red = Issue:**

- ❌ Console: Error messages
- ❌ Console: No version string
- ❌ Console: No December columns
- ❌ Chart: Only 8 months
- ❌ Table: No December column

---

## 🆘 Still Having Issues?

### **Collect This Information:**

1. **Screenshot of browser console** (F12)
2. **Screenshot of the issue** (what you see vs what you expect)
3. **URL you're using** (sandbox or GitHub Pages)
4. **Browser name and version** (Chrome 120, Edge 119, etc.)
5. **Operating System** (Windows 11, macOS, etc.)
6. **Cache clearing method tried** (hard refresh, full clear, incognito)
7. **Time of last attempt** (so we can check logs)

### **Send to:**
Technical Support with subject: "December Data Not Visible"

---

## 🎯 Most Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **Only 8 months showing** | Browser cache | Hard refresh: Ctrl+Shift+R |
| **No December column** | Old cached file | Clear all cache, use Incognito |
| **Console errors** | Network/file issue | Check Network tab, verify file URL |
| **"Adani" still appears** | Cache not cleared | Full cache clear, restart browser |
| **Different results in different browsers** | Each browser has own cache | Clear each browser's cache separately |

---

## 📱 Mobile Device Issues

### **iOS Safari:**
1. Settings → Safari → Clear History and Website Data
2. Or: Long-press refresh button → Request Desktop Site

### **Android Chrome:**
1. Three dots menu → Settings → Privacy
2. Clear browsing data → All time
3. Check "Cached images and files"

---

**REMEMBER: 90% of "not working" issues are browser cache!**

**The fix: Clear cache completely and refresh!** 🔄

---

**Version:** 2.1.0  
**Status:** ✅ Fix Deployed  
**Last Updated:** January 27, 2026
