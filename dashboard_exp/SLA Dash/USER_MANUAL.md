# TAGGD SLA Dashboard - User Manual

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Dashboard URL:** https://rishab25276.github.io/SLA-DASHBOARD/TAGGD_Dashboard_ENHANCED.html

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Features](#dashboard-features)
3. [Filters & Navigation](#filters--navigation)
4. [Understanding the Data](#understanding-the-data)
5. [Views & Analytics](#views--analytics)
6. [Export Options](#export-options)
7. [Frequently Asked Questions](#frequently-asked-questions)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Welcome Popup

When you first open the dashboard, you'll see a welcome popup featuring:
- **Personalized Greeting:** "Hi Tagger, welcome to the SLA Dashboard!"
- **Current Date:** Displayed dynamically (e.g., "Monday, 24 November 2025")
- **Inspirational Quote:** A random data/analytics quote that changes on each visit
- **Go to Dashboard Button:** Click to enter the dashboard

The welcome popup is designed to inspire and set the context for data-driven decision making.

### Loading Your Data

The dashboard comes with **sample data pre-loaded** so you can explore features immediately. To load your own data:

1. Click the **"Upload Data"** button in the sidebar (📂 icon)
2. Select your Excel file containing SLA data
3. Wait for the "Data loaded successfully" confirmation message
4. The dashboard will automatically refresh with your data

**Supported Format:** Excel files (.xlsx) with the required sheet structure

---

## Dashboard Features

### 🎯 Key Capabilities

- **Multi-Year Comparison:** Compare FY 24-25 with FY 25-26 performance
- **Executive View:** Top/worst performers, most improved/declined accounts
- **Regional Analysis:** Performance breakdown by region and regional head
- **Practice Head Analysis:** Track performance by practice head
- **Project-Level Details:** Drill down to individual project insights
- **Not Reported Tracking:** Analyze SLAs not reported each month
- **Industry Benchmarking:** Compare against industry standards
- **Advanced Filters:** Hierarchical filtering with cascading options
- **Export Functions:** PDF, Excel, and PowerPoint export

### 🎨 Theme Options

- **Light Theme:** Professional white background (default)
- **Dark Theme:** Easy on the eyes for extended viewing
- Toggle using the theme switcher in the header

### 🔊 Audio Mode

Enable voice descriptions for each section:
- Click the audio toggle in the header
- Dashboard will speak section descriptions as you navigate
- Useful for presentations or accessibility

---

## Filters & Navigation

### Hierarchical Filter System

The dashboard uses **cascading filters** that work hierarchically:

```
Regional Head → Region → Practice Head → Account/Project
```

#### How Cascading Works:

1. **Regional Head Filter (New!):**
   - Select a regional head (Anjli Zutshi or Sulabh Arora)
   - All downstream filters automatically update
   - Shows only data under selected regional head

2. **Region Filter:**
   - Displays regions available under selected regional head
   - If no regional head selected, shows all regions
   - Updates practice head options when selected

3. **Practice Head Filter:**
   - Shows practice heads available in selected region(s)
   - Filters account/project options accordingly

4. **Account/Project Filter:**
   - Shows projects matching all upstream filter selections
   - Most granular level of filtering

#### Additional Filters:

- **Fiscal Year Filter:** Choose FY 24-25, FY 25-26, or Both
- **Month Filter:** Focus on specific month (April, May, June, etc.)
- **Clear All Filters:** Reset button to start fresh

### Navigation Menu

**Sidebar menu sections:**

1. **📊 Dashboard Overview** - Executive summary and key metrics
2. **📈 Detailed Analytics** - Deep-dive analysis and trends
3. **📉 Practice Head View** - Practice head performance breakdown
4. **🎯 Account View** - Individual project-level insights
5. **📅 Monthly View** - Month-by-month performance tracking
6. **📊 Quarterly View** - Quarterly compliance analysis
7. **🔴 Not Reported** - Track unreported SLAs
8. **🏆 Benchmarking** - Industry comparison
9. **📖 User Manual** - This guide (built-in)

---

## Understanding the Data

### Data Structure

**FY 24-25 (Previous Fiscal Year):**
- Complete data: April 2024 - March 2025 (12 months)
- Column name: "Regional Head" (no trailing space)

**FY 25-26 (Current Fiscal Year):**
- Latest data available: April 2025 - September 2025
- Dashboard is **future-proof** - automatically displays new months when data is updated
- Column name: "Regional Head " (with trailing space)

**Note:** The dashboard automatically handles column name variations, so both fiscal years display correctly regardless of filter selection.

### Key Metrics Explained

**SLA% (Service Level Agreement Percentage):**
```
SLA% = (Total Met / (Total Met + Total Not Met)) × 100
```

**Compliance Status:**
- 🟢 **Green (85-100%):** Excellent performance
- 🟡 **Yellow (70-84%):** Satisfactory performance
- 🟠 **Orange (50-69%):** Needs attention
- 🔴 **Red (0-49%):** Critical - requires immediate action

**Year-over-Year (YoY) Comparison:**
- **↑ Positive Change:** Improvement from previous year
- **↓ Negative Change:** Decline from previous year
- **N/A:** Account/practice head not present in comparison year
- **NEW:** Started reporting in FY 25-26 only

### Regional Head Information

**Current Regional Heads:**

1. **Anjli Zutshi**
   - FY 24-25: 36 projects (67.9% of total)
   - FY 25-26: 35 projects (68.6% of total)

2. **Sulabh Arora**
   - FY 24-25: 17 projects (32.1% of total)
   - FY 25-26: 16 projects (31.4% of total)

The Regional Head filter allows executive-level tracking and accountability.

---

## Views & Analytics

### 📊 Dashboard Overview

**What You'll See:**
- Overall SLA metrics card with key statistics
- Top 5 and worst 5 performing accounts
- Most improved and most declined accounts
- Regional performance heatmap
- Practice head rankings
- Monthly trend charts
- Quarterly compliance graphs

**When to Use:**
- Executive briefings
- Quick performance snapshot
- Identifying areas requiring attention
- Monthly/quarterly reviews

### 📈 Detailed Analytics

**Includes:**
- Comprehensive account-wise breakdown table
- Sortable columns (click headers to sort)
- All months visible with Met/Not Met counts
- YoY comparison for each account
- Color-coded performance indicators

**When to Use:**
- Detailed performance review
- Finding specific project data
- Analyzing monthly patterns
- Preparing detailed reports

### 📉 Practice Head View

**Features:**
- Practice head-wise SLA percentage
- Account count per practice head
- YoY comparison
- Drill-down to accounts under each practice head

**When to Use:**
- Practice head performance reviews
- Identifying high/low performing leaders
- Resource allocation decisions
- Team performance benchmarking

### 🎯 Account View

**Shows:**
- Individual project performance
- Monthly breakdown for each project
- Regional and practice head assignment
- Historical trends
- Comparison against benchmark

**When to Use:**
- Client-specific reviews
- Project health checks
- Billing and compliance verification
- Client relationship management

### 📅 Monthly View

**Displays:**
- Month-by-month SLA performance
- Both fiscal years side-by-side
- Trend identification
- Seasonal pattern analysis

**When to Use:**
- Tracking monthly trends
- Identifying seasonal variations
- Month-specific deep dives
- Planning resource allocation

### 📊 Quarterly View

**Features:**
- Q1, Q2, Q3, Q4 compliance percentages
- Aggregated quarterly metrics
- Quarterly comparisons across years
- Quarterly trend charts

**When to Use:**
- Quarterly business reviews (QBRs)
- Board presentations
- Long-term trend analysis
- Strategic planning

### 🔴 Not Reported

**Two Analysis Tables:**

1. **Regional Analysis:**
   - Not reported SLAs by region
   - Month-wise breakdown
   - Total not reported per region
   - Percentage of total not reported

2. **Regional Head Analysis (New!):**
   - Not reported SLAs by regional head
   - Accountability at executive level
   - Month-wise breakdown
   - Total not reported per regional head

**Account-Level Details:**
- List of all accounts with not reported SLAs
- Monthly not reported counts
- Total not reported per account
- Regional and practice head association

**When to Use:**
- Process improvement initiatives
- Identifying data quality issues
- Following up on missing reports
- Root cause analysis

### 🏆 Benchmarking

**Competitive Intelligence:**
- TAGGD vs. industry leaders comparison
- Market position ranking
- Gap analysis
- Strategic recommendations
- Source references for benchmarks

**When to Use:**
- Strategic planning
- Setting performance targets
- Understanding competitive landscape
- Board presentations

---

## Export Options

### 📄 PDF Export

**What It Does:**
- Captures current dashboard view as PDF
- Includes visible charts and tables
- Preserves color coding and formatting

**How to Use:**
1. Navigate to the view you want to export
2. Apply filters as needed
3. Click "Export PDF" button
4. PDF downloads automatically

**Best For:**
- Executive presentations
- Meeting handouts
- Email distribution
- Archival purposes

### 📊 Excel Export

**What It Does:**
- Exports filtered data to Excel workbook
- Multiple sheets for different analyses
- Maintains data structure
- Enables further analysis in Excel

**Includes:**
- Summary sheet
- Detailed data sheet
- Not reported analysis
- Monthly breakdowns

**Best For:**
- Detailed data analysis
- Creating custom reports
- Data sharing with stakeholders
- Integration with other tools

### 📽️ PowerPoint Export

**What It Does:**
- Creates presentation-ready slides
- Automated chart generation
- Professional formatting
- Multiple slides for different views

**Best For:**
- Executive presentations
- Board meetings
- Client presentations
- Team meetings

---

## Frequently Asked Questions

### Q: Why does FY 25-26 show data only up to September?

**A:** FY 25-26 is the current fiscal year. The latest uploaded data includes records up to September 2025. The dashboard is **future-proof** and will automatically display additional months once new monthly SLA reports are uploaded and processed. The system dynamically detects available months from the data columns.

### Q: What does "N/A" mean in year-over-year comparisons?

**A:** N/A appears when an account or practice head was reporting in one fiscal year but not in the other. This could indicate:
- Discontinued accounts/projects
- New engagements that started in FY 25-26
- Changes in organizational structure

### Q: What does "NEW" mean?

**A:** NEW indicates that the account or practice head started reporting SLAs in FY 25-26 and was not present in FY 24-25 data. These are new engagements or projects.

### Q: How are quarterly metrics calculated?

**A:** Quarterly compliance is calculated by:
1. Aggregating all SLAs (met and not met) within the three months of each quarter
2. Calculating the compliance percentage: (Total Met / Total SLAs) × 100

**Quarters:**
- Q1: April - June
- Q2: July - September
- Q3: October - December
- Q4: January - March

### Q: Can I compare specific months across years?

**A:** Yes! Use the Month filter to select a specific month (e.g., "April"), and all views will show only that month's data for both fiscal years. This enables month-to-month YoY comparisons.

### Q: What is the Regional Head filter?

**A:** The Regional Head filter allows you to view SLA performance data for specific regional leaders. This filter **cascades down** to show only the regions, practice heads, and accounts under the selected regional head. Currently available regional heads are:
- Anjli Zutshi
- Sulabh Arora

### Q: How do cascading filters work?

**A:** The filters are **hierarchical**: Regional Head → Region → Practice Head → Account. 

When you select a Regional Head:
- Region dropdown updates to show only regions under that regional head
- Practice Head dropdown shows only practice heads in those regions
- Account dropdown shows only accounts/projects matching all criteria

This helps you drill down from executive level to individual project level seamlessly.

### Q: Why did FY 24-25 data not appear when I filtered by Regional Head?

**A:** This issue has been **fixed**! Previously, there was a column name inconsistency in the data:
- FY 24-25 used "Regional Head" (no space)
- FY 25-26 used "Regional Head " (with trailing space)

The dashboard now handles both variations automatically, so all data displays correctly regardless of the filter applied. This fix was deployed on November 23, 2025.

### Q: Will the dashboard automatically update when new monthly data is available?

**A:** Yes! The dashboard is **future-proof**. The process is:

1. **Data Processing:** New monthly SLA reports are processed via the `excel_to_json.py` script
2. **File Update:** The JSON data file is updated with new month columns
3. **Upload to Dashboard:** Simply re-upload the updated file to the dashboard
4. **Automatic Detection:** The system automatically detects available months from data columns
5. **UI Updates:** All views, charts, filters, and tables update automatically

**No code changes required!** The dashboard dynamically adapts to whatever months are present in the data.

### Q: How do I clear all filters at once?

**A:** Click the "Clear All Filters" button at the bottom of the filter section in the sidebar. This resets all filters to their default state (showing all data).

### Q: Can I view the dashboard on mobile devices?

**A:** Yes! The dashboard is fully responsive:
- Mobile menu toggle button (☰) appears on smaller screens
- Tap to open/close sidebar navigation
- Charts and tables adapt to screen size
- All features available on mobile

### Q: What browsers are supported?

**A:** The dashboard works best on modern browsers:
- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Edge
- ✅ Safari
- ⚠️ Internet Explorer not supported

### Q: How often should I update the data?

**A:** Best practices:
- **Weekly:** For active monitoring and trend spotting
- **Monthly:** At minimum, after monthly reports are finalized
- **Quarterly:** For quarterly business reviews
- **As needed:** When significant changes occur

### Q: Can I customize the color thresholds?

**A:** The current color coding is:
- 🟢 Green: 85-100% (Excellent)
- 🟡 Yellow: 70-84% (Satisfactory)
- 🟠 Orange: 50-69% (Needs Attention)
- 🔴 Red: 0-49% (Critical)

These thresholds are built into the dashboard. Contact your system administrator for customization requests.

---

## Best Practices

### 🎯 For Executives

1. **Start with Overview:** Get high-level insights before diving into details
2. **Use Regional Head Filter:** Track performance by executive responsibility
3. **Focus on Red/Orange Items:** Prioritize accounts below 70% compliance
4. **Monitor Trends:** Check quarterly view for strategic patterns
5. **Export for Meetings:** Use PDF export for board presentations

### 📊 For Managers

1. **Use Practice Head View:** Monitor your team's performance
2. **Check Not Reported:** Follow up on missing reports promptly
3. **Track Monthly Trends:** Identify seasonal patterns and plan accordingly
4. **Cascade Filters:** Use Regional Head → Practice Head → Account flow
5. **Compare YoY:** Understand improvement or decline drivers

### 🎯 For Analysts

1. **Use Detailed Analytics:** Access comprehensive data tables
2. **Export to Excel:** Perform custom analysis in Excel
3. **Check All Filters:** Explore data from multiple angles
4. **Document Patterns:** Note recurring issues in Not Reported section
5. **Benchmark Regularly:** Compare against industry standards

### 📈 For Account Managers

1. **Use Account View:** Focus on specific projects
2. **Monitor Monthly Performance:** Track client-specific trends
3. **Set Filters:** Regional + Practice Head + Your Account
4. **Check Not Reported:** Ensure your accounts are reporting consistently
5. **Prepare Client Reports:** Export relevant views for client meetings

### 🔄 Regular Review Cadence

**Weekly:**
- Quick overview check
- Not reported follow-ups
- Critical (red) items review

**Monthly:**
- Detailed analytics review
- Month-over-month comparison
- Upload updated data
- Export monthly reports

**Quarterly:**
- Quarterly view analysis
- Strategic planning
- Benchmarking review
- QBR preparation

---

## Troubleshooting

### Dashboard Not Loading

**Solutions:**
1. Hard refresh: **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac)
2. Clear browser cache
3. Try incognito/private browsing mode
4. Check internet connection
5. Try a different browser

### Data Not Appearing After Upload

**Check:**
1. File format is correct (.xlsx)
2. File has required sheets:
   - "FY 24-25 Summary"
   - "FY 25-26 Summary"
   - "FY24-25 Not Reported"
   - "FY25-26 Not Reported"
3. Column names match expected format
4. Press F12 to check browser console for errors

### Filters Not Working

**Solutions:**
1. Click "Clear All Filters" and try again
2. Refresh the dashboard
3. Check if data is loaded properly
4. Try selecting filters in hierarchical order (Regional Head → Region → Practice Head → Account)

### Charts Not Displaying

**Solutions:**
1. Ensure data is loaded
2. Try switching views and coming back
3. Check if filters are too restrictive (no data matching criteria)
4. Refresh the browser

### Export Not Working

**Check:**
1. Pop-up blocker is disabled
2. Browser has permission to download files
3. Sufficient disk space available
4. Try a different export format

### GitHub Pages Shows Old Version

**Solutions:**
1. Wait 2-3 minutes for GitHub Pages to rebuild
2. Hard refresh: **Ctrl+F5** or **Cmd+Shift+R**
3. Clear browser cache completely
4. Check GitHub Actions for deployment status

### Mobile Menu Not Opening

**Solutions:**
1. Ensure you're tapping the hamburger icon (☰)
2. Try tapping multiple times
3. Refresh the page
4. Check if screen width is below 768px

---

## Support & Contact

### For Technical Issues

1. Check this user manual first
2. Review the FAQ section in the dashboard
3. Contact your system administrator
4. Email the TAGGD analytics team

### For Data Questions

1. Verify data source Excel file
2. Check with data team about column structure
3. Review `excel_to_json.py` script documentation
4. Contact data quality team

### For Feature Requests

1. Document the requested feature
2. Explain the business use case
3. Submit to product team
4. Discuss with system administrator

---

## Version History

### Version 2.0 (November 24, 2025)

**New Features:**
- ✅ Welcome popup with random inspirational quotes
- ✅ Dynamic date display in welcome message
- ✅ Regional Head filter with cascading functionality
- ✅ Regional Head-wise Not Reported analysis table
- ✅ Fixed FY 24-25 display issue with Regional Head filter

**Updates:**
- ✅ Updated FAQ with Regional Head information
- ✅ Enhanced user manual with comprehensive coverage
- ✅ Improved mobile responsiveness
- ✅ Future-proof architecture for automatic month detection

### Version 1.0 (October 2025)

**Initial Release:**
- Dashboard overview
- Multi-year comparison
- Practice head and account views
- Monthly and quarterly analytics
- Not reported tracking
- Benchmarking
- Export functionality

---

## Quick Reference Card

### Essential Shortcuts

| Action | Method |
|--------|--------|
| **Close Welcome Popup** | Click "Go to Dashboard" button |
| **Upload Data** | Sidebar → 📂 Upload Data |
| **Clear Filters** | Sidebar → Clear All Filters button |
| **Switch Theme** | Header → Theme toggle icon |
| **Enable Audio** | Header → Audio toggle icon |
| **Open Mobile Menu** | Tap ☰ icon (mobile only) |
| **Export PDF** | Any view → Export PDF button |
| **Hard Refresh** | Ctrl+F5 (Win) / Cmd+Shift+R (Mac) |

### Color Guide

| Color | SLA% Range | Status |
|-------|-----------|--------|
| 🟢 Green | 85-100% | Excellent |
| 🟡 Yellow | 70-84% | Satisfactory |
| 🟠 Orange | 50-69% | Needs Attention |
| 🔴 Red | 0-49% | Critical |

### Filter Hierarchy

```
🎯 Regional Head (Executive Level)
    ↓
📍 Region (Geographic Level)
    ↓
👤 Practice Head (Manager Level)
    ↓
📊 Account/Project (Individual Level)
```

---

## Glossary

**SLA:** Service Level Agreement - A commitment to maintain a certain level of service

**YoY:** Year-over-Year comparison between fiscal years

**Compliance %:** Percentage of SLAs met out of total SLAs

**Not Reported:** SLAs that were expected but not reported in the system

**Cascading Filter:** Hierarchical filter where selecting one filter automatically updates downstream filter options

**Regional Head:** Executive responsible for multiple regions and their performance

**Practice Head:** Manager responsible for specific practice area or function

**FY:** Fiscal Year (April to March)

**N/A:** Not Applicable - indicates missing comparison data

**NEW:** Indicates new account/practice head in current fiscal year

---

**📖 End of User Manual**

For additional support or questions, please contact the TAGGD analytics team or your system administrator.

**Dashboard URL:** https://rishab25276.github.io/SLA-DASHBOARD/TAGGD_Dashboard_ENHANCED.html

**Last Updated:** November 24, 2025
