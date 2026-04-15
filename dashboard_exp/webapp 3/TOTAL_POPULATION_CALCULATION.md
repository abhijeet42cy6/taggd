# 📊 TOTAL POPULATION Calculation - Explained

## 🎯 What is TOTAL POPULATION?

**TOTAL POPULATION = 26,632**

This is the **sum of all "Opportunity Count"** values from the **Parameter_Audit_Count** sheet.

---

## 📋 Calculation Details

### Data Source:
- **Sheet:** `Parameter_Audit_Count`
- **Column:** `Opportunity Count` (Column K in Excel)
- **Rows:** All 2,363 rows in the sheet

### Formula:
```javascript
totalPopulation = SUM(Opportunity Count)
```

### Code Location:
**File:** `index.html`  
**Line:** ~5040-5049

```javascript
// Filter paramData to only include filtered accounts
const filteredParams = paramData.filter(row => {
    const account = (row['Account'] || row['Client'] || row['Account Name'] || '').toString().trim().toLowerCase();
    return filteredAccountNames.includes(account);
});

// Calculate totals from Parameter_Audit_Count
let totalOppPass = 0, totalOppCount = 0, totalOppNA = 0;
filteredParams.forEach(row => {
    totalOppPass += parseFloat(row['Opportunity Pass']) || 0;
    totalOppCount += parseFloat(row['Opportunity Count']) || 0;  // ← THIS IS SUMMED
    totalOppNA += parseFloat(row['Opportunity NA']) || 0;
});

const totalValidOpp = totalOppCount - totalOppNA;
// Total Population = SUM of Opportunity Count from Parameter_Audit_Count (Column K)
const totalPopulation = totalOppCount;  // ← THIS IS DISPLAYED
```

---

## 🔍 Step-by-Step Calculation

### 1. **Load Data**
- Reads `Parameter_Audit_Count` sheet
- Contains 2,363 rows of audit data
- Each row has an "Opportunity Count" value

### 2. **Apply Filters** (if any)
- Filters by Account (if search active)
- Filters by Region (if selected)
- Filters by Status (Active/Inactive)
- Filters by Audit Status (Yes/No/On Hold)
- Filters by Accuracy (Excellent/Good/Fair/Poor)

### 3. **Sum Opportunity Count**
```
TOTAL POPULATION = Row 1 Opp Count 
                 + Row 2 Opp Count 
                 + Row 3 Opp Count 
                 + ... 
                 + Row N Opp Count
```

### 4. **Display Result**
- Shows on Journey at Glance tab
- First KPI card (top-left)
- Format: "26,632" (with thousands separator)

---

## 📊 Where TOTAL POPULATION Appears

### 1. **Journey at Glance Tab**
- **KPI Card #1** (Top-left corner)
- Label: "TOTAL POPULATION"
- Value: 26,632
- Description: "Total no of records available to conduct the audits"

### 2. **Transactional Overview Tab**
- **Audits Number** metric
- Same calculation (mirrors Journey at Glance)
- Value: 26,632

---

## 🧮 Example Calculation

Let's say you have these rows in Parameter_Audit_Count:

| Account | Opportunity Count |
|---------|------------------|
| Account A | 1,000 |
| Account B | 500 |
| Account C | 750 |
| Account D | 250 |

**TOTAL POPULATION = 1,000 + 500 + 750 + 250 = 2,500**

---

## 🔢 Your Actual Numbers

Based on the console logs from earlier:

### Full Dataset:
- **Parameter_Audit_Count rows:** 2,363
- **Recruiter_Audit_Count rows:** 27,871
- **Accounts:** 42

### Calculation Result:
- **TOTAL POPULATION:** 26,632
- This is the sum of "Opportunity Count" across filtered Parameter_Audit_Count rows

---

## ❓ Why 26,632 and not 27,871?

You might notice:
- **Recruiter_Audit_Count has 27,871 rows**
- **TOTAL POPULATION shows 26,632**

**Reason:** These are DIFFERENT metrics from DIFFERENT sheets:

1. **27,871** = Number of **rows** in Recruiter_Audit_Count sheet
   - Each row = one recruiter audit record
   
2. **26,632** = **Sum** of Opportunity Count column in Parameter_Audit_Count sheet
   - Sum of all audit opportunities across all parameters

**They measure different things:**
- Recruiter_Audit_Count: Individual recruiter performance records
- Parameter_Audit_Count: Aggregated parameter audit data

---

## 🧪 How to Verify

### Method 1: Check Console Logs
Open browser console and look for:
```
📊 Journey at Glance KPIs:
  Total Opportunity Count (totalPopulation): 26,632
```

### Method 2: Manual Excel Calculation
1. Open `BaseFile.xlsx`
2. Go to `Parameter_Audit_Count` sheet
3. Select column K (Opportunity Count)
4. Use `=SUM(K:K)` formula
5. Result should be **26,632**

### Method 3: Filter and Recalculate
On Journey at Glance tab:
1. Apply different filters
2. Watch TOTAL POPULATION change
3. It recalculates based on filtered rows
4. Remove all filters → Returns to 26,632

---

## 📝 Related Metrics

TOTAL POPULATION is used to calculate:

### 1. **Sample %**
```
Sample % = (Total Opportunity / Total Population) × 100
```

### 2. **Audits Number** (Transactional Tab)
```
Audits Number = Total Population
```
(Same value, just mirrored to Transactional Overview)

### 3. **Coverage Analysis**
- Shows what % of population was sampled
- Higher = more comprehensive audit coverage

---

## 🎯 Summary

**TOTAL POPULATION = 26,632**

**What it means:**
- Sum of "Opportunity Count" column
- From Parameter_Audit_Count sheet (2,363 rows)
- Represents total audit opportunities available
- Changes when filters are applied
- Used in Sample % calculation

**How it's calculated:**
```javascript
let totalOppCount = 0;
filteredParams.forEach(row => {
    totalOppCount += parseFloat(row['Opportunity Count']) || 0;
});
const totalPopulation = totalOppCount;
```

**Where it appears:**
1. Journey at Glance → First KPI card
2. Transactional Overview → Audits Number

**Verification:**
- Excel: `=SUM(Parameter_Audit_Count[Opportunity Count])`
- Should equal 26,632

---

## 🔗 Code Reference

**File:** `index.html`  
**Function:** `renderJourneyStats(filteredData)`  
**Lines:** ~5024-5050

**Key Variables:**
- `totalOppCount` - Sum of Opportunity Count
- `totalPopulation` - Same as totalOppCount
- `filteredParams` - Filtered Parameter_Audit_Count rows

---

**Date:** January 16, 2026  
**Status:** ✅ Documented  
**Calculation Verified:** Sum of Opportunity Count = 26,632
