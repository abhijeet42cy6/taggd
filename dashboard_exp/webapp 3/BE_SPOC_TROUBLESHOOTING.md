# BE SPOC Data Visibility Troubleshooting

## ⚠️ IMPORTANT: If BE SPOC Sections Are Blank

The BE SPOC sections (BE SPOC - AUDIT and BE SPOC - SLAs/KPIs) render **dynamically from uploaded Excel data**.

### Step-by-Step Fix:

1. **Upload Excel File:**
   ```
   - Click the orange "Upload Excel" button at the top
   - Select "Base File.xlsx"
   - Wait for "File uploaded successfully" message
   ```

2. **Navigate to Account Summary:**
   ```
   - Click "Account Summary" in the left sidebar
   - The tab must be ACTIVE for sections to render
   ```

3. **Check Browser Console (F12):**
   ```javascript
   // These logs should appear:
   "✅ Data available: 41 rows"
   "📊 BE SPOC Audit data: {Sahil: 15, NA: 8, ...}"
   "✅ BE SPOC Audit rendered: 7 items"
   "📊 BE SPOC SLA data: {Sahil: 26, ...}"
   "✅ BE SPOC SLA rendered: 5 items"
   ```

### Expected Data (from Base File.xlsx):

**BE SPOC - AUDIT:**
- Sahil: 15
- NA: 8
- Himanshu Srivastava: 6
- Debashreeta: 5
- Mehvish: 4
- Rishab: 2
- Kamal: 1

**BE SPOC - SLAs/KPIs:**
- Sahil: 26
- Debashreeta: 5
- Rishab: 4
- Himanshu Srivastava: 3
- Sahil/Rishab: 3

### If Still Blank:

**Option 1: Force Re-render (Console F12)**
```javascript
renderBESPOC();
```

**Option 2: Check Data Loaded**
```javascript
console.log('Data:', dashboardData?.accountSummary?.length);
// Should show: "Data: 41"
```

**Option 3: Check DOM Elements**
```javascript
console.log('Audit container:', document.getElementById('beSPOCAudit'));
console.log('SLA container:', document.getElementById('beSPOCSLA'));
// Should show: HTMLDivElement objects
```

**Option 4: Hard Refresh**
```
- Press Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Re-upload Base File.xlsx
- Navigate to Account Summary again
```

## 🔍 Root Cause Analysis

The sections appear blank when:
1. ❌ No Excel file uploaded → No data in `localStorage`
2. ❌ Wrong tab active → `renderBESPOC()` not called
3. ❌ Chart.js failed to load → JavaScript error blocks execution
4. ❌ Wrong Excel structure → Missing "BE SPOC - Audit" or "BE SPOC - SLAs/KPIs" columns

## ✅ Confirmation Tests

After uploading Base File.xlsx and navigating to Account Summary:

**Test 1: Visual Check**
- BE SPOC - AUDIT section should show 7 names with counts
- BE SPOC - SLAs/KPIs section should show 5 names with counts
- Scrollbar should be visible if content overflows

**Test 2: Console Check**
```javascript
// Run in console:
const audit = document.getElementById('beSPOCAudit').innerHTML;
const sla = document.getElementById('beSPOCSLA').innerHTML;
console.log('Audit HTML length:', audit.length);
console.log('SLA HTML length:', sla.length);
// Should show: Large numbers (>500 characters each)
```

**Test 3: Click Test**
- Try clicking on a SPOC name
- Nothing should happen (not clickable, for display only)

## 📊 Data Flow

```
Excel Upload → localStorage → dashboardData → renderBESPOC() → DOM Update
     ↓              ↓              ↓               ↓              ↓
  Base File  JSON stored   Object with   Processes   Updates HTML
   .xlsx     in browser   accountSummary  columns    in containers
```

## 💡 Pro Tip

If you see "No data available" or "No SPOC data":
- This is the **expected behavior** before uploading Excel
- **It is NOT a bug** - the system is working correctly
- Simply upload Base File.xlsx to populate the sections

---

**Last Updated:** December 24, 2025
**Status:** Documented all known scenarios
