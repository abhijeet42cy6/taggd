# Duplicate Accounts Debugging Guide

**Date:** November 27, 2025  
**Issue:** Same accounts appearing in BOTH "Most Improved" and "Most Declined" lists  
**Status:** 🔍 Enhanced debugging deployed - awaiting console analysis  

---

## The Mystery

Your screenshot shows that filtering by "North" region produces this impossible result:

### Most Improved Accounts (YoY):
| Account | Change |
|---------|--------|
| Jindal | **+11.0%** |
| SBI Card | **+9.8%** |
| SKF | **+9.4%** |
| Subros | **+-21.7%** |

### Most Declined Accounts (YoY):
| Account | Change |
|---------|--------|
| Subros | **-21.79%** |
| SKF | **-9.4%** |
| SBI Card | **-9.8%** |
| Jindal | **-11.0%** |

**Notice:** The EXACT SAME accounts with EXACTLY OPPOSITE values!

---

## Why This is Impossible

The current logic creates **ONE entry per account**:

```javascript
const uniqueAccounts = new Set([
    ...filteredData.fy24_25.map(row => row.Project),
    ...filteredData.fy25_26.map(row => row.Project)
]);

uniqueAccounts.forEach(accountName => {
    // Calculate FY24 compliance
    // Calculate FY25 compliance
    // Calculate improvement = FY25 - FY24
    
    accountPerformance.push({
        account: accountName,
        fy24Compliance,
        fy25Compliance,
        improvement: fy25Compliance - fy24Compliance  // Single value!
    });
});
```

**Since `improvement` is a SINGLE calculated value** (FY25 - FY24), there's NO WAY the same account can have BOTH +11% AND -11%!

---

## Possible Explanations

### Hypothesis 1: Function Called Multiple Times ⭐ MOST LIKELY
The `renderExecutiveView()` function might be called **TWICE** when you navigate to Executive View or change filters, causing:
1. First call: Processes accounts and adds them to `accountPerformance` array
2. Second call: Processes AGAIN and adds the SAME accounts AGAIN but with different data

**Evidence:** The values are exactly opposite (+11% vs -11%), suggesting the calculation might be reversed on the second pass.

### Hypothesis 2: Data Has Duplicate Rows
When filtering by "North", the source data might contain duplicate rows for the same account:
- Jindal (North, Practice A) - FY24: 85%, FY25: 96% → +11%
- Jindal (North, Practice B) - FY24: 90%, FY25: 79% → -11%

The current logic would aggregate these separately if they're somehow processed twice.

### Hypothesis 3: Array Mutation Bug
The sorting/slicing operations might be mutating the original `accountPerformance` array incorrectly:

```javascript
const top5Improved = [...accountPerformance]  // Shallow copy
    .filter(a => a.fy24Compliance > 0)
    .sort((a, b) => b.improvement - a.improvement)  // Sort by improvement DESC
    .slice(0, 5);

const top5Declined = [...accountPerformance]  // Another shallow copy
    .filter(a => a.fy24Compliance > 0)
    .sort((a, b) => a.improvement - b.improvement)  // Sort by improvement ASC
    .slice(0, 5);
```

However, this looks correct - spread operator creates copies.

---

## Enhanced Debugging Added

I've added comprehensive console logging to capture EXACTLY what's happening:

### 1. Function Call Tracking
```javascript
console.log('🔍 renderExecutiveView() called at', new Date().toLocaleTimeString());
console.log('Stack trace:', new Error().stack);
```
**Purpose:** See if function is called multiple times and from where.

### 2. Filtered Data Analysis
```javascript
console.log('=== FILTERED DATA DEBUG ===');
console.log('FY24-25 rows:', filteredData.fy24_25.length);
console.log('FY25-26 rows:', filteredData.fy25_26.length);
console.log('Accounts with multiple regions:', ...);
```
**Purpose:** Verify filter is working correctly.

### 3. Multiple Rows Detection
```javascript
if (fy24Rows.length > 1) {
    console.log(`⚠️ Account "${accountName}" has ${fy24Rows.length} rows in FY24-25:`, 
        fy24Rows.map(r => ({ Region: r.Region, Practice: r['Practice Head'] })));
}
```
**Purpose:** Identify accounts with duplicate rows.

### 4. Duplicate Account Detection
```javascript
const accountNames = accountPerformance.map(a => a.account);
const duplicates = accountNames.filter((name, index) => accountNames.indexOf(name) !== index);
if (duplicates.length > 0) {
    console.error('🚨 DUPLICATE ACCOUNTS FOUND:', [...new Set(duplicates)]);
    console.log('Duplicate account details:', 
        accountPerformance.filter(a => duplicates.includes(a.account)));
}
```
**Purpose:** Catch if same account appears multiple times in the performance array.

### 5. Cross-List Contamination Check
```javascript
const improvedNames = top5Improved.map(a => a.account);
const declinedNames = top5Declined.map(a => a.account);
const inBoth = improvedNames.filter(name => declinedNames.includes(name));
if (inBoth.length > 0) {
    console.error('🚨 ACCOUNTS IN BOTH LISTS:', inBoth);
}
```
**Purpose:** Verify if accounts appear in both Improved and Declined lists.

---

## How to Diagnose

### Step 1: Open Dashboard with Developer Tools
1. Go to: https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai
2. Press **F12** to open DevTools
3. Click **Console** tab
4. Clear the console (click 🚫 icon)

