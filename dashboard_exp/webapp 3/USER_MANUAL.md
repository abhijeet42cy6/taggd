# 📘 Business Excellence Quality Dashboard - User Manual

**Version**: 2.0  
**Last Updated**: January 28, 2026  
**For**: Novice Users & New Team Members

---

## 📖 Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Understanding Key Metrics](#understanding-key-metrics)
5. [Navigation Guide](#navigation-guide)
6. [Using Each Tab](#using-each-tab)
7. [Key Features Explained](#key-features-explained)
8. [Understanding Account Weightage](#understanding-account-weightage)
9. [Frequently Asked Questions](#frequently-asked-questions)
10. [Troubleshooting](#troubleshooting)

---

## 1. Introduction

### What is the Business Excellence Quality Dashboard?

The Business Excellence Quality Dashboard is a comprehensive tool designed to monitor, analyze, and improve audit quality across multiple client accounts. It helps business excellence teams:

- **Track audit performance** across different accounts
- **Identify top-performing accounts** and those needing attention
- **Monitor audit accuracy and compliance**
- **Manage audit timelines and SLA adherence**
- **Analyze parameter-level performance**

### Who Should Use This Dashboard?

- **Quality Managers**: Monitor overall audit performance and team effectiveness
- **Business Excellence Teams**: Track audit metrics and identify improvement areas
- **Account Managers**: Review specific account performance
- **Auditors**: Understand audit requirements and status
- **Leadership**: Get high-level insights into quality operations

---

## 2. Getting Started

### Accessing the Dashboard

1. **Open your web browser** (Chrome, Firefox, Safari, or Edge)
2. **Navigate to**: https://businessexcellence.github.io/Quality-Dashboard/
3. **Wait for the dashboard to load** (usually 2-5 seconds)

### First Time Setup

**No login required!** The dashboard loads automatically with the latest data from the base file.

### Browser Requirements

- **Recommended**: Google Chrome (latest version)
- **Also works on**: Firefox, Safari, Edge, Opera
- **Internet Connection**: Required for initial load
- **Screen Resolution**: 1280x720 or higher recommended

---

## 3. Dashboard Overview

### Main Dashboard Sections

The dashboard is divided into **7 main tabs**, each providing different insights:

```
┌─────────────────────────────────────────────────────┐
│ 🏠 Home | 🎯 Journey at Glance | 📊 Parameter       │
│         | Performance | 💼 Transactional Overview   │
│         | 📅 Audit Details | 🔍 Account Summary |    │
│         | ⚠️ RCA & CAPA                               │
└─────────────────────────────────────────────────────┘
```

### Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│ ◀️ Sidebar                   Header Section          │
│   - Logo                     - Dashboard Title        │
│   - Navigation Tabs          - Last Updated          │
│                                                       │
│ ┌──────────────────────────────────────────────────┐│
│ │                                                  ││
│ │              Main Content Area                   ││
│ │        (Changes based on selected tab)           ││
│ │                                                  ││
│ └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

---

## 4. Understanding Key Metrics

### Core Metrics Explained

#### 1. **Audit Accuracy %**
- **What it means**: Percentage of audits that passed quality checks
- **Formula**: (Audits Passed ÷ Valid Audits) × 100
- **Good Score**: 90% or above
- **Needs Attention**: Below 75%

**Example**: If 95 out of 100 audits passed → Accuracy = 95%

#### 2. **Audit Sample %**
- **What it means**: Percentage of total population audited
- **Formula**: (Opportunity Count ÷ Total Population) × 100
- **Good Score**: Varies by account (typically 5-20%)

**Example**: If 500 out of 10,000 records audited → Sample = 5%

#### 3. **Account Weightage** ⭐ NEW
- **What it means**: Combined score of accuracy and audit volume
- **Formula**: (60% × Accuracy) + (40% × Normalized Audit Count)
- **Purpose**: Identify truly high-performing accounts
- **Range**: 0-100%

**Example**: 
- Account with 95% accuracy and 10,000 audits → Weightage = 64.9%
- Account with 85% accuracy and 50,000 audits → Weightage = 71.0%

#### 4. **SLA Compliance %**
- **What it means**: Percentage of audits completed within deadline
- **Formula**: (SLA Met ÷ Total Audits) × 100
- **Good Score**: 95% or above
- **Needs Attention**: Below 80%

#### 5. **Total Audits**
- **What it means**: Total number of audit records processed
- **Includes**: All audit types (critical, non-critical, closed, open)

#### 6. **Error %**
- **What it means**: Percentage of audits that failed
- **Formula**: 100% - Accuracy %
- **Good Score**: Below 10%

---

## 5. Navigation Guide

### Using the Sidebar

The sidebar on the left contains all navigation tabs. Click on any tab to view that section.

```
┌──────────────────────┐
│ 🏠 Home              │ ← Overview and key insights
│ 🎯 Journey at Glance│ ← Account-level summary
│ 📊 Parameter Perf.  │ ← Parameter analysis
│ 💼 Transactional    │ ← Transaction-level data
│ 📅 Audit Details    │ ← Detailed audit records
│ 🔍 Account Summary  │ ← Account master data
│ ⚠️ RCA & CAPA       │ ← Quality issues tracking
└──────────────────────┘
```

### Quick Tips
- **Active Tab**: Highlighted in the sidebar
- **Hover Effect**: Tabs light up when you hover over them
- **Click to Navigate**: Single click to switch tabs
- **Responsive**: Works on tablets and mobile devices

---

## 6. Using Each Tab

### 🏠 **Home Tab**

**Purpose**: Quick overview of dashboard performance and key insights

**What You'll See**:

1. **Scrolling Insight Cards** (Top of page)
   ```
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │ Accounts Under  │  │ Account of the  │  │ Closed Projects │
   │ Audit           │  │ Month           │  │                 │
   │ 15/49           │  │ HPE - 71.5%     │  │ 21 Completed    │
   │ Active Audits   │  │ Weightage       │  │ This Period     │
   └─────────────────┘  └─────────────────┘  └─────────────────┘
   ```

2. **🏆 Top Performing Accounts**
   - Shows 5 accounts with highest Account Weightage
   - Includes: Rank, Account Name, Audits, Accuracy, Weightage

3. **⚠️ Needs Attention**
   - Shows 5 accounts with lowest Account Weightage
   - Same columns as Top Performing

**How to Use**:
1. Check scrolling cards for quick insights
2. Review top performers for best practices
3. Focus on "Needs Attention" for improvement opportunities

---

### 🎯 **Journey at Glance Tab**

**Purpose**: High-level view of all accounts with audit status

**What You'll See**:

1. **Overall KPI Cards**
   ```
   ┌──────────────────┐  ┌──────────────────┐
   │ TOTAL OPPORTUNITY│  │ AUDIT SAMPLE %   │
   │ 27,871           │  │ 36.0%            │
   └──────────────────┘  └──────────────────┘
   
   ┌──────────────────┐  ┌──────────────────┐
   │ AUDIT ACCURACY % │  │ OVERALL SLA      │
   │ 92.5%            │  │ COMPLIANCE %     │
   │ ⭐ EXCELLENT     │  │ 94.2%            │
   └──────────────────┘  └──────────────────┘
   ```

2. **Account-Level Cards**
   - Each active account gets its own colored card
   - Shows account-specific KPIs
   - Lists projects under each account

**How to Use**:
1. Review overall KPIs at the top
2. Scroll down to see individual account performance
3. Click on account names for more details
4. Compare accuracy and sample rates across accounts

---

### 📊 **Parameter Performance Tab**

**Purpose**: Analyze performance at the parameter level

**What You'll See**:

1. **Parameter KPI Cards**
   ```
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ AUDIT        │  │ AUDIT        │  │ ERROR %      │
   │ ACCURACY %   │  │ SAMPLE %     │  │              │
   │ 92.5%        │  │ 36.0%        │  │ 7.5%         │
   └──────────────┘  └──────────────┘  └──────────────┘
   
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ TOTAL AUDITS │  │ CRITICAL     │  │ NON-CRITICAL │
   │              │  │ PARAMS       │  │ PARAMS       │
   │ 27,871       │  │ 45           │  │ 23           │
   └──────────────┘  └──────────────┘  └──────────────┘
   ```

2. **Parameter Performance Table**
   - Lists all parameters with their performance metrics
   - Columns: Parameter Name, Audits, Pass, Fail, NA, Accuracy

3. **Visual Charts**
   - Bar charts showing parameter-wise performance
   - Trend analysis over time

**How to Use**:
1. Identify which parameters have low accuracy
2. Focus improvement efforts on critical parameters with high error rates
3. Use the table to sort and filter parameters
4. Export data if needed for detailed analysis

---

### 💼 **Transactional Overview Tab**

**Purpose**: Monitor transactional-level audit data

**What You'll See**:

1. **Transaction KPIs**
   - Total transactions processed
   - Transaction accuracy rate
   - SLA compliance

2. **Transaction Table**
   - Detailed list of all transactions
   - Filterable by account, date, status

**How to Use**:
1. Review overall transaction metrics
2. Filter by date range to analyze specific periods
3. Search for specific transactions using the search bar
4. Export transaction data for reporting

---

### 📅 **Audit Details Tab**

**Purpose**: Drill down into individual audit records

**What You'll See**:

1. **Search and Filter Bar**
   - Search by audit ID, account, parameter
   - Filter by date range, status, auditor

2. **Audit Records Table**
   - Each row = one audit record
   - Columns: Audit ID, Date, Account, Parameter, Status, Result, Auditor

3. **Audit Aging**
   - Shows how long audits have been open
   - Helps identify delayed audits

**How to Use**:
1. Use search to find specific audits
2. Apply filters to narrow down results
3. Click on audit ID to see full details
4. Monitor aging to ensure timely completion

---

### 🔍 **Account Summary Tab**

**Purpose**: Master view of all account information

**What You'll See**:

1. **Account Count Summary**
   ```
   Total Accounts: 49
   Accounts Under Audit: 15
   Inactive Accounts: 34
   ```

2. **Account Master Table**
   - Account Name
   - Client Contact
   - Audit Status (YES/NO)
   - BE SPOC (Business Excellence contact)
   - Business Unit
   - Account Type

**How to Use**:
1. Reference account information
2. Check audit status for each account
3. Find BE SPOC contacts
4. Verify account classifications

---

### ⚠️ **RCA & CAPA Tab**

**Purpose**: Track quality issues and corrective actions

**What You'll See**:

1. **RCA/CAPA Summary**
   - Open issues count
   - Closed issues count
   - Aging of open issues

2. **Issues Table**
   - Issue ID and description
   - Account affected
   - Root cause
   - Corrective action
   - Status (Open/Closed)
   - Owner

**How to Use**:
1. Monitor open issues requiring action
2. Review closed issues for trends
3. Check aging to prioritize old issues
4. Assign owners for follow-up

---

## 7. Key Features Explained

### 🔍 Search and Filter

Most tabs include search and filter capabilities:

1. **Search Bar**: Type keywords to find specific records
2. **Date Filters**: Select date range to narrow results
3. **Dropdown Filters**: Choose specific accounts, parameters, etc.
4. **Clear Filters**: Reset button to clear all filters

**Example**:
```
Search: "HPE"  →  Shows only HPE account records
Filter: Date Range = Last 30 days  →  Shows recent data only
```

### 📊 Data Tables

All tables in the dashboard support:

- **Sorting**: Click column headers to sort ascending/descending
- **Pagination**: Navigate through multiple pages of data
- **Column Resize**: Drag column borders to adjust width
- **Row Selection**: Click rows to highlight them

### 📈 Charts and Visualizations

The dashboard includes various chart types:

- **Bar Charts**: Compare values across categories
- **Line Charts**: Show trends over time
- **Donut Charts**: Display proportions
- **Trend Indicators**: Show if metrics are improving or declining

### 🎨 Color Coding

The dashboard uses color coding to indicate status:

- **🟢 Green**: Good performance (90%+ accuracy, SLA met)
- **🟡 Yellow/Amber**: Moderate performance (75-90% accuracy)
- **🔴 Red**: Needs attention (below 75% accuracy, SLA breached)
- **⚫ Gray**: Neutral or no data

### 📱 Responsive Design

The dashboard adapts to different screen sizes:

- **Desktop**: Full layout with all features
- **Tablet**: Adjusted layout, all features accessible
- **Mobile**: Simplified view, swipe navigation

---

## 8. Understanding Account Weightage

### What is Account Weightage?

Account Weightage is a NEW metric that combines two important factors:
1. **Audit Accuracy** (60% weight) - Quality of audits
2. **Audit Volume** (40% weight) - Quantity of audits

### Why Was This Created?

**Problem**: Previously, an account with:
- 100% accuracy on 10 audits would rank higher than
- 98% accuracy on 50,000 audits

This didn't reflect true account performance!

**Solution**: Account Weightage balances quality AND volume.

### How is it Calculated?

#### Step 1: Calculate Accuracy Score
```
Accuracy Score = (Audits Passed ÷ Valid Audits) × 100
Example: 9,500 passed ÷ 10,000 valid = 95.0%
```

#### Step 2: Normalize Audit Count
```
Normalized Audits = ((Current Audits - Min Audits) ÷ (Max Audits - Min Audits)) × 100

Example:
Current: 10,000 audits
Min: 100 audits
Max: 50,000 audits

Normalized = ((10,000 - 100) ÷ (50,000 - 100)) × 100 = 19.8
```

#### Step 3: Calculate Weightage
```
Account Weightage = (Accuracy × 0.60) + (Normalized Audits × 0.40)

Example:
= (95.0 × 0.60) + (19.8 × 0.40)
= 57.0 + 7.92
= 64.92%
```

### Real-World Examples

#### Example 1: High Accuracy, Medium Volume
```
Account: WIPRO
Accuracy: 98.5%
Audits: 5,000
Normalized Audits: 9.8

Weightage = (98.5 × 0.60) + (9.8 × 0.40)
          = 59.1 + 3.92
          = 63.02%
```

#### Example 2: Good Accuracy, High Volume
```
Account: HPE
Accuracy: 95.0%
Audits: 25,000
Normalized Audits: 49.9

Weightage = (95.0 × 0.60) + (49.9 × 0.40)
          = 57.0 + 19.96
          = 76.96%
```

#### Example 3: Excellent Accuracy, Low Volume
```
Account: SMALL ACCOUNT
Accuracy: 100%
Audits: 500
Normalized Audits: 0.8

Weightage = (100.0 × 0.60) + (0.8 × 0.40)
          = 60.0 + 0.32
          = 60.32%
```

### How to Interpret Weightage

| Weightage Range | Interpretation | Action |
|----------------|----------------|--------|
| **80-100%** | Excellent - High accuracy AND high volume | Maintain standards, share best practices |
| **60-79%** | Good - Either high accuracy OR good volume | Balance quality with volume |
| **40-59%** | Fair - Moderate performance | Focus on improvement |
| **Below 40%** | Needs Attention - Low in both metrics | Immediate intervention required |

### Where is Weightage Used?

1. **Account of the Month**: Winner has highest weightage
2. **Top Performing Accounts**: Sorted by weightage (descending)
3. **Needs Attention**: Sorted by weightage (ascending)

---

## 9. Frequently Asked Questions

### General Questions

**Q: How often is the data updated?**  
A: The dashboard loads the latest data from the base file each time you open it. The base file is typically updated weekly or monthly depending on your organization's schedule.

**Q: Can I export the data?**  
A: Some tables have export functionality (look for download icons). You can also copy data from tables and paste into Excel.

**Q: Why do I see "No data available" messages?**  
A: This usually means:
- The base file hasn't loaded yet (refresh the page)
- That specific account/parameter has no data
- Filters are too restrictive (clear filters and try again)

**Q: How do I print reports?**  
A: Use your browser's print function (Ctrl+P / Cmd+P). The dashboard is print-optimized and will format nicely on paper.

### Metric Questions

**Q: What's the difference between Accuracy and Weightage?**  
A: 
- **Accuracy** = Pure pass rate (quality only)
- **Weightage** = Combines accuracy with audit volume (quality + quantity)

**Q: Why is my account's weightage lower than accuracy?**  
A: If your account has low audit volume compared to others, the weightage will be pulled down by the volume component.

**Q: What does "NA" mean in audit counts?**  
A: NA (Not Applicable) audits are excluded from accuracy calculations because they weren't relevant for that specific record.

**Q: How is SLA compliance calculated?**  
A: SLA Compliance = (Audits Completed On Time ÷ Total Audits Due) × 100

### Technical Questions

**Q: Which browser should I use?**  
A: Google Chrome is recommended, but the dashboard works on all modern browsers.

**Q: The dashboard is slow. What can I do?**  
A:
1. Refresh the page (F5)
2. Clear your browser cache (Ctrl+Shift+Del)
3. Close other browser tabs to free up memory
4. Check your internet connection

**Q: Can I access this on my phone?**  
A: Yes! The dashboard is mobile-responsive. However, for best experience, use a tablet or desktop.

**Q: How do I bookmark a specific tab?**  
A: Click on the tab you want, then bookmark the URL. The tab selection is saved in the URL.

---

## 10. Troubleshooting

### Common Issues and Solutions

#### Issue: Dashboard won't load

**Symptoms**: Blank page or stuck loading spinner

**Solutions**:
1. Check internet connection
2. Refresh page (F5 or Ctrl+R)
3. Clear browser cache: Ctrl+Shift+Del (Chrome) or Cmd+Shift+Del (Mac)
4. Try incognito/private browsing mode
5. Try a different browser

#### Issue: Data looks incorrect

**Symptoms**: Numbers don't match expectations, missing accounts

**Solutions**:
1. Verify the base file has been updated recently
2. Check the "Last Updated" timestamp in the header
3. Refresh the page to reload data
4. Clear filters that might be hiding data
5. Contact your dashboard administrator

#### Issue: Tables are empty

**Symptoms**: "No data available" messages in tables

**Solutions**:
1. Check if filters are applied (clear them)
2. Verify you're looking at the correct date range
3. Ensure the base file contains data for that section
4. Refresh the page
5. Check browser console for errors (F12 → Console tab)

#### Issue: Charts not displaying

**Symptoms**: Blank areas where charts should be

**Solutions**:
1. Refresh the page
2. Disable browser extensions (especially ad blockers)
3. Try a different browser
4. Check if JavaScript is enabled in browser settings

#### Issue: Can't sort or filter tables

**Symptoms**: Clicking column headers or filters does nothing

**Solutions**:
1. Ensure the table has finished loading
2. Refresh the page
3. Check if there's a JavaScript error (F12 → Console)
4. Try clicking again after page fully loads

#### Issue: Mobile view is cramped

**Symptoms**: Content overlaps, can't read properly

**Solutions**:
1. Rotate device to landscape mode
2. Zoom out slightly (pinch gesture on mobile)
3. Use a tablet or desktop for best experience
4. Scroll horizontally in tables

### Getting Help

If you continue to experience issues:

1. **Check the README**: See README.md in the repository
2. **Contact Support**: Reach out to your dashboard administrator
3. **Report a Bug**: Create an issue on GitHub
4. **Documentation**: Review this manual for additional guidance

### Browser Console for Debugging

If you're comfortable with technical tools:

1. Press **F12** to open Developer Tools
2. Click on **Console** tab
3. Look for error messages in red
4. Take a screenshot and share with support

---

## 📌 Quick Reference Guide

### Common Tasks

| Task | Steps |
|------|-------|
| View overall performance | Go to **Home** tab |
| Check account status | Go to **Journey at Glance** tab |
| Analyze specific parameters | Go to **Parameter Performance** tab |
| Find specific audit | Go to **Audit Details** → Use search bar |
| Check account information | Go to **Account Summary** tab |
| Review quality issues | Go to **RCA & CAPA** tab |
| Export data | Look for download icon in table headers |
| Print report | Press **Ctrl+P** (Windows) or **Cmd+P** (Mac) |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **F5** or **Ctrl+R** | Refresh dashboard |
| **Ctrl+F** | Search within page |
| **Ctrl+P** | Print current view |
| **F12** | Open developer console |
| **Esc** | Close modals/popups |

### Color Code Reference

| Color | Meaning |
|-------|---------|
| 🟢 **Green** | Good performance (≥90%) |
| 🟡 **Yellow** | Moderate (75-89%) |
| 🔴 **Red** | Needs attention (<75%) |
| 🟣 **Purple** | Top performer |
| 🟠 **Orange** | Warning/aging items |
| ⚫ **Gray** | Neutral/no status |

---

## 📞 Contact & Support

### Dashboard Administrator
- **Check with your organization** for specific contact details

### Documentation
- **User Manual**: This document
- **README**: See README.md in GitHub repository
- **Technical Docs**: Contact your IT team

### GitHub Repository
- **URL**: https://github.com/Businessexcellence/Quality-Dashboard
- **Issues**: Report bugs and request features

---

## ✅ Checklist for New Users

Before you start using the dashboard, make sure you:

- [ ] Have access to the dashboard URL
- [ ] Are using a modern web browser (Chrome recommended)
- [ ] Have read this user manual
- [ ] Understand the key metrics (Accuracy, Sample %, Weightage)
- [ ] Know how to navigate between tabs
- [ ] Can locate the search and filter features
- [ ] Understand the color coding system
- [ ] Know who to contact for support

---

## 🎓 Learning Path

### For Beginners (Week 1)
1. Spend time on **Home** tab to understand overall metrics
2. Click through each tab to see what's available
3. Practice using search and filter features
4. Review this manual's "Understanding Key Metrics" section

### For Intermediate Users (Week 2-4)
1. Dive into **Journey at Glance** to understand account performance
2. Use **Parameter Performance** to identify problem areas
3. Practice using **Audit Details** to find specific records
4. Learn to interpret Account Weightage

### For Advanced Users (Month 2+)
1. Compare trends over time
2. Identify patterns in quality issues
3. Use data to drive improvement initiatives
4. Share insights with team using exported data

---

## 📚 Additional Resources

### Recommended Reading
- Audit Quality Best Practices
- SLA Management Guidelines
- Root Cause Analysis Methodologies

### Training Materials
- Contact your training department for:
  - Dashboard walkthrough videos
  - Live training sessions
  - Advanced analytics workshops

---

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| **2.0** | Jan 28, 2026 | Added Account Weightage feature, updated screenshots |
| **1.1** | Jan 20, 2026 | Added Audit labels, fixed account counts |
| **1.0** | Jan 10, 2026 | Initial dashboard release |

---

**Thank you for using the Business Excellence Quality Dashboard!**

For questions or feedback, please contact your dashboard administrator or create an issue on GitHub.

---

*This manual was created to help novice users understand and effectively use the Business Excellence Quality Dashboard. For technical documentation, please refer to the README.md file in the GitHub repository.*
