# ✅ Fixed: Accounts Under Audit Now Shows 15/49

## Issue Resolved
**Problem**: Home tab was showing "15/52" instead of "15/49"  
**Root Cause**: Function was counting unique accounts from both Account_Summary AND Parameter_Audit_Count (52 unique accounts)  
**Solution**: Changed to count only total rows in Account_Summary sheet (49 rows)

---

## Fix Details

### Changed Calculation Logic

**Before (Incorrect - showing 52):**
```javascript
// Counted unique accounts from Account_Summary
const uniqueAccounts = new Set();
accountSummary.forEach(...) // Add accounts from Account_Summary
parameterAuditCount.forEach(...) // Add accounts from Parameter_Audit_Count
totalAccounts = uniqueAccounts.size; // Result: 52
```

**After (Correct - showing 49):**
```javascript
// Simply count total rows in Account_Summary
const totalAccounts = window.dashboardData.accountSummary.length; // Result: 49
```

---

## Calculation Breakdown

### Format: `UnderAudit/Total`

- **15** = Accounts with `Audit Status = "YES"` from Account_Summary
- **49** = Total rows in Account_Summary sheet

### Why This Makes Sense
The Account_Summary sheet contains all accounts in the system (49 total). Of these:
- 15 have `Audit Status = "YES"` (actively being audited)
- 34 have `Audit Status = "NO"` (not currently under audit)
- **Total = 49** (all accounts in Account_Summary)

---

## Files Changed
- `index.html` - Updated `getAccountsUnderAudit()` function
  - Removed complex unique account counting logic
  - Simplified to use `accountSummary.length`
  - 1 file changed, 3 insertions(+), 24 deletions(-)

---

## Git Commit

**Commit Hash**: `60d14c5`  
**Message**: "Fix: Accounts Under Audit to show 15/49 on Home tab"  
**Branch**: `main`  
**Push Status**: ✅ Successful

**Push Output**:
```
To https://github.com/Businessexcellence/Quality-Dashboard.git
   389355f..60d14c5  main -> main
```

---

## Testing

### Sandbox (Live Now) ✅
🔍 **https://3000-iiqzlm50w1twpgggr1553-82b888ba.sandbox.novita.ai**
- Card now shows "15/49"
- Hard refresh to verify

### Production (Live in 2-5 minutes) ⏳
🌐 **https://businessexcellence.github.io/Quality-Dashboard/**
- Wait 2-5 minutes for GitHub Pages rebuild
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Verify home page shows "15/49"

---

## Verification Steps

1. **Open Home Tab**
2. **Check Scrolling Cards Section**
3. **Find "Accounts Under Audit" card** (first card)
4. **Verify Value**: Should display **"15/49"** (not "15/52")
5. **Check Label**: "Active Audits"
6. **Check Ribbon**: "Accounts"

---

## Console Logs (for debugging)
The function now logs:
```
🔍 getAccountsUnderAudit called
📊 Accounts Under Audit: 15
📊 Total Accounts (from Account_Summary): 49
```

---

## Data Source

**Account_Summary Sheet**:
- Total rows: 49
- Audit Status = "YES": 15
- Audit Status = "NO": 34

This is the single source of truth for both numbers.

---

## Status
🟢 **FIXED AND DEPLOYED**
- ✅ Calculation logic corrected
- ✅ Server restarted
- ✅ Commit created (60d14c5)
- ✅ Pushed to GitHub
- ⏳ GitHub Pages rebuilding (2-5 minutes)
- ⏳ Production will show "15/49" after rebuild

**The Home tab will now correctly display "15/49" on both sandbox and production!**
