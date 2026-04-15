# 📊 Quality Dashboard - Complete User Manual

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Home Tab](#home-tab)
5. [Journey at Glance Tab](#journey-at-glance-tab)
6. [Account Summary Tab](#account-summary-tab)
7. [Transactional Overview Tab](#transactional-overview-tab)
8. [Parameter Performance Tab](#parameter-performance-tab)
9. [Recruiter Insights Tab](#recruiter-insights-tab)
10. [Strategic Overview Tab](#strategic-overview-tab)
11. [Understanding Key Metrics](#understanding-key-metrics)
12. [Tips & Best Practices](#tips-and-best-practices)
13. [Troubleshooting](#troubleshooting)
14. [Glossary](#glossary)

---

# Introduction

## What is the Quality Dashboard?

The **Business Excellence Quality Dashboard** is a comprehensive tool designed to help you monitor, analyze, and improve audit quality across all your accounts. Think of it as your command center for quality management - everything you need to know about audit performance is in one place.

## Who Should Use This Dashboard?

- **Quality Managers**: Monitor overall performance and identify trends
- **Team Leaders**: Track team performance and coaching opportunities
- **Auditors**: Understand performance metrics and improvement areas
- **Business Leaders**: Get high-level insights into quality operations
- **New Team Members**: Learn about audit performance and standards

## What You'll Learn

By the end of this manual, you'll be able to:
- Navigate through all dashboard tabs with confidence
- Understand what each metric means
- Find the information you need quickly
- Make data-driven decisions
- Identify trends and improvement opportunities

---

# Getting Started

## Accessing the Dashboard

### Step 1: Open Your Browser
- Use modern browsers like Chrome, Firefox, Safari, or Edge
- Ensure you have an internet connection

### Step 2: Navigate to the Dashboard
- Production URL: `https://businessexcellence.github.io/Quality-Dashboard/`
- Bookmark this page for easy access

### Step 3: First Time Loading
- The dashboard may take 5-10 seconds to load all data
- You'll see a loading indicator while data is being fetched
- **Tip**: If data doesn't load, try refreshing the page (F5 or Ctrl+R)

## Dashboard Layout

### Main Components

```
┌─────────────────────────────────────────────────────┐
│  taggd.  [Logo]                                     │
├─────────────┬───────────────────────────────────────┤
│             │                                       │
│  Sidebar    │        Main Content Area             │
│  Menu       │                                       │
│             │  (This is where tabs display)         │
│             │                                       │
│             │                                       │
│             │                                       │
└─────────────┴───────────────────────────────────────┘
```

### Sidebar Navigation
Located on the left side of your screen, it contains:
- **Dashboard Views**: Links to different tabs
- **Dark Mode**: The dashboard uses a professional dark theme

### Main Content Area
The large area on the right that displays:
- Charts and graphs
- Tables with data
- Key performance indicators (KPIs)
- Filters and controls

---

# Dashboard Overview

## Available Tabs

The dashboard has 7 main tabs, each serving a specific purpose:

| Tab | Purpose | Best For |
|-----|---------|----------|
| **Home** | Quick overview of key metrics | Daily monitoring, executive summary |
| **Journey at Glance** | Individual account details | Account-specific analysis |
| **Account Summary** | List of all accounts | Comparing accounts, finding specific accounts |
| **Transactional Overview** | Transaction-level data | Deep-dive analysis, trend identification |
| **Parameter Performance** | Audit parameter analysis | Identifying weak parameters |
| **Recruiter Insights** | Individual recruiter performance | Coaching, performance reviews |
| **Strategic Overview** | High-level business metrics | Strategic planning, presentations |

## Navigation Tips

### How to Switch Between Tabs
1. Look at the **left sidebar**
2. Click on any tab name under "Dashboard Views"
3. The main content area will update immediately
4. The active tab is highlighted in the sidebar

### Keyboard Shortcuts
- **F5** or **Ctrl+R**: Refresh the page
- **Ctrl+F**: Find text on the page
- **Ctrl+ (Plus)**: Zoom in
- **Ctrl- (Minus)**: Zoom out

---

# Home Tab

## Overview
The Home tab is your **dashboard snapshot**. It shows you the most important information at a glance without overwhelming detail.

## What You'll See

### 1. Scrolling Insight Cards (Top of Page)
These cards automatically scroll horizontally, showing key highlights.

#### Card 1: Accounts Under Audit
```
┌────────────────────────┐
│ Accounts Under Audit   │
│        15/49           │
│   Active Audits        │
└────────────────────────┘
```
- **What it means**: 15 accounts are currently being audited out of 49 total accounts
- **Why it matters**: Shows audit coverage and capacity utilization
- **15**: Accounts with "Audit Status = YES"
- **49**: Total accounts in the system

#### Card 2: Account of the Month
```
┌────────────────────────┐
│ Account of the Month   │
│        HPE             │
│   71.5% Weightage      │
└────────────────────────┘
```
- **What it means**: HPE is the best-performing account this month
- **Why it matters**: Recognizes excellence and provides a benchmark
- **71.5% Weightage**: Combined score of accuracy (60%) and audit volume (40%)
- **Selection criteria**: Highest Account Weightage score

#### Card 3: Closed Projects
```
┌────────────────────────┐
│   Closed Projects      │
│         21             │
│ Completed This Period  │
└────────────────────────┘
```
- **What it means**: 21 projects were completed recently
- **Why it matters**: Shows productivity and project completion rate
- **Completed**: Projects marked as "Closed" or "Complete" in the system

#### Card 4: Closed RCA & CAPA
```
┌────────────────────────┐
│   Closed RCA & CAPA    │
│         85             │
│   Issues Resolved      │
└────────────────────────┘
```
- **What it means**: 85 quality issues have been resolved
- **Why it matters**: Shows commitment to continuous improvement
- **RCA**: Root Cause Analysis
- **CAPA**: Corrective and Preventive Actions

### 2. Top Performing Accounts Section

```
🏆 Top Performing Accounts

| # | Account | Weightage | Audits | Accuracy |
|---|---------|-----------|--------|----------|
| 1 | HPE     | 71.5%     | 25,000 | 95.0%    |
| 2 | TCS     | 69.2%     | 30,000 | 85.0%    |
| 3 | Wipro   | 68.8%     | 28,000 | 88.0%    |
| 4 | Infosys | 67.5%     | 26,000 | 90.0%    |
| 5 | Tech M  | 66.3%     | 24,000 | 87.0%    |
```

**Understanding the Columns:**

- **#**: Rank (1 = best performer)
- **Account**: Name of the client/account
- **Weightage**: Overall performance score (0-100%)
  - **Formula**: 60% of Accuracy + 40% of Normalized Audit Count
  - **Higher is better**
  - Example: 71.5% means excellent performance
- **Audits**: Total number of audits conducted
  - Shows audit volume/experience
  - More audits = more reliable data
- **Accuracy**: Quality score (percentage of audits passed)
  - Target: 90% or higher
  - Below 75%: Needs immediate attention

**Why These Accounts Are Top Performers:**
- They balance both **quality** (high accuracy) AND **quantity** (high audit volume)
- Example: HPE has 95% accuracy with 25,000 audits = 71.5% weightage
- These accounts demonstrate consistent, reliable quality at scale

**How to Use This Information:**
- **For Managers**: Share best practices from top performers with other teams
- **For Teams**: Learn from top performers' processes
- **For Clients**: Recognize and celebrate top-performing accounts

### 3. Needs Attention Section

```
⚠️ Needs Attention

| # | Account   | Weightage | Audits | Accuracy |
|---|-----------|-----------|--------|----------|
| 1 | Account X | 35.2%     | 2,000  | 68.0%    |
| 2 | Account Y | 38.5%     | 3,000  | 72.0%    |
| 3 | Account Z | 42.1%     | 4,500  | 75.0%    |
| 4 | Account A | 44.8%     | 5,000  | 78.0%    |
| 5 | Account B | 46.2%     | 6,000  | 80.0%    |
```

**Understanding the Data:**

These accounts have the **lowest Account Weightage** scores, indicating they need improvement in one or both areas:
1. **Low Accuracy**: Below target quality levels
2. **Low Audit Volume**: Not enough audit data to be reliable

**Color Coding:**
- 🔴 **Red Badge** (Weightage): Lowest performers
- 🔴 **Red Badge** (Accuracy < 75%): Critical - immediate action needed
- 🟠 **Orange Badge** (Accuracy 75-90%): Warning - needs improvement
- 🟢 **Green Badge** (Accuracy > 90%): Good - maintain standards

**What Actions to Take:**

1. **For Low Accuracy Accounts**:
   - Review recent audit findings
   - Identify common error patterns
   - Provide targeted training
   - Implement quality checks

2. **For Low Volume Accounts**:
   - Increase audit frequency
   - Ensure adequate staffing
   - Review process efficiency

3. **For Both Issues**:
   - Schedule urgent review meetings
   - Create improvement action plans
   - Assign dedicated support resources

**Example Analysis:**
- **Account X**: 35.2% weightage with 68% accuracy and only 2,000 audits
  - **Problem**: Low accuracy AND low volume
  - **Priority**: High - needs immediate intervention
  - **Actions**: Training, process review, increased oversight

---

# Journey at Glance Tab

## Overview
The **Journey at Glance** tab is where you dive deep into individual account performance. Think of it as your account encyclopedia - every detail about each account's audit journey is here.

## Main Features

### 1. Search and Filter Section (Top of Page)

```
┌─────────────────────────────────────────────────────┐
│  🔍 Search Accounts: [Type account name here...]    │
│                                                     │
│  📍 Filter by Region:    [ All Regions ▼ ]         │
│  📊 Filter by Status:    [ All Status ▼ ]          │
│  📋 Filter by Audit:     [ All ▼ ]                 │
└─────────────────────────────────────────────────────┘
```

**How to Use Filters:**

#### Search Box
- **Purpose**: Find specific accounts quickly
- **How to use**: 
  1. Click in the search box
  2. Type any part of the account name
  3. Results appear as you type (autocomplete)
  4. Click on a suggestion to select it
- **Example**: Type "HPE" to find HPE account
- **Tip**: Search is case-insensitive (HPE = hpe = Hpe)

#### Region Filter
- **Purpose**: View accounts from specific geographical regions
- **Options**: All Regions, APAC, EMEA, Americas, etc.
- **How to use**: Click dropdown → Select region → Accounts filter automatically
- **Use case**: "Show me all APAC accounts"

#### Status Filter
- **Purpose**: Filter accounts by operational status
- **Options**: All Status, Active, Inactive, On Hold, etc.
- **How to use**: Click dropdown → Select status → View filtered results
- **Use case**: "Show me only Active accounts"

#### Audit Status Filter
- **Purpose**: Filter by audit engagement status
- **Options**: All, YES (under audit), NO (not under audit)
- **How to use**: Click dropdown → Select audit status
- **Use case**: "Show me only accounts currently being audited"

**Pro Tip**: Combine filters!
- Example: Region = "APAC" + Status = "Active" + Audit = "YES"
- This shows: All active APAC accounts currently being audited

### 2. Journey Statistics (KPI Cards)

At the top, you'll see 5 large colorful cards showing overall statistics:

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ TOTAL        │ │ TOTAL        │ │ AUDIT        │ │ AUDIT        │ │ OVERALL SLA  │
│ POPULATION   │ │ OPPORTUNITY  │ │ SAMPLE %     │ │ ACCURACY %   │ │ COMPLIANCE % │
│              │ │              │ │              │ │              │ │              │
│   77,448     │ │   27,871     │ │   36.0%      │ │   98.1%      │ │   85.5%      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Understanding Each Card:**

#### Card 1: Total Population
- **Definition**: Total number of candidates/records in the system
- **What it includes**: All data points from Parameter_Audit_Count
- **Example**: 77,448 means 77,448 total records
- **Why it matters**: Shows the scale of operations

#### Card 2: Total Opportunity
- **Definition**: Total number of audit opportunities (items that can be audited)
- **What it includes**: Sum of "Opportunity Count" across all accounts
- **Example**: 27,871 means 27,871 auditable items
- **Why it matters**: Shows workload and audit coverage

#### Card 3: Audit Sample %
- **Definition**: Percentage of population that is being sampled for audits
- **Formula**: (Total Opportunity / Total Population) × 100
- **Example**: 36.0% means we're auditing 36% of all records
- **Target**: Depends on business needs, typically 30-50%
- **Why it matters**: Shows audit coverage - too low means risk, too high means inefficiency

#### Card 4: Audit Accuracy %
- **Definition**: Overall quality/accuracy of audits
- **Formula**: (Passed Audits / Valid Audits) × 100
- **Example**: 98.1% means 98.1% of audits passed quality checks
- **Quality Levels**:
  - 95-100%: 🟢 Excellent
  - 85-94%: 🟠 Good
  - 75-84%: 🟠 Fair
  - Below 75%: 🔴 Needs Attention
- **Why it matters**: Core quality indicator - higher is better

#### Card 5: Overall SLA Compliance %
- **Definition**: Percentage of accounts meeting Service Level Agreements
- **Formula**: (SLA Met / Total SLA) × 100
- **Example**: 85.5% means 85.5% of SLA commitments were met
- **Breakdown shown**: Met: 250 | Not Met: 45 | Not Reported: 12
- **Quality Levels**:
  - 75%+: 🟢 Excellent
  - 50-74%: 🟠 Needs Attention
  - Below 50%: 🔴 Critical
- **Why it matters**: Shows customer commitment adherence

### 3. Individual Account Cards

Below the statistics, you'll see detailed cards for each account:

```
┌─────────────────────────────────────────────────────────────┐
│  HPE                                      [×]                │
│  Region: APAC | Status: Active | Practice Head: John Doe    │
├─────────────────────────────────────────────────────────────┤
│  📊 Account Summary                                          │
│  • Audit Status: YES                                        │
│  • Audit Frequency: Monthly                                 │
│  • Practice Head: John Doe                                  │
│  • Regional Head: Jane Smith                                │
│  • BE SPOC - SLAs/KPIs: Robert Brown                       │
│  • BE SPOC - Audit: Sarah Johnson                           │
│                                                             │
│  📅 Audit Details                                           │
│  • Contract Sign Date: 15/01/2024                           │
│  • Audit Start Date: 01/02/2024                             │
│  • Audit End Date: 28/02/2024                               │
│  • Audit Ageing: < 6 Months                                 │
│  • Agreed Sample %: 40%                                     │
│                                                             │
│  📈 Performance KPIs                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│  │ TOTAL OPP  │ │ SAMPLE CNT │ │ AUDIT      │             │
│  │   5,200    │ │   2,080    │ │ SAMPLE %   │             │
│  │            │ │            │ │   40.0%    │             │
│  └────────────┘ └────────────┘ └────────────┘             │
│                                                             │
│  ┌────────────┐ ┌────────────┐                            │
│  │ AUDIT      │ │ OVERALL    │                             │
│  │ ACCURACY   │ │ SLA COMPL. │                             │
│  │   98.5%    │ │    Met     │                             │
│  └────────────┘ └────────────┘                             │
│                                                             │
│  🎯 SLA Compliance                                          │
│  Monthly Trend: [Chart showing monthly Met/Not Met/NR]     │
│                                                             │
│  📊 Projects (5)                                            │
│  [List of projects with status and dates]                  │
│                                                             │
│  👥 Recruiters (12)                                         │
│  Top recruiters with accuracy scores                        │
└─────────────────────────────────────────────────────────────┘
```

**Understanding Account Card Sections:**

#### A. Account Summary
**What you'll find:**
- **Audit Status**: Whether account is currently under audit (YES/NO)
- **Audit Frequency**: How often audits are conducted (Daily, Weekly, Monthly, Quarterly)
- **Practice Head**: Manager responsible for the practice area
- **Regional Head**: Senior manager overseeing the region
- **BE SPOC - SLAs/KPIs**: Point of contact for service level agreements
- **BE SPOC - Audit**: Point of contact for audit-related matters

**How to use this:**
- Quick reference for who to contact about this account
- Understand audit engagement level
- Know reporting structure

#### B. Audit Details
**What you'll find:**
- **Contract Sign Date**: When the audit contract was signed
  - Format: DD/MM/YYYY (e.g., 15/01/2024 = January 15, 2024)
- **Audit Start Date**: When audits began
- **Audit End Date**: When the audit period ends (if applicable)
- **Audit Ageing**: How long the account has been under audit
  - < 6 Months: 🟢 Recent/new
  - 6 Months - 2 Years: 🟠 Established
  - > 2 Years: 🔵 Long-term
- **Agreed Sample %**: Contractually agreed audit coverage percentage

**How to use this:**
- Verify contract compliance
- Track audit duration
- Ensure meeting agreed sample rates

#### C. Performance KPIs
**Five key metrics displayed as cards:**

1. **Total Opportunities**
   - Count of items available for auditing
   - Example: 5,200 auditable items
   - Higher numbers = larger account

2. **Sample Count**
   - Actual number of items audited
   - Example: 2,080 items audited
   - Should match agreed sample %

3. **Audit Sample %**
   - Percentage of items actually audited
   - Formula: (Sample Count / Total Opportunities) × 100
   - Example: 40.0% (2,080 / 5,200 × 100)
   - Compare with "Agreed Sample %" to check compliance

4. **Audit Accuracy**
   - Quality score for this account
   - Example: 98.5% means 98.5% of audits passed
   - Color coded:
     - 🟢 Green (>90%): Excellent
     - 🟠 Orange (75-90%): Good
     - 🔴 Red (<75%): Needs attention

5. **Overall SLA Compliance**
   - Shows "Met" or "Not Met"
   - Based on SLA agreement criteria
   - 🟢 Green = Met, 🔴 Red = Not Met

#### D. SLA Compliance Section
**Monthly Trend Chart:**
- Shows SLA performance month by month
- Three categories per month:
  - ✅ **Met**: Successfully met SLA (Green)
  - ❌ **Not Met**: Failed to meet SLA (Red)
  - ⚪ **Not Reported**: No data reported (Gray)
- **How to read**: 
  - Look for patterns (are we improving or declining?)
  - Identify problem months
  - Check for recurring issues

**Click on "Toggle SLA Trend" button to:**
- Show/hide the monthly breakdown
- See detailed numbers for each month
- Example: Apr: Met=5, Not Met=1, Not Reported=0

#### E. Projects Section
**What you'll see:**
- Total project count (e.g., "5 projects")
- List of projects with:
  - Project Name
  - Status (Active, Closed, On Hold)
  - Start Date
  - End Date (if applicable)
  - Progress indicator

**Project Status Colors:**
- 🟢 **Active**: Currently ongoing
- 🔵 **Closed**: Successfully completed
- 🟠 **On Hold**: Temporarily paused

**How to use this:**
- Track project portfolio
- Monitor active vs completed projects
- Identify stalled projects

#### F. Recruiters Section
**What you'll see:**
- Total recruiter count (e.g., "12 recruiters")
- Top performers with:
  - Recruiter Name
  - Accuracy Score
  - Total Audits
  - Performance badge

**How to use this:**
- Identify top-performing recruiters
- Find recruiters needing coaching
- Share best practices

---

# Account Summary Tab

## Overview
The **Account Summary** tab provides a **comprehensive list view** of all accounts. Think of it as your account directory - perfect for comparing multiple accounts side by side.

## What You'll See

### 1. Summary Statistics (Top Cards)

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Total       │ │ Active      │ │ Under       │ │ Average     │
│ Accounts    │ │ Accounts    │ │ Audit       │ │ Accuracy    │
│             │ │             │ │             │ │             │
│     49      │ │     45      │ │     15      │ │   95.2%     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**Understanding the Cards:**

- **Total Accounts**: All accounts in the system (49)
- **Active Accounts**: Currently operational accounts (45)
- **Under Audit**: Accounts with Audit Status = "YES" (15)
- **Average Accuracy**: Mean accuracy across all accounts (95.2%)

### 2. Accounts Table

A comprehensive table showing all accounts with key information:

```
| Account Name | Region | Status | Audit Status | Accuracy | Sample % | Practice Head | Action |
|--------------|--------|--------|--------------|----------|----------|---------------|--------|
| HPE          | APAC   | Active | YES          | 98.5%    | 40.0%    | John Doe      | [View] |
| TCS          | APAC   | Active | YES          | 95.2%    | 35.0%    | Jane Smith    | [View] |
| Wipro        | APAC   | Active | YES          | 97.1%    | 38.0%    | Bob Johnson   | [View] |
```

**Column Explanations:**

1. **Account Name**: Client/customer name
   - Clickable - leads to detailed view

2. **Region**: Geographical region
   - APAC (Asia-Pacific)
   - EMEA (Europe, Middle East, Africa)
   - Americas (North & South America)

3. **Status**: Operational status
   - 🟢 Active: Currently operational
   - 🔴 Inactive: Not currently active
   - 🟠 On Hold: Temporarily paused

4. **Audit Status**: Whether being audited
   - YES: Currently under audit
   - NO: Not currently being audited

5. **Accuracy**: Quality score
   - Shows accuracy percentage
   - Color coded (Green/Orange/Red)

6. **Sample %**: Audit coverage
   - Percentage of items being audited
   - Compare with agreed sample %

7. **Practice Head**: Responsible manager
   - Who to contact for this account

8. **Action**: Interactive buttons
   - [View]: Opens detailed account information
   - Click to navigate to Journey at Glance for this account

### 3. Sorting and Filtering

**How to Sort:**
- Click on any column header to sort
- Click again to reverse sort order
- Example: Click "Accuracy" to see highest accuracy first

**Available Filters:**
- Region dropdown
- Status dropdown
- Audit Status dropdown
- Search box for account names

### 4. Export Options

**Download Data:**
- Look for "Export" or "Download" button
- Options: CSV, Excel, PDF
- Use case: Create reports, share with stakeholders

---

# Transactional Overview Tab

## Overview
The **Transactional Overview** tab shows **transaction-level detail**. This is where you analyze individual audit transactions and spot patterns.

## Main Features

### 1. Transaction Summary Cards

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Total       │ │ Parameters  │ │ Audit       │ │ Audit       │
│ Params      │ │ Audited     │ │ Accuracy %  │ │ Sample %    │
│             │ │             │ │             │ │             │
│    450      │ │    380      │ │   98.2%     │ │   84.4%     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**What These Mean:**

- **Total Parameters**: All audit parameters defined (450)
- **Parameters Audited**: How many parameters have been checked (380)
- **Audit Accuracy %**: Overall quality across transactions (98.2%)
- **Audit Sample %**: Coverage percentage (84.4%)

### 2. Transaction Details Table

Shows individual transaction records:

```
| Transaction ID | Account | Parameter | Result | Auditor | Date | Status |
|----------------|---------|-----------|--------|---------|------|--------|
| TXN001        | HPE     | Param A   | Pass   | John D  | 1/28 | ✓      |
| TXN002        | TCS     | Param B   | Fail   | Jane S  | 1/28 | ✗      |
| TXN003        | Wipro   | Param C   | Pass   | Bob J   | 1/27 | ✓      |
```

**Understanding Transaction Data:**

- **Transaction ID**: Unique identifier for each audit
- **Account**: Which client/account
- **Parameter**: What was being audited
- **Result**: Pass/Fail/NA
  - ✓ Pass: Met standards
  - ✗ Fail: Did not meet standards
  - ⚪ NA: Not applicable
- **Auditor**: Who performed the audit
- **Date**: When the audit occurred
- **Status**: Overall outcome

### 3. Charts and Visualizations

**Common Charts You'll See:**

#### A. Transaction Volume Over Time
- **Type**: Line chart
- **Shows**: Number of transactions per day/week/month
- **Use for**: Identifying busy periods, capacity planning

#### B. Pass/Fail Distribution
- **Type**: Pie chart
- **Shows**: Percentage of passed vs failed audits
- **Use for**: Overall quality assessment

#### C. Top Parameters by Volume
- **Type**: Bar chart
- **Shows**: Which parameters are audited most frequently
- **Use for**: Understanding audit focus areas

---

# Parameter Performance Tab

## Overview
The **Parameter Performance** tab focuses on **specific audit parameters**. Each parameter represents a specific thing being checked during audits.

## What Are Parameters?

**Example Parameters:**
- Resume Screening Accuracy
- Interview Scheduling Timeliness
- Candidate Communication Quality
- Documentation Completeness
- Compliance Verification

Think of parameters as **checklist items** - each one is a specific aspect of quality being measured.

## What You'll See

### 1. Parameter Statistics (Top Section)

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ AUDIT       │ │ AUDIT       │ │ ERROR %     │
│ ACCURACY %  │ │ SAMPLE %    │ │             │
│   98.2%     │ │   84.4%     │ │    1.8%     │
└─────────────┘ └─────────────┘ └─────────────┘

┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ TOTAL       │ │ CRITICAL    │ │ NON-CRIT    │
│ AUDITS      │ │ PARAMS      │ │ PARAMS      │
│   12,450    │ │     35      │ │    415      │
└─────────────┘ └─────────────┘ └─────────────┘
```

**Understanding These Metrics:**

- **Audit Accuracy %**: Quality across all parameters (98.2%)
- **Audit Sample %**: Coverage rate (84.4%)
- **Error %**: Failure rate (1.8% = 100% - 98.2%)
- **Total Audits**: Number of parameter audits (12,450)
- **Critical Params**: High-importance parameters (35)
  - Failures here have severe impact
- **Non-Critical Params**: Standard parameters (415)
  - Failures here have moderate impact

### 2. Parameter Performance Table

```
| Parameter Name | Audits | Accuracy | Error % | Critical | Status |
|----------------|--------|----------|---------|----------|--------|
| Resume Screen  | 1,250  | 99.2%   | 0.8%    | Yes      | 🟢     |
| Interview Sch  | 980    | 95.5%   | 4.5%    | No       | 🟠     |
| Doc Complete   | 850    | 92.1%   | 7.9%    | Yes      | 🔴     |
```

**Column Details:**

1. **Parameter Name**: What's being audited
2. **Audits**: How many times this was checked
3. **Accuracy**: Pass rate for this parameter
4. **Error %**: Fail rate for this parameter
5. **Critical**: Is this a critical parameter?
6. **Status**: Visual indicator
   - 🟢 Green (>95%): Excellent
   - 🟠 Orange (85-95%): Acceptable
   - 🔴 Red (<85%): Needs attention

### 3. Parameter Trend Chart

**What it shows:**
- How each parameter's accuracy changes over time
- Monthly or weekly trends
- Comparison between parameters

**How to use it:**
- Identify improving parameters (upward trends)
- Spot declining parameters (downward trends)
- Compare relative performance

### 4. Critical vs Non-Critical Comparison

**Understanding Criticality:**

**Critical Parameters:**
- **Impact**: High - failures affect business significantly
- **Examples**: Compliance checks, legal requirements, safety items
- **Target**: 98%+ accuracy required
- **Action**: Immediate correction needed for failures

**Non-Critical Parameters:**
- **Impact**: Moderate - failures are less severe
- **Examples**: Process preferences, style guidelines
- **Target**: 90%+ accuracy acceptable
- **Action**: Continuous improvement focus

---

# Recruiter Insights Tab

## Overview
The **Recruiter Insights** tab provides **individual performance data** for recruiters/auditors. Use this for coaching, recognition, and performance management.

## What You'll See

### 1. Recruiter Summary Cards

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Total       │ │ Active      │ │ Average     │ │ Total       │
│ Recruiters  │ │ Recruiters  │ │ Accuracy    │ │ Audits      │
│             │ │             │ │             │ │             │
│     125     │ │     118     │ │   95.8%     │ │   45,280    │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**What These Mean:**
- **Total Recruiters**: All recruiters in system (125)
- **Active Recruiters**: Currently conducting audits (118)
- **Average Accuracy**: Mean accuracy across all recruiters (95.8%)
- **Total Audits**: Sum of all audits by all recruiters (45,280)

### 2. Recruiter Performance Table

```
| Recruiter Name | Account | Audits | Accuracy | Error % | Status | Trend |
|----------------|---------|--------|----------|---------|--------|-------|
| John Doe       | HPE     | 1,250  | 98.5%   | 1.5%    | 🟢     | ↗     |
| Jane Smith     | TCS     | 1,180  | 96.2%   | 3.8%    | 🟢     | →     |
| Bob Johnson    | Wipro   | 950    | 89.5%   | 10.5%   | 🟠     | ↘     |
```

**Understanding Recruiter Data:**

1. **Recruiter Name**: Individual's name
2. **Account**: Which account they work on
3. **Audits**: Number of audits completed
4. **Accuracy**: Their quality score
5. **Error %**: Their failure rate
6. **Status**: Performance indicator
   - 🟢 Excellent (>95%)
   - 🟠 Good (85-95%)
   - 🔴 Needs Improvement (<85%)
7. **Trend**: Performance direction
   - ↗ Improving
   - → Stable
   - ↘ Declining

### 3. Top Performers Section

```
🏆 Top 10 Recruiters

1. John Doe      - 98.5% accuracy (1,250 audits)
2. Jane Smith    - 96.2% accuracy (1,180 audits)
3. Bob Johnson   - 95.8% accuracy (1,150 audits)
...
```

**Recognition Points:**
- Celebrate these high performers
- Share their best practices
- Use as mentors for others

### 4. Needs Coaching Section

```
⚠️ Needs Coaching

1. Recruiter X   - 82.5% accuracy (850 audits)
2. Recruiter Y   - 79.2% accuracy (720 audits)
3. Recruiter Z   - 76.8% accuracy (680 audits)
```

**Action Items:**
- Schedule one-on-one meetings
- Review failed audits together
- Provide targeted training
- Set improvement goals
- Monitor progress weekly

### 5. Recruiter Detail View

Click on any recruiter to see:
- Full audit history
- Parameter-by-parameter breakdown
- Monthly trend chart
- Comparison with team average
- Specific error patterns

---

# Strategic Overview Tab

## Overview
The **Strategic Overview** tab provides **high-level business metrics** for executive reporting and strategic planning.

## Key Sections

### 1. Business Health Scorecard

```
┌─────────────────────────────────────────┐
│  Business Health Score: 87.5 / 100     │
│                                         │
│  Quality:      95.2%  [████████░] 🟢   │
│  Volume:       85.4%  [███████░░] 🟢   │
│  Compliance:   82.1%  [██████░░░] 🟠   │
│  Efficiency:   89.3%  [████████░] 🟢   │
└─────────────────────────────────────────┘
```

**Health Score Breakdown:**
- **Quality**: Accuracy and error rates
- **Volume**: Audit coverage and throughput
- **Compliance**: SLA and contract adherence
- **Efficiency**: Resource utilization

### 2. Year-over-Year Comparison

```
| Metric          | This Year | Last Year | Change |
|-----------------|-----------|-----------|--------|
| Total Audits    | 45,280    | 38,450    | +17.7% |
| Accuracy        | 95.8%     | 93.2%     | +2.6%  |
| SLA Compliance  | 87.5%     | 82.1%     | +5.4%  |
```

**Use for:**
- Annual reviews
- Board presentations
- Performance reporting
- Goal setting

### 3. Regional Performance

Compare performance across regions:
- APAC: 96.2% accuracy
- EMEA: 95.5% accuracy
- Americas: 94.8% accuracy

### 4. Strategic Initiatives Tracking

Monitor key initiatives:
- Quality improvement programs
- Process optimization projects
- Training programs
- Technology implementations

---

# Understanding Key Metrics

## Account Weightage - The Complete Guide

### What Is Account Weightage?

**Account Weightage** is a **combined performance score** that evaluates accounts based on two factors:
1. **Quality** (Accuracy) - 60% weight
2. **Quantity** (Audit Volume) - 40% weight

**Why both factors?**
- High accuracy alone doesn't mean good performance if volume is low
- High volume alone doesn't matter if quality is poor
- We need accounts that are BOTH accurate AND productive

### The Formula

```
Account Weightage = (Accuracy × 60%) + (Normalized Audit Count × 40%)

Where:
  Accuracy = (Passed Audits / Valid Audits) × 100
  Normalized Audit Count = MIN((Audit Count / 50,000) × 100, 100)
  
Result: Score from 0% to 100% (higher is better)
```

### Step-by-Step Calculation Example

**Example: Calculating HPE's Account Weightage**

**Step 1: Calculate Accuracy**
- Passed Audits: 23,750
- Total Audits: 25,000
- NA Audits: 250
- Valid Audits: 25,000 - 250 = 24,750
- Accuracy = (23,750 / 24,750) × 100 = 95.96%

**Step 2: Normalize Audit Count**
- Audit Count: 25,000
- Max Reference: 50,000
- Normalized = (25,000 / 50,000) × 100 = 50.0

**Step 3: Calculate Weightage**
- Accuracy Contribution: 95.96% × 0.6 = 57.58
- Audit Contribution: 50.0 × 0.4 = 20.0
- **Account Weightage: 57.58 + 20.0 = 77.58%**

### Interpreting Weightage Scores

**Score Ranges:**
- **80-100%**: 🏆 Exceptional - Top performer
- **70-79%**: 🟢 Excellent - Strong performer
- **60-69%**: 🟢 Good - Meeting expectations
- **50-59%**: 🟠 Fair - Room for improvement
- **40-49%**: 🟠 Below Average - Needs attention
- **Below 40%**: 🔴 Critical - Immediate action required

### Comparison Scenarios

**Scenario 1: High Accuracy, Low Volume**
- Account A: 98% accuracy, 5,000 audits
- Weightage: (98 × 0.6) + (10 × 0.4) = 58.8 + 4.0 = **62.8%**
- Assessment: Good quality but low productivity

**Scenario 2: High Volume, Lower Accuracy**
- Account B: 85% accuracy, 30,000 audits
- Weightage: (85 × 0.6) + (60 × 0.4) = 51.0 + 24.0 = **75.0%**
- Assessment: Productive with acceptable quality

**Scenario 3: Balanced Excellence**
- Account C: 95% accuracy, 25,000 audits
- Weightage: (95 × 0.6) + (50 × 0.4) = 57.0 + 20.0 = **77.0%**
- Assessment: Ideal balance of quality and quantity

**Winner: Account C** - Best overall performance

## SLA Compliance - Understanding Service Levels

### What Is SLA?

**SLA** = Service Level Agreement
- A contract between you and your client
- Defines expected service standards
- Specifies penalties for non-compliance
- Measures client satisfaction

### How SLA Is Measured

**Monthly Tracking:**
Each month is evaluated as:
- ✅ **Met**: All commitments fulfilled
- ❌ **Not Met**: One or more commitments missed
- ⚪ **Not Reported**: No data available

**Overall SLA Compliance Formula:**
```
SLA Compliance % = (Months Met / Total Evaluated Months) × 100
```

**Example:**
- 12 months tracked
- 10 months met
- 2 months not met
- SLA Compliance = (10 / 12) × 100 = **83.3%**

### SLA Components

Typical SLA measures include:
1. **Accuracy Targets**: Minimum quality threshold
2. **Response Time**: How quickly you respond
3. **Turnaround Time**: How quickly you complete work
4. **Audit Coverage**: Agreed sample percentage
5. **Reporting Frequency**: How often you report

### SLA Status Meanings

**Met (Green):**
- All targets achieved this month
- Client expectations exceeded
- No penalties
- Relationship healthy

**Not Met (Red):**
- One or more targets missed
- Client may be dissatisfied
- Possible financial penalties
- Action required to prevent recurrence

**Not Reported (Gray):**
- No data submitted
- System gap or process issue
- Needs investigation
- Could count as "Not Met" contractually

---

# Tips & Best Practices

## Daily Monitoring

**Morning Routine (5 minutes):**
1. Open dashboard Home tab
2. Check "Accounts Under Audit" count
3. Review "Account of the Month"
4. Scan "Top Performing Accounts"
5. Check "Needs Attention" for urgent issues

**When to Dig Deeper:**
- Red badges appear (accuracy < 75%)
- SLA "Not Met" status
- Declining trends
- Unusual patterns

## Weekly Reviews

**Monday Check (15 minutes):**
1. Review all tabs
2. Compare week-over-week changes
3. Identify emerging trends
4. Create action items for concerning accounts

**Friday Wrap-up (10 minutes):**
1. Verify action items completed
2. Update stakeholders on improvements
3. Plan next week's priorities

## Using Filters Effectively

**Common Filter Combinations:**

**For Daily Priorities:**
- Audit Status = "YES"
- Status = "Active"
- Sort by: Accuracy (ascending)
- **Result**: Active accounts being audited, worst accuracy first

**For Regional Reviews:**
- Region = "Your Region"
- Status = "Active"
- Sort by: Account Weightage (descending)
- **Result**: Your region's accounts ranked by performance

**For Executive Reports:**
- Status = "Active"
- Sort by: Account Weightage (descending)
- Top 10 results
- **Result**: Best performers for recognition

## Data Export Tips

**When to Export:**
- Monthly reports
- Quarterly reviews
- Executive presentations
- Client meetings

**Best Practices:**
- Include date range in filename
- Add version numbers (v1, v2)
- Store in organized folders
- Create templates for recurring reports

## Interpreting Trends

**Positive Trends (Keep Doing):**
- Accuracy increasing ↗
- Weightage improving ↗
- SLA compliance rising ↗
- Error rates declining ↘

**Negative Trends (Take Action):**
- Accuracy decreasing ↘
- Weightage declining ↘
- SLA compliance falling ↘
- Error rates rising ↗

**Stable Trends (Monitor):**
- Consistent performance →
- May indicate:
  - Reached optimal level
  - Need new improvement strategies
  - Hidden issues maintaining mediocrity

---

# Troubleshooting

## Common Issues & Solutions

### Issue 1: Dashboard Not Loading

**Symptoms:**
- Blank white screen
- Loading spinner forever
- "Unable to load data" message

**Solutions:**
1. **Hard Refresh**: Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear Cache**: 
   - Chrome: Settings → Privacy → Clear browsing data
   - Firefox: Options → Privacy → Clear Data
   - Safari: Develop → Empty Caches
3. **Check Internet**: Ensure stable connection
4. **Try Different Browser**: Switch to Chrome, Firefox, or Edge
5. **Check URL**: Verify you're on the correct dashboard URL

### Issue 2: Data Looks Wrong

**Symptoms:**
- Numbers don't match expected values
- Accounts missing
- Old data showing

**Solutions:**
1. **Refresh Data**: Hard refresh the page (Ctrl+Shift+R)
2. **Check Filters**: Ensure no filters are accidentally applied
3. **Verify Date Range**: Check if viewing correct time period
4. **Contact Support**: If data persistently wrong, report issue

### Issue 3: Can't Find Specific Account

**Symptoms:**
- Account not appearing in lists
- Search returns no results

**Solutions:**
1. **Clear All Filters**: Reset region, status, audit filters
2. **Check Spelling**: Verify account name spelling
3. **Use Partial Search**: Try searching part of the name
4. **Check Account Summary Tab**: Browse complete list
5. **Verify Account Exists**: Confirm with team if account is in system

### Issue 4: Charts Not Displaying

**Symptoms:**
- Broken image icons
- Gray boxes instead of charts
- "No data available" messages

**Solutions:**
1. **Disable Ad Blockers**: May block chart libraries
2. **Enable JavaScript**: Required for interactive features
3. **Update Browser**: Use latest version
4. **Check Firewall**: Ensure dashboard URLs not blocked

### Issue 5: Performance Issues (Slow Loading)

**Symptoms:**
- Pages load slowly
- Lag when switching tabs
- Browser becomes unresponsive

**Solutions:**
1. **Close Other Tabs**: Free up browser memory
2. **Restart Browser**: Fresh start
3. **Clear Cache**: Remove old temporary files
4. **Check Computer Resources**: Close unnecessary programs
5. **Use Desktop**: May perform better than mobile

### Issue 6: Print/Export Not Working

**Symptoms:**
- Export button doesn't respond
- Print preview shows incorrectly
- Downloaded file is empty

**Solutions:**
1. **Allow Pop-ups**: Enable for dashboard site
2. **Check Downloads Folder**: File may have downloaded
3. **Try Different Format**: CSV vs Excel vs PDF
4. **Use Browser Print**: File → Print (Ctrl+P)
5. **Screenshot as Backup**: Use snipping tool

---

# Glossary

## A-C

**Account**
- A client, customer, or business unit being audited
- Example: HPE, TCS, Wipro

**Account Weightage**
- Combined performance score (0-100%)
- Formula: 60% accuracy + 40% normalized audit volume
- Higher = better overall performance

**Accuracy**
- Percentage of audits that passed quality checks
- Formula: (Passed / Valid Audits) × 100
- Target: 90% or higher

**Active Account**
- Account currently operational
- Opposite of Inactive or On Hold

**Audit**
- Quality check or review of work
- Can pass, fail, or be not applicable (NA)

**Audit Ageing**
- How long an account has been under audit
- Categories: < 6 months, 6m-2y, > 2 years

**Audit Frequency**
- How often audits are conducted
- Options: Daily, Weekly, Monthly, Quarterly, Annually

**Audit Sample %**
- Percentage of items being audited
- Formula: (Sample Count / Total Population) × 100

**Audit Status**
- Whether account is currently being audited
- Values: YES or NO

**BE SPOC**
- Business Excellence Single Point of Contact
- Person responsible for coordination

**CAPA**
- Corrective and Preventive Actions
- Steps taken to fix problems and prevent recurrence

**Compliance**
- Meeting contractual or regulatory requirements
- Often measured as percentage

**Critical Parameter**
- High-importance audit item
- Failures have significant business impact

## D-L

**Dashboard**
- Visual interface showing key metrics and data
- This entire application

**Error %**
- Percentage of audits that failed
- Formula: 100% - Accuracy%

**Filter**
- Tool to show only specific data
- Examples: Region filter, Status filter

**Journey at Glance**
- Tab showing detailed account information
- Account-by-account view

**KPI**
- Key Performance Indicator
- Important metric to track

**Met (SLA)**
- Successfully fulfilled service commitments
- Green indicator

## M-Q

**Not Met (SLA)**
- Failed to fulfill service commitments
- Red indicator - requires action

**Not Reported**
- No data available for reporting period
- Gray indicator - needs investigation

**Opportunity**
- Item that can be audited
- Total pool of auditable items

**Parameter**
- Specific aspect being audited
- Example: Resume quality, Interview timeliness

**Population**
- Total number of records/candidates in system
- Denominator for calculating sample %

**Practice Head**
- Manager responsible for practice area
- Contact person for account

**Quality Score**
- Another term for Accuracy
- Measures audit pass rate

## R-Z

**RCA**
- Root Cause Analysis
- Investigation to find underlying problem causes

**Recruiter**
- Person conducting audits or recruitment work
- Individual performer

**Regional Head**
- Senior manager overseeing region
- Higher-level contact

**Sample**
- Subset of population selected for auditing
- Should be representative

**SLA**
- Service Level Agreement
- Contract defining service expectations

**SLA Compliance**
- Meeting SLA commitments
- Formula: (Met / Total) × 100

**Status**
- Operational state
- Values: Active, Inactive, On Hold

**Transaction**
- Individual audit record
- Single audit event

**Trend**
- Pattern over time
- Can be improving (↗), stable (→), or declining (↘)

**Valid Audits**
- Total audits minus NA audits
- Denominator for accuracy calculation

**Weightage**
- See Account Weightage
- Combined performance score

---

# Quick Reference Card

## Most Important Numbers

| Metric | Good | Warning | Critical | Action |
|--------|------|---------|----------|--------|
| **Accuracy** | >95% | 85-95% | <85% | Training needed |
| **Account Weightage** | >70% | 60-70% | <60% | Improvement plan |
| **SLA Compliance** | >90% | 75-90% | <75% | Risk mitigation |
| **Sample %** | 30-50% | 20-30% or 50-70% | <20% or >70% | Adjust coverage |
| **Error %** | <5% | 5-15% | >15% | Root cause analysis |

## Daily Checklist

- [ ] Check Accounts Under Audit count
- [ ] Review Account of the Month
- [ ] Scan Top Performing Accounts
- [ ] Check Needs Attention section
- [ ] Verify no red badges
- [ ] Review any SLA "Not Met" status
- [ ] Check for declining trends

## Contact Information

**For Technical Issues:**
- Dashboard not loading
- Data errors
- Feature requests

**For Data Questions:**
- Clarifying metrics
- Understanding calculations
- Report requests

**For Business Questions:**
- Account performance
- Improvement strategies
- Best practices

---

# Document Information

**Document Version**: 1.0  
**Last Updated**: January 28, 2026  
**Created For**: Business Excellence Quality Dashboard  
**Intended Audience**: All dashboard users  

**Feedback Welcome:**
This manual is a living document. If you have:
- Questions not answered here
- Suggestions for improvement
- Additional topics to cover
- Corrections or clarifications

Please contact your team lead or dashboard administrator.

---

**End of User Manual**

---

## Appendix: Example Scenarios

### Scenario 1: New Manager Starting

**Day 1:**
1. Read Introduction and Getting Started sections
2. Explore Home tab
3. Review one account in detail (Journey at Glance)
4. Ask team about specific accounts

**Week 1:**
1. Review all tabs
2. Understand your team's accounts
3. Compare with previous month's data
4. Set up weekly review routine

**Month 1:**
1. Present insights to team
2. Identify improvement opportunities
3. Create action plans
4. Share best practices

### Scenario 2: Handling a Crisis

**Account accuracy drops to 65%:**

**Step 1: Identify (5 minutes)**
- Note which account (Account Summary tab)
- Check when it started (Transaction Overview)
- Identify affected parameters (Parameter Performance)

**Step 2: Investigate (30 minutes)**
- Review specific failed audits
- Interview recruiters involved
- Check for process changes
- Look for patterns

**Step 3: Act (Same day)**
- Brief team on findings
- Implement immediate corrections
- Increase oversight
- Schedule follow-up audits

**Step 4: Monitor (Daily)**
- Track accuracy improvements
- Verify corrections working
- Update stakeholders
- Document lessons learned

### Scenario 3: Monthly Business Review

**Preparing Executive Report:**

**From Home Tab:**
- Screenshot scrolling cards
- Note Account of the Month
- List top 3 and bottom 3 performers

**From Strategic Overview:**
- Export business health scorecard
- Document year-over-year changes
- Highlight key achievements

**From Journey at Glance:**
- Detailed story of 2-3 key accounts
- Success stories
- Challenge examples with solutions

**Format:**
1. Executive Summary (1 slide)
2. Overall Performance (2 slides)
3. Top Performers & Recognition (1 slide)
4. Areas of Concern & Actions (1 slide)
5. Next Month Priorities (1 slide)

---

**Thank you for using the Business Excellence Quality Dashboard!**
