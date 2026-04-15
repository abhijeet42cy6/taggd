# 🔍 CSAT TOP BOX - DEBUGGING GUIDE

## Issue
Customer Satisfaction tab shows Top Box cards but **no values are displayed** - all three cards show "No data available".

## Root Cause Analysis
The issue is likely one of these:

1. **❌ Excel file not loaded** - BaseFile.xlsx hasn't been uploaded to the sandbox
2. **❌ CSAT sheet missing** - The workbook doesn't contain a sheet named "CSAT"
3. **❌ Wrong column names** - Column G might not be named "Values"
4. **❌ Wrong parameter names** - Parameters don't contain "Top 2 Box", "Top 3 Box", or "Top 4 Box"

## 🔍 Required Data Structure

Your **CSAT sheet** in BaseFile.xlsx must have these columns:

| Column | Name | Example Data | Description |
|--------|------|--------------|-------------|
| B | Financial Year | 2022, 2023, 2024 | The year for the data |
| C | Parameter | Top 2 Box Overall, Top 3 Box Overall, Top 4 Box Overall | Must contain keywords: "top", "2"/"3"/"4", and "box" |
| G | Values | 75, 82.5, 90 | Percentage values (numbers) |

### Example CSAT Data:

```
Financial Year | Parameter              | Values
--------------|-----------------------|--------
2022          | Top 2 Box Overall     | 75.0
2023          | Top 2 Box Overall     | 80.5
2024          | Top 2 Box Overall     | 85.0
2022          | Top 3 Box Overall     | 82.0
2023          | Top 3 Box Overall     | 86.5
2024          | Top 3 Box Overall     | 90.0
2022          | Top 4 Box Overall     | 88.0
2023          | Top 4 Box Overall     | 91.0
2024          | Top 4 Box Overall     | 93.5
```

## 🛠️ How to Debug

### Step 1: Check if Data is Loaded

1. Open the dashboard: https://3000-iiqzlm50w1twpgggr1553-82b888ba.sandbox.novita.ai
2. Login with password: `Excellence@2026`
3. Open **Browser Console** (Press F12, then click "Console" tab)
4. Navigate to **Customer Satisfaction** tab

### Step 2: Look for Debug Messages

In the console, you should see:

```
📊 ========== TOP BOX DEBUGGING ==========
📊 CSAT data loaded: X rows
📊 Dashboard data keys: [...]
📊 Sample CSAT row (first row): {...}
📊 CSAT column names: [...]
📊 Values column content (first 5 rows): [...]
📊 All unique parameters in CSAT data: [...]
📊 Looking for parameters containing: "Top 2", "Top 3", "Top 4", "Box"
📊 Rows with "top" and "2": X
📊 ========================================
```

### Step 3: Check for Common Issues

**Issue 1: "CSAT data loaded: 0 rows"**
- ❌ **Problem**: Excel file not loaded or CSAT sheet is empty
- ✅ **Solution**: Upload BaseFile.xlsx that contains a CSAT sheet with data

**Issue 2: "Column names doesn't include 'Values'"**
- ❌ **Problem**: Column G is not named "Values"
- ✅ **Solution**: Rename column G to exactly "Values" (capital V)

**Issue 3: "Rows with 'top' and '2': 0"**
- ❌ **Problem**: No parameters contain "Top 2 Box"
- ✅ **Solution**: Add rows with Parameter like "Top 2 Box Overall" or "Top 2 Box Score"

**Issue 4: "Values column content: [undefined, undefined, ...]"**
- ❌ **Problem**: Values column is empty or has wrong name
- ✅ **Solution**: Ensure column G is named "Values" and contains numbers

## 📋 What the Console Should Show (WORKING Example)

```
📊 ========== TOP BOX DEBUGGING ==========
📊 CSAT data loaded: 150 rows
📊 Sample CSAT row (first row): {
  "Financial Year": "2022",
  "Parameter": "Top 2 Box Overall",
  "Sub Parameter 1": "Overall",
  "Values": "75.5"
}
📊 CSAT column names: ["Financial Year", "Parameter", "Sub Parameter 1", "Values", ...]
📊 Values column content (first 5 rows): [75.5, 80.2, 85.0, 82.0, 86.5]
📊 All unique parameters in CSAT data: ["Top 2 Box Overall", "Top 3 Box Overall", "Top 4 Box Overall", ...]
📊 Looking for parameters containing: "Top 2", "Top 3", "Top 4", "Box"
📊 Rows with "top" and "2": 3
📊 Sample Top 2 parameter: {Financial Year: "2022", Parameter: "Top 2 Box Overall", Values: "75.5"}
📊 Financial Years found: ["2022", "2023", "2024"]
📊 Found Top 2 Box for 2022: 75.5% (Parameter: "Top 2 Box Overall")
📊 Found Top 2 Box for 2023: 80.5% (Parameter: "Top 2 Box Overall")
📊 Found Top 2 Box for 2024: 85.0% (Parameter: "Top 2 Box Overall")
📊 Found Top 3 Box for 2022: 82.0% (Parameter: "Top 3 Box Overall")
...
📊 ========================================
```

## 🎯 Next Steps

### If No CSAT Data is Loaded:

1. **Check if BaseFile.xlsx is in the same directory**:
   - The app tries to auto-load `/home/user/webapp/BaseFile.xlsx`
   - OR manually upload via the "Upload Excel Data" button

2. **Check sheet name**:
   - Must be named exactly "CSAT" (all caps)
   - Alternative: "csat" (all lowercase) - app will find it

3. **Check column names**:
   - Column B: "Financial Year"
   - Column C: "Parameter"
   - Column G: "Values"

### If CSAT Data is Loaded but No Values Show:

1. **Check parameter names** - must contain ALL three keywords:
   - "top" (case insensitive)
   - "2" or "3" or "4" (the number)
   - "box" (case insensitive)

2. **Valid examples**:
   - ✅ "Top 2 Box Overall"
   - ✅ "Top2Box"
   - ✅ "TOP 3 BOX SCORE"
   - ✅ "top 4 box"

3. **Invalid examples**:
   - ❌ "Top Box" (missing number)
   - ❌ "Top 2" (missing "box")
   - ❌ "2 Box" (missing "top")

## 📊 Test URL & Credentials

- **URL**: https://3000-iiqzlm50w1twpgggr1553-82b888ba.sandbox.novita.ai
- **Password**: Excellence@2026

## 🚀 Status

- ✅ Enhanced debugging added
- ✅ Console logging comprehensive
- ✅ Server restarted
- ⏳ **Awaiting your console logs to diagnose exact issue**

## 📝 What to Share

Please open the Console and share:

1. The entire "TOP BOX DEBUGGING" section output
2. A screenshot of the console errors
3. Confirm if you have a CSAT sheet in your BaseFile.xlsx
4. Share a few sample rows from your CSAT sheet (Financial Year, Parameter, Values columns)

This will help me identify the exact issue and fix it!
