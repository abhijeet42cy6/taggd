# RCA & CAPA Tab - Quick Testing Guide

## 🎯 What Was Fixed

**Issue**: "I can't see any numbers in the RCA/CAPA Tab"

**Solution**: Fixed Excel column detection by creating helper functions that handle multiple naming conventions (column letters, __EMPTY_X, array indices, display names)

---

## 🚀 Quick Test Steps

### 1️⃣ Upload Excel File
```
✅ Click "Upload Excel" button
✅ Select your Business Excellence data file
✅ Wait for "Upload successful" message
```

### 2️⃣ Navigate to RCA & CAPA Tab
```
✅ Click "RCA & CAPA" tab in main navigation
✅ Page should load immediately
```

### 3️⃣ Verify Numbers Appear

#### **KPI Cards** (Top Section)
You should see 3 cards with numbers:

**Card 1: Error Type**
- Total count (e.g., "45")
- Breakdown of top 5 error types with percentages
- Example: "Data Entry Error: 12 (26.7%)"

**Card 2: Impact**
- Counts for each impact level
- Color-coded: High (red), Medium (yellow), Low (green)
- Example: "High: 15 | Medium: 20 | Low: 10"

**Card 3: Status**
- Status distribution with colored dots
- Example: "Open: 25 | Closed: 20"

#### **Monthly Chart** (Middle Section)
- Line chart showing RCA counts by month
- X-axis: Months (Jan, Feb, Mar, etc.)
- Y-axis: Count numbers (0, 5, 10, etc.)
- Hover over points to see exact values

#### **Filters** (Left Sidebar)
All 4 filters should show numbers in badges:

```
✅ Practice Head (Column E)
   • Practice A (15)
   • Practice B (12)
   • Practice C (8)

✅ Financial Year (Column H)
   • FY 2024 (25)
   • FY 2025 (20)

✅ Region (Column J)
   • North (18)
   • South (15)
   • East (12)

✅ Status (Column I)
   • Open (25)
   • Closed (20)
```

#### **List Display** (Right Section)
- Should show "X Items Found"
- Accounts grouped with item counts
- Example: "Account ABC (5 Items)"
- Click account to expand and see RCA items
- Each item shows:
  - First 5 words of Problem Statement
  - Region badge
  - Status badge (colored border)
  - Error Type badge
  - Impact badge

#### **Details Panel** (Far Right)
Click any RCA item to see:
- Account name
- Region (from Column J)
- Financial Year (from Column H)
- Status (from Column I)
- **Full Problem Statement** (no truncation)
- Error Type (from Column C)
- Impact (from Column D)
- Practice Head (from Column E)
- Root Cause Analysis
- Corrective Action
- Owner
- Due Date

---

## 🧪 Interactive Testing

### Test 1: Filter Functionality
```
1. Click "Practice A" in Practice Head filter
2. Numbers should update in all KPI cards
3. Chart should update to show only Practice A data
4. List should show only Practice A items
5. Click "Clear All" → Everything resets
```

### Test 2: Multi-Select Filters (OR Logic)
```
1. Click "Practice A" AND "Practice B"
2. Should show items from EITHER practice
3. Total count = Practice A + Practice B
```

### Test 3: Cross-Filter (AND Logic)
```
1. Select "Practice A" in Practice Head
2. Select "Open" in Status
3. Should show ONLY items that are BOTH Practice A AND Open
4. Total count should be smaller than either filter alone
```

### Test 4: Universal Search
```
1. Type in search box at top (e.g., "error")
2. Filters across ALL fields (account, problem statement, error type, etc.)
3. KPI cards update
4. Chart updates
5. List updates
6. Clear search → Everything resets
```

### Test 5: Details Display
```
1. Click any RCA item in the list
2. Details panel appears on right
3. Verify all fields show correct data:
   - Region matches Column J
   - Financial Year matches Column H
   - Practice Head matches Column E
   - Status matches Column I
   - Full Problem Statement visible (no "...")
```