### Step 2: Reproduce the Issue
1. Select **"North"** from the Region filter dropdown
2. Click **"Executive View"** in the sidebar
3. Wait for charts to load

### Step 3: Examine Console Output
Look for these key indicators:

#### A. Function Call Count
```
🔍 renderExecutiveView() called at 6:44:15 PM
Stack trace: Error
    at renderExecutiveView (index.html:5207)
    at HTMLElement.onclick (index.html:2235)
```
**If you see this message TWICE** → Function is being called multiple times!

#### B. Duplicate Accounts
```
🚨 DUPLICATE ACCOUNTS FOUND: ['Jindal', 'SKF', 'SBI Card', 'Subros']
Duplicate account details: [
  { account: 'Jindal', improvement: 11.0, ... },
  { account: 'Jindal', improvement: -11.0, ... },  ← Same account, different value!
  ...
]
```
**If you see this** → The `accountPerformance` array has duplicate entries!

#### C. Cross-List Contamination
```
🚨 ACCOUNTS IN BOTH LISTS: ['Jindal', 'SKF', 'SBI Card', 'Subros']
```
**If you see this** → Confirms the bug is real and affecting these specific accounts.

#### D. Multiple Rows Per Account
```
⚠️ Account "Jindal" has 3 rows in FY24-25: [
  { Region: 'North', Practice: 'Practice A' },
  { Region: 'North', Practice: 'Practice B' },
  { Region: 'North', Practice: 'Practice C' }
]
```
**If you see this** → Account has multiple rows being aggregated together.

### Step 4: Copy Console Output
1. Right-click in console
2. Select "Save as..."
3. Or copy all text (Ctrl+A, Ctrl+C)
4. Share the output for analysis

---

## Expected Outcomes & Solutions

### Outcome 1: Function Called Twice
**Console Shows:**
```
🔍 renderExecutiveView() called at 6:44:15 PM
...
🔍 renderExecutiveView() called at 6:44:15 PM  ← Called again!
```

**Solution:** Add a debounce or ensure the function is only called once per navigation/filter change.

```javascript
let isRendering = false;
function renderExecutiveView() {
    if (isRendering) {
        console.warn('⚠️ Already rendering, skipping duplicate call');
        return;
    }
    isRendering = true;
    
    try {
        // ... existing logic
    } finally {
        isRendering = false;
    }
}
```

---

### Outcome 2: Duplicate Account Rows
**Console Shows:**
```
⚠️ Account "Jindal" has 2 rows in FY25-26: [
  { Region: 'North', Practice: 'Practice A' },
  { Region: 'North', Practice: 'Practice B' }
]
🚨 DUPLICATE ACCOUNTS FOUND: ['Jindal', 'SKF', 'SBI Card', 'Subros']
```

**Solution:** Use composite keys (Account + Practice Head) instead of account name alone:

```javascript
// Create unique composite keys
const uniqueAccountKeys = new Set();
[...filteredData.fy24_25, ...filteredData.fy25_26].forEach(row => {
    uniqueAccountKeys.add(`${row.Project}|${row.Region}|${row['Practice Head']}`);
});

// Process each unique combination separately
uniqueAccountKeys.forEach(key => {
    const [accountName, region, practice] = key.split('|');
    
    // Filter for EXACT match
    const fy24Rows = filteredData.fy24_25.filter(row => 
        row.Project === accountName && 
        row.Region === region && 
        row['Practice Head'] === practice
    );
    
    const fy25Rows = filteredData.fy25_26.filter(row => 
        row.Project === accountName && 
        row.Region === region && 
        row['Practice Head'] === practice
    );
    
    // ... calculate compliance
    
    accountPerformance.push({
        account: `${accountName} (${practice})`,  // Show practice in display
        accountName,  // Keep original for grouping if needed
        region,
        practice,
        fy24Compliance,
        fy25Compliance,
        improvement
    });
});
```

---

### Outcome 3: Data Structure Issue
**Console Shows:**
```
Accounts with multiple regions: [
  ['Jindal', Set(2) {'North', 'South'}]  ← Same account in multiple regions!
]
```

**Solution:** Ensure region filter is applied correctly BEFORE creating unique account list:

```javascript
// Verify filteredData only contains North region
const nonNorthRows = filteredData.fy25_26.filter(row => row.Region !== 'North');
if (nonNorthRows.length > 0) {
    console.error('🚨 FILTER BUG: Non-North rows found:', nonNorthRows);
}
```

---

## Current Status

✅ **Debug Mode Deployed:** Dashboard running with comprehensive logging  
✅ **Pushed to GitHub:** Commit fe390cd  
⏳ **Awaiting Console Output:** Need to see what the logs reveal  
⏳ **Fix Implementation:** Pending diagnosis results  

---

## Next Steps

1. **Open dashboard and check console** following the steps above
2. **Share the console output** (screenshot or copy-paste text)
3. **I'll analyze the exact cause** and implement the appropriate fix
4. **Test the fix** to ensure accounts appear in only one list
5. **Document the root cause** for future reference

**Dashboard URL (Debug Mode):**  
👉 https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai

**Remember to:**
- Press F12 → Console tab
- Filter by "North"
- Go to "Executive View"
- Check for red error messages (🚨)
- Copy all console output
