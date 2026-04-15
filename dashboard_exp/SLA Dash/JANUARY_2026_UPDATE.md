# Dashboard Update: January 2026 Data + Organizational Changes

## Version 5.0.0 - Released Feb 28, 2026

### ✅ What's New

#### 1. January 2026 Data Added
- **New columns**: `Jan_Met`, `Jan_Not_Met` in FY 25-26 Summary
- **Sample data**: 
  - Ambuja Cement: Jan_Met=7, Jan_Not_Met=1
  - Atomberg: Jan_Met=20, Jan_Not_Met=21
- **All views updated**: Overview, Monthly Performance, Drill-down, Not Reported

#### 2. December 2025 Data (Retained)
- **Columns**: `Dec_Met`, `Dec_Not_Met`
- **Sample data**:
  - Ambuja Cement: Dec_Met=3, Dec_Not_Met=5
  - Atomberg: Dec_Met=19, Dec_Not_Met=22

#### 3. Organizational Changes
**North Region Updates:**
- **Practice Head**: Archana Trikha (changed from previous assignment)
- **Regional Head**: Anjli Zutshi (changed from previous assignment)
- **Affected Projects** (9 total):
  1. Jindal
  2. Maruti Suzuki
  3. Pernod Ricard
  4. SBI Card
  5. SKF
  6. SKF Auto
  7. SKF Industrial
  8. Sterling tools
  9. Subros

#### 4. Forecasting Updates
- **Historical data now includes**: Apr-Jan 2026 (10 months)
- **Forecast shows**: Feb-Apr 2026 (next 3 months)
- **Chart labels updated**:
  - Orange line: "Historical Performance (Apr-Jan 2026)"
  - Blue dashed line: "Forecasted Performance (Feb-Apr 2026)"
- **Forecast text**: "next 3 months (Feb-Apr 2026)"

### 📊 Data File
- **Filename**: `SLA_Data_20260128.xlsx` (date-stamped for cache bypass)
- **Location**: `/home/user/webapp/SLA_Data_20260128.xlsx`
- **Size**: 501 KB
- **Sheets**:
  - FY 24-25 Summary (47 rows)
  - FY 25-26 Summary (48 rows, **now includes Jan columns**)
  - FY 25-26 Metrics Details (506 performance measures)
  - FY24-25 Not Reported (49 rows)
  - FY25-26 Not Reported (48 rows)

### 🔍 Verification Steps

1. **Open the dashboard**:
   - Sandbox: https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
   - Press F12 to open console

2. **Check console logs** (should show):
   ```
   ✅ January columns found in FY 25-26: [Jan_Met, Jan_Not_Met]
   📊 Sample Jan_Met values: [7, 0, 0, 0, 20]
   📊 Sample Jan_Not_Met values: [1, 0, 0, 0, 21]
   ✅ December columns found in FY 25-26: [Dec_Met, Dec_Not_Met]
   📊 Sample Dec_Met values: [3, 0, 0, 0, 19]
   📊 Sample Dec_Not_Met values: [5, 0, 0, 0, 22]
   ```

3. **Visual checks**:
   - **Overview**: Should show 10 bars (Apr-Jan)
   - **Monthly Performance**: January should be available in month dropdown
   - **Forecasting**: 
     - Orange line ends at Jan 2026
     - Blue line shows Feb-Apr 2026
     - Table shows Feb, Mar, Apr (not Jan, Feb, Mar)
   - **Not Reported**: Archana Trikha should appear once (not duplicated)
   - **Filters**: Practice Head dropdown should include "Archana Trikha"

4. **Drill-down test**:
   - Select any North region project (e.g., "Jindal")
   - Verify Practice Head shows "Archana Trikha"
   - Verify Regional Head shows "Anjli Zutshi"
   - January column should be present in metrics table

### 🚀 Deployment Status

#### Sandbox (Development)
- ✅ **Status**: LIVE
- **URL**: https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai
- **Version**: 5.0.0
- **Service**: Running on PM2 (process: taggd-dashboard)

#### GitHub Pages (Production)
- ⏳ **Status**: PENDING (waiting for user approval)
- **URL**: https://businessexcellence.github.io/SLA-DASHBOARD/
- **Note**: Changes NOT yet pushed to GitHub
- **Action required**: User must review and approve before GitHub deployment

### 📝 Next Steps

1. **User review**: Test the sandbox dashboard thoroughly
2. **Approval**: Confirm all data is correct
3. **GitHub push**: After approval, push to GitHub with commit:
   ```bash
   git add .
   git commit -m "v5.0.0: January 2026 data + Archana Trikha North organizational changes"
   git push origin main
   ```
4. **Production verification**: Wait 2-3 minutes, then hard-refresh GitHub Pages

### 🐛 Bug Fixes Included

1. **Forecast duplication**: December no longer appears twice in forecast chart
2. **Forecast table months**: Now shows Feb-Mar-Apr (not Dec-Jan-Feb or Jan-Feb-Mar)
3. **Duplicate names**: "Naved" no longer duplicated in Not Reported analysis (trim whitespace fix)
4. **Cache issues**: New filename SLA_Data_20260128.xlsx bypasses browser cache

### 📌 Important Notes

- **Browser cache**: Users may need to hard-refresh (Ctrl+Shift+R or Cmd+Shift+R) to see changes
- **Monthly updates**: For Feb 2026 data, create `SLA_Data_20260228.xlsx` and update one line in code
- **Forecast logic**: Automatically uses last available month as baseline, extends 3 months forward

---

**Dashboard Version**: 5.0.0 - JANUARY 2026 DATA + Organizational Changes (Archana Trikha North)
**Update Date**: February 28, 2026
**Status**: Ready for User Review ✅
