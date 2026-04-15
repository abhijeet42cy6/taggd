# Data Inconsistency Analysis: Same Accounts in Improved & Declined Lists

**Date:** November 26, 2025  
**Issue:** Same accounts appearing in both "Most Improved" and "Most Declined" lists when filtering by North region  
**Status:** 🔍 Under Investigation - Debug Logging Added

---

## Problem Description

### Observed Issue:
When filtering by "North" region, the following accounts appear in **BOTH** lists:

**Most Improved Accounts (YoY):**
- Jindal: **+11%**
- SBI Card: **+9.8%**
- SKF: **+9.4%**
- Subros: **+/-21.7%** (ambiguous)

**Most Declined Accounts (YoY):**
- Subros: **-21.79%**
- SKF: **-9.4%**
- SBI Card: **-9.8%**
- Jindal: **-11.0%**

### Why This is Wrong:
An account **CANNOT** have both improved AND declined year-over-year. This indicates a data processing bug.

---

## Root Cause Hypotheses

### Hypothesis 1: Duplicate Account Entries (MOST LIKELY)
**Problem:** Accounts may have multiple rows in the filtered dataset (e.g., different Practice Heads, sub-regions, or data granularities).

**Current Logic:**
```javascript
const uniqueAccounts = new Set([
    ...filteredData.fy24_25.map(row => row.Project),
    ...filteredData.fy25_26.map(row => row.Project)
]);

uniqueAccounts.forEach(accountName => {
    const fy24Rows = filteredData.fy24_25.filter(row => row.Project === accountName);
    const fy25Rows = filteredData.fy25_26.filter(row => row.Project === accountName);
    // ... aggregate all rows for this account
});
```

**Issue:** If "Jindal" has 3 rows in the filtered data (e.g., different Practice Heads or sub-projects), this logic will:
1. Create ONE entry in `uniqueAccounts` 
2. Aggregate ALL 3 rows together
3. This could lead to incorrect calculations if data overlaps or conflicts

**Example Scenario:**
```
Filtered Data (North):
- Jindal (Practice A) - FY24: 85%, FY25: 95% → +10%
- Jindal (Practice B) - FY24: 90%, FY25: 80% → -10%

Aggregation might incorrectly compute both:
- Improved: +10%
- Declined: -10%
```

### Hypothesis 2: Data Aggregation Bug
**Problem:** The nested loops might be double-counting data:
```javascript
fy24months.forEach(month => {
    fy24Rows.forEach(row => {
        fy24Met += getMonthData(row, month, 'fy24_25', 'Met');
        fy24NotMet += getMonthData(row, month, 'fy24_25', 'Not_Met');
    });
});
```

If multiple rows exist for the same account, this will sum ALL rows' data, potentially inflating or distorting the compliance percentage.

### Hypothesis 3: Data Structure Issue
**Problem:** The Excel/CSV source data might have:
- Duplicate account names with slight variations (e.g., "Jindal" vs "Jindal Corp")
- Same account under multiple regions (not properly filtered)
- Multiple practice heads for the same account

---

## Debug Logging Added

I've added comprehensive console logging to diagnose the issue:

### 1. Filtered Data Inspection:
```javascript
console.log('=== FILTERED DATA DEBUG ===');
console.log('FY24-25 rows:', filteredData.fy24_25.length);
console.log('FY25-26 rows:', filteredData.fy25_26.length);

const accountRegionMap = {};
filteredData.fy25_26.forEach(row => {
    if (!accountRegionMap[row.Project]) {
        accountRegionMap[row.Project] = new Set();
    }
    accountRegionMap[row.Project].add(row.Region);
});
console.log('Accounts with multiple regions:', 
    Object.entries(accountRegionMap).filter(([k,v]) => v.size > 1));
```

**Purpose:** Identify if accounts span multiple regions or have duplicate entries.

### 2. Account Performance Data:
```javascript
console.log('=== ACCOUNT PERFORMANCE DEBUG ===');
console.log('Total accounts:', accountPerformance.length);
console.log('Account Performance Data:', accountPerformance);
console.log('Top 5 Improved:', top5Improved);
console.log('Top 5 Declined:', top5Declined);
```

**Purpose:** See the exact calculations and identify duplicate or conflicting entries.

---

## How to Diagnose

### Step 1: Open Dashboard with Debug Mode
1. Open the dashboard: https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai
2. Open browser console (F12 → Console tab)
3. Select "North" region filter
4. Navigate to "Executive View"

### Step 2: Examine Console Output
Look for:
- **Accounts with multiple regions:** Should be empty when filtering by North
- **FY24-25/FY25-26 row counts:** Check if there are unexpected duplicate rows
- **Account Performance Data:** Check if any account has multiple entries
- **Top 5 lists:** Verify the improvement values

### Step 3: Identify the Pattern
- If accounts have multiple region entries → Filter is not working correctly
- If account performance has duplicates → Aggregation logic is flawed
- If improvement values differ for same account → Calculation bug

---

## Proposed Solutions

### Solution 1: Use Composite Keys (RECOMMENDED)
Instead of using account name alone, use a composite key (Account + Region + Practice Head):

```javascript
const uniqueAccountKeys = new Set();
[...filteredData.fy24_25, ...filteredData.fy25_26].forEach(row => {
    uniqueAccountKeys.add(`${row.Project}|${row.Region}|${row['Practice Head']}`);
});

const accountPerformance = [];
uniqueAccountKeys.forEach(key => {
    const [accountName, region, practice] = key.split('|');
    
    // Filter rows matching this EXACT combination
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
    
    // ... rest of calculation
});
```

**Pros:**
- Ensures each unique account-region-practice combination is processed separately
- Prevents aggregation of unrelated data
- Maintains data granularity

**Cons:**
- May create too many entries if accounts span multiple practices
- Might need additional grouping logic

### Solution 2: Deduplicate Before Processing
Add logic to identify and merge duplicate rows:

```javascript
// Group by account name and merge rows
const consolidatedData = {};
filteredData.fy25_26.forEach(row => {
    if (!consolidatedData[row.Project]) {
        consolidatedData[row.Project] = {
            Project: row.Project,
            Region: row.Region,
            'Practice Head': row['Practice Head'],
            // ... copy month data
        };
    } else {
        // Merge month data by summing Met/Not Met values
        // ... merging logic
    }
});
```

### Solution 3: Add Validation Checks
Before adding to `accountPerformance`, check for duplicates:

```javascript
// Check if account already exists
const existingIndex = accountPerformance.findIndex(a => a.account === accountName);
if (existingIndex >= 0) {
    console.warn(`Duplicate account found: ${accountName}`, {
        existing: accountPerformance[existingIndex],
        new: { fy24Compliance, fy25Compliance, improvement }
    });
    // Skip or merge based on business logic
    return;
}

accountPerformance.push({...});
```

---

## Next Steps

1. **Review Console Logs:** Check the debug output to identify the exact cause
2. **Verify Source Data:** Ensure Excel/CSV doesn't have duplicate account entries
3. **Implement Fix:** Based on diagnosis, apply appropriate solution
4. **Add Unit Tests:** Create test cases to prevent regression

---

## Current Status

- ✅ Debug logging added
- ✅ Dashboard restarted with debug mode
- 🔍 Awaiting console log analysis
- ⏳ Fix implementation pending diagnosis

**Dashboard URL (Debug Mode):** https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai

**Instructions:**
1. Open dashboard
2. Open browser console (F12)
3. Filter by "North" region
4. Go to "Executive View"
5. Share console output for diagnosis