---

## 🐛 Troubleshooting

### ❌ No Numbers Showing

**Check 1: Excel Format**
- Open your Excel file
- Verify these columns exist:
  - Column C: Error Type
  - Column D: Impact
  - Column E: Practice Head
  - Column H: Financial Year
  - Column I: Status
  - Column J: Region

**Check 2: Data Quality**
- Columns should have values (not all empty)
- At least a few rows of data

**Check 3: Browser Console**
1. Press F12 (Windows) or Cmd+Option+I (Mac)
2. Click "Console" tab
3. Look for error messages (red text)
4. Take screenshot and share if errors exist

**Check 4: Data Inspection**
Paste this in browser console:
```javascript
console.log('RCA Data:', window.allRcaCapa?.length, 'items');
console.log('Sample:', window.allRcaCapa?.[0]);
```

### ❌ Filters Show "No Options"

**Likely Cause**: Excel column names don't match expected values

**Solution**: 
1. Check console for warnings
2. Open `index.html` and search for helper functions
3. Helper functions try multiple column name variations
4. If your Excel uses different names, add them to `possibleKeys` array

### ❌ Wrong Numbers in Cards

**Likely Cause**: Multiple sheets in Excel, wrong sheet selected

**Solution**:
1. Excel upload reads first sheet by default
2. Ensure RCA & CAPA data is in first sheet
3. Or modify code to specify sheet name

---

## 📊 Expected Behavior

### Visual Indicators

**KPI Cards**:
- 🟦 Error Type Card (Blue header)
- 🟩 Impact Card (Green header)
- 🟪 Status Card (Purple header)

**Chart**:
- 📈 Red line chart
- Grid background
- Interactive hover tooltips

**Filters**:
- 🔵 Blue badges with counts
- Multi-select capability
- Clear All button at bottom

**List Items**:
- 🏢 Account headers (red gradient)
- Collapsible sections
- Colored status borders:
  - 🔴 Red: Open/In Progress
  - 🟡 Amber: Closed/Complete

**Details Panel**:
- 🎯 Gradient header with account name
- 📋 Structured sections with icons
- 🎨 Color-coded status and impact

---

## ✅ Success Criteria

All these should be TRUE:

- [ ] KPI cards show numbers > 0
- [ ] All 4 filters show options with counts
- [ ] Monthly chart displays with data points
- [ ] List shows items grouped by account
- [ ] Clicking item shows complete details
- [ ] Filters reduce counts correctly
- [ ] Search filters across all data
- [ ] Clear All resets everything
- [ ] No errors in console
- [ ] Problem Statement shows first 5 words in list
- [ ] Problem Statement shows full text in details
- [ ] Region, Practice Head, Financial Year all display correctly

---

## 🎓 User Workflow

**Typical Usage Pattern**:

```
1. Upload Excel → "45 Items Found"
2. Check KPI Cards → See error type distribution
3. Apply Filters → "Practice A" + "Open Status" → "12 Items Found"
4. Review Chart → See monthly trend for filtered data
5. Browse List → Click account to expand
6. View Details → Click item to see full information
7. Take Action → Based on RCA/CAPA details
8. Clear Filters → Start new analysis
```

---

## 📞 Support

If issues persist after testing:

1. **Screenshot**: Capture the entire screen showing the issue
2. **Console Log**: Include any error messages from browser console
3. **Excel Sample**: Share a sample row from your Excel (anonymized)
4. **Description**: Describe what you expected vs what you see

---

## 🎉 Success!

If you see numbers in:
- ✅ KPI cards
- ✅ Filter badges
- ✅ Chart data points
- ✅ List counts
- ✅ Details panel

**Congratulations! The RCA & CAPA tab is working correctly!** 🚀

---

**Last Updated**: 2025-12-25  
**Version**: 1.0  
**Status**: Ready for Testing
