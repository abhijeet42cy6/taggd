# SLA Calculation Methodology

## Overview
This document explains how SLA metrics are calculated in the TAGGD Dashboard, including Account Health Status and SLA Bifurcation Analysis.

## Data Source
- **Excel Sheet**: `FY 25-26 Metrics Details` in `SLA_Monthly_Status_Summary_FINAL.xlsx`
- **Total Records**: 506 performance measures
- **Reference Month**: January 2026 (`Jan MET/NOT_MET` column)

---

## 1. Account Health Status Calculation

### Purpose
Categorize projects/accounts based on their SLA compliance performance into Red/Amber/Green health zones.

### Data Rules
- **Include**: Only "Met" and "Not Met" status measures
- **Exclude**: "Not Reported", "NA", "N/A", and blank entries

### Calculation Method
For each project/account:

```
1. Count Met measures: WHERE Jan MET/NOT_MET = 'Met'
2. Count Not Met measures: WHERE Jan MET/NOT_MET = 'Not Met'
3. Total = Met + Not Met (excludes Not Reported/NA)
4. Met% = (Met / Total) × 100

Health Category:
- RED: Met% < 50% (Critical attention required)
- AMBER: 50% ≤ Met% < 75% (Moderate performance)
- GREEN: Met% ≥ 75% (Excellent performance)
```

### Example: Atomberg Technologies
```
Source Data (FY 25-26 Metrics Details sheet):
- Total measures: 41
- Met: 20
- Not Met: 21
- Not Reported: 0
- Calculation: 20 / (20 + 21) × 100 = 48.8%
- Category: RED (< 50%)
```

### Current Results (January 2026)
- **RED (6 accounts)**:
  - Atomberg Technologies: 48.8% (20/41)
  - Maruti Suzuki: 42.9% (6/14)
  - Subros: 42.9% (6/14)
  - Mahindra & Mahindra: 41.7% (5/12)
  - Birla Paints: 37.5% (3/8)
  - TATA Electronics: 12.5% (1/8)

- **AMBER (9 accounts)**:
  - SBI Card: 71.4% (10/14)
  - Siemens - Energy: 63.6% (7/11)
  - ISUZU (UD Trucks): 62.5% (5/8)
  - DP World: 57.1% (4/7)
  - Jindal: 57.1% (4/7)
  - Siemens - Advanta: 54.5% (6/11)
  - Ambuja Cement: 50.0% (4/8)
  - Leap India: 50.0% (3/6)
  - Pfizer (Chennai): 50.0% (3/6)

- **GREEN (10 accounts)**:
  - BITS: 100.0% (4/4)
  - Siemens - GBS: 90.9% (10/11)
  - Honeywell: 87.5% (7/8)
  - Wipro: 85.7% (6/7)
  - Sterling tools: 83.3% (5/6)
  - TATA Consumer: 81.8% (9/11)
  - HPE: 80.0% (4/5)
  - SKF Auto: 78.6% (11/14)
  - SKF Industrial: 78.6% (11/14)
  - Pernod Ricard: 75.0% (9/12)

---

## 2. SLA Bifurcation Analysis

### Purpose
Analyze SLA performance across different categories and penalty types.

### Four Dimensions

#### A. Contractual SLA (Category A)
- **Definition**: Client commitments and contractual obligations
- **Filter**: `Category = 'Category (A)'`
- **Calculation**: 
  ```
  Met = COUNT WHERE Category = 'Category (A)' AND Jan MET/NOT_MET = 'Met'
  Not Met = COUNT WHERE Category = 'Category (A)' AND Jan MET/NOT_MET = 'Not Met'
  Total = Met + Not Met (excludes Not Reported)
  Met% = (Met / Total) × 100
  ```
- **Result (Jan 2026)**: **51.2%** (62 Met / 121 Total)
  - Met: 62
  - Not Met: 59
  - Not Reported: 25

#### B. Internal SLA (Category B)
- **Definition**: Internal standards and operational targets
- **Filter**: `Category = 'Category (B)'`
- **Calculation**: Same as Contractual
- **Result (Jan 2026)**: **73.3%** (88 Met / 120 Total)
  - Met: 88
  - Not Met: 32
  - Not Reported: 88

#### C. Penalty SLA
- **Definition**: Measures with financial impact/penalties
- **Filter**: `Penalty = 'Yes'`
- **Calculation**: Same as above
- **Result (Jan 2026)**: **76.3%** (29 Met / 38 Total)
  - Met: 29
  - Not Met: 9
  - Not Reported: 14

#### D. Non-Penalty SLA
- **Definition**: Measures without financial penalties
- **Filter**: `Penalty = 'No'`
- **Calculation**: Same as above
- **Result (Jan 2026)**: **59.6%** (121 Met / 203 Total)
  - Met: 121
  - Not Met: 82
  - Not Reported: 99

### Important Notes
1. **Category ≠ Penalty**: The relationship is not one-to-one
   - Internal SLAs (Category B) CAN have penalties (72 instances in current data)
   - Contractual SLAs (Category A) CAN be non-penalty (188 instances in current data)
   - This is contract-specific and depends on client agreements

2. **Not Reported Handling**: 
   - Not Reported measures are excluded from Met% calculations
   - They are counted and displayed separately for transparency
   - Example: If 30 Met, 20 Not Met, 50 Not Reported → Met% = 30/(30+20) = 60%

---

## 3. Overall Metrics (January 2026)

### Total Measures: 506
- **Met**: 150 (29.6%)
- **Not Met**: 91 (18.0%)
- **Not Reported**: 113 (22.3%)
- **NA/Blank**: 152 (30.0%)

### Reported-Only Met%: 62.2%
- Calculation: 150 / (150 + 91) × 100 = 62.2%
- This excludes Not Reported and NA values

---

## 4. Display Locations

### Monthly Performance View
✅ **Account Health Status tiles** are displayed
✅ **SLA Bifurcation Analysis tiles** are displayed

These tiles provide an overview of all projects' performance for the current fiscal year (FY 25-26).

### Project Drill-Down Modal
❌ **Account Health Status tiles** are NOT displayed
❌ **SLA Bifurcation Analysis tiles** are NOT displayed

The drill-down shows only:
- Total measures count
- Region and Practice Head
- Detailed monthly performance table with all measures

---

## 5. Technical Implementation

### Functions
1. `generateAccountHealthTiles()` - Creates Account Health Status tiles (lines 7470-7623)
2. `generateKPIBifurcationTiles()` - Creates SLA Bifurcation tiles (lines 7626-7751)
3. `renderMonthlyView()` - Renders Monthly Performance view with tiles (line 7754)
4. `showProjectDrilldown()` - Opens project drill-down WITHOUT tiles (line 11710)

### Terminology
- **User-facing**: "SLA" (Service Level Agreement)
- **Internal code**: `generateKPIBifurcationTiles()` function name retained for backward compatibility
- **Display text**: All user-facing text says "SLA Bifurcation Analysis", "Contractual SLA", "Internal SLA", etc.

---

## Version History
- **v5.3.0** (2026-02-28): Updated to exclude "Not Reported" from calculations, clarified Category/Penalty relationship
- **v5.2.0**: Added SLA Bifurcation Analysis tiles
- **v5.1.0**: Added Account Health Status feature

---

## Support
For questions about these calculations, contact the TAGGD Dashboard development team.
