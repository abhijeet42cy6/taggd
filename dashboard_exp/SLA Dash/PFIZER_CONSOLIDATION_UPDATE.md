# Pfizer Data Consolidation Update

## Update Summary
**Date**: December 6, 2025  
**Change**: Consolidated multiple Pfizer project entries into a single "Pfizer" entry

## Previous Data Structure
Previously, Pfizer was split into multiple entries:
- Pfizer FLM/RBM
- Pfizer FS
- (possibly other variations)

This caused issues in:
- Account/Project-wise analysis showing duplicate Pfizer entries
- Inconsistent reporting across different views
- Confusion in aggregated metrics

## New Data Structure
**✅ All Pfizer projects consolidated into:**
- **Project Name**: Pfizer
- **Region**: West 1
- **Practice Head**: Usha
- **Regional Head**: (as per original data)

## Data Verification

### FY 24-25 Summary
- **Total Projects**: 49
- **Pfizer Entries**: 1 (consolidated)
- **Location**: West 1, Practice Head: Usha

### FY 25-26 Summary
- **Total Projects**: 47
- **Pfizer Entries**: 1 (consolidated)
- **Location**: West 1, Practice Head: Usha

### FY 24-25 Not Reported
- **Total Projects**: 49
- **Pfizer Entries**: 1 (consolidated)

### FY 25-26 Not Reported
- **Total Projects**: 47
- **Pfizer Entries**: 1 (consolidated)

## Impact on Dashboard Views

### ✅ Account/Project-wise Analysis
- **Before**: Multiple Pfizer rows (FLM/RBM, FS, etc.)
- **After**: Single "Pfizer" row with aggregated metrics

### ✅ Regional Analysis (West 1)
- Pfizer metrics now consolidated under West 1

### ✅ Practice Head Analysis (Usha)
- All Pfizer metrics consolidated under Usha

### ✅ Not Reported Analysis
- Single Pfizer entry in trend analysis
- Cleaner year-over-year comparison

## Testing Checklist

### Data Integrity
- [x] FY 24-25 has single Pfizer entry
- [x] FY 25-26 has single Pfizer entry
- [x] Not Reported data consolidated
- [x] Region correctly set to West 1
- [x] Practice Head correctly set to Usha

### Dashboard Views to Verify
- [ ] Overview - Check if Pfizer appears once in drill-downs
- [ ] Account Analysis - Verify single Pfizer row
- [ ] Regional Analysis (West 1) - Check Pfizer metrics
- [ ] Practice Head Analysis (Usha) - Check Pfizer metrics
- [ ] Not Reported Analysis - Verify single Pfizer entry in tables and charts

### Filters to Test
- [ ] Filter by "Pfizer" project
- [ ] Filter by "West 1" region
- [ ] Filter by "Usha" practice head
- [ ] Verify metrics are correctly aggregated

## Verification Steps

1. **Open Dashboard**: https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai

2. **Clear Browser Cache** (Important):
   - Press `Ctrl+Shift+Delete`
   - Clear "Cached images and files"
   - Reload page

3. **Upload Data** (if not auto-loaded):
   - The dashboard will automatically load `sample_data.json`
   - Or manually upload `SLA_Monthly_Status_Summary_FINAL.xlsx`

4. **Navigate to "Analysis" → "Account Analysis"**:
   - Look for "Pfizer" in the table
   - Should see only ONE "Pfizer" row
   - Region should show "West 1"
   - Practice Head should show "Usha"

5. **Navigate to "Data Quality" → "Not Reporting Analysis"**:
   - Check "Account/Project-wise Analysis" table
   - Should see only ONE "Pfizer" entry
   - Verify metrics are aggregated correctly

6. **Test Filters**:
   - Filter by Project: Select "Pfizer"
   - Filter by Region: Select "West 1"
   - Filter by Practice: Select "Usha"
   - All three filters should show the same Pfizer data

## Expected Behavior Changes

### Before Consolidation
```
Account/Project-wise Analysis:
┌──────────────────┬──────────┬──────────┬─────────┬────────┐
│ Project          │ FY 24-25 │ FY 25-26 │ Change  │ Trend  │
├──────────────────┼──────────┼──────────┼─────────┼────────┤
│ Pfizer FLM/RBM   │ 15       │ 51       │ +36     │ 🟡     │
│ Pfizer FS        │ 10       │ 45       │ +35     │ 🟡     │
└──────────────────┴──────────┴──────────┴─────────┴────────┘
```

### After Consolidation
```
Account/Project-wise Analysis:
┌──────────┬──────────┬──────────┬─────────┬────────────┐
│ Project  │ FY 24-25 │ FY 25-26 │ Change  │ Trend      │
├──────────┼──────────┼──────────┼─────────┼────────────┤
│ Pfizer   │ 25       │ 96       │ +71     │ 🔴 Worsening│
└──────────┴──────────┴──────────┴─────────┴────────────┘
```

## Files Updated

1. **sample_data.json** (114KB)
   - Consolidated Pfizer entries across all sheets
   - Updated: December 6, 2025

2. **SLA_Monthly_Status_Summary_FINAL.xlsx** (26KB)
   - Source Excel file with consolidated Pfizer data
   - All sheets updated with single Pfizer entry

## Rollback Instructions

If you need to revert to the old data:

```bash
cd /home/user/webapp
cp sample_data.json.backup sample_data.json
pm2 restart taggd-dashboard
```

## GitHub Commit

- **Commit Hash**: `ee91e53`
- **Message**: "Update data: Consolidate Pfizer entries into single 'Pfizer' project (West 1, Usha)"
- **Repository**: https://github.com/Rishab25276/SLA-DASHBOARD

## Notes

- The consolidation aggregates all Pfizer-related metrics into a single entry
- This provides a clearer view of overall Pfizer account performance
- All historical data is preserved in the backup file
- Charts and filters will automatically reflect the consolidated data

---

**Status**: ✅ UPDATED  
**Last Updated**: December 6, 2025  
**Verified**: Data consolidation complete, dashboard restarted  
**Live URL**: https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai
