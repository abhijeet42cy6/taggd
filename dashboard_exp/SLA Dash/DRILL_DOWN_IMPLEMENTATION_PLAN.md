# Project-wise Drill-Down Implementation Plan

## Overview
Add drill-down functionality to Account Analysis view to show detailed performance measures for each project.

## Data Source
- **New Sheet**: `FY 25-26 Metrics Details `
- **Structure**: 484 rows with project-wise performance measures
- **Columns**: Project, Region, Practice Head, Performance Measure, Target, Monthly Scores (Apr-Oct), YTD
- **Special Handling**: 
  - Pfizer: 5 entities (24 total measures)
  - WTW: 3 entities (17 total measures)

## Implementation Steps

### 1. Add Global Variable for Metrics Data
```javascript
// Line ~3310 - Add after fy2526NotReportedData
let metricsDetailsData = [];
```

### 2. Load Metrics Data from Excel
```javascript
// In handleFile function (~line 4209), add after Not Reported sheets:
if (workbook.Sheets['FY 25-26 Metrics Details ']) {
    metricsDetailsData = XLSX.utils.sheet_to_json(workbook.Sheets['FY 25-26 Metrics Details ']);
    console.log('📊 Metrics Details loaded:', metricsDetailsData.length, 'performance measures');
}
```

### 3. Modify Account Table to Add Click Handlers
```javascript
// In renderAccountView function (~line 6648), modify table row:
tableHTML += `<tr onclick="showProjectDrilldown('${data.account}')" style="cursor: pointer;" 
    title="Click to view detailed performance measures">
    <td><strong>${data.account} <i class="bi bi-box-arrow-up-right" style="font-size: 0.8em; color: var(--primary-color);"></i></strong></td>
    ...
</tr>`;
```

### 4. Create Drill-Down Modal/Panel
```javascript
// Add drill-down container HTML after sidebar (line ~2400)
<div id="drilldownPanel" style="display: none; position: fixed; top: 0; left: 0; 
    width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000;">
    <div style="background: var(--card-bg); margin: 50px auto; max-width: 90%; 
        max-height: 90vh; overflow-y: auto; border-radius: 12px; padding: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 id="drilldownTitle"></h2>
            <button onclick="closeDrilldown()" style="font-size: 1.5em;">×</button>
        </div>
        <div id="drilldownContent"></div>
    </div>
</div>
```

### 5. Implement showProjectDrilldown Function
```javascript
function showProjectDrilldown(projectName) {
    console.log('🔍 Opening drill-down for:', projectName);
    
    // For Pfizer - aggregate all Pfizer entities
    let projectData;
    if (projectName === 'Pfizer') {
        projectData = metricsDetailsData.filter(row => 
            row.Project && row.Project.includes('Pfizer')
        );
    }
    // For WTW - aggregate all WTW entities  
    else if (projectName.includes('WTW')) {
        projectData = metricsDetailsData.filter(row =>
            row.Project && row.Project.includes('WTW')
        );
    }
    // For other projects - exact match
    else {
        projectData = metricsDetailsData.filter(row => row.Project === projectName);
    }
    
    if (!projectData || projectData.length === 0) {
        alert('No detailed metrics available for this project.');
        return;
    }
    
    // Build drill-down HTML
    let html = `
        <div class="metrics-summary" style="margin-bottom: 30px;">
            <h3>📊 Performance Measures Overview</h3>
            <p><strong>Total Measures:</strong> ${projectData.length}</p>
            <p><strong>Region:</strong> ${projectData[0].Region}</p>
            <p><strong>Practice Head:</strong> ${projectData[0]['Practice Head']}</p>
        </div>
        
        <div class="metrics-table-container">
            <table style="font-size: 0.9em;">
                <thead>
                    <tr style="position: sticky; top: 0; background: var(--card-bg);">
                        <th style="min-width: 250px;">Performance Measure</th>
                        <th>Target</th>
                        <th>Apr'25</th>
                        <th>May'25</th>
                        <th>Jun'25</th>
                        <th>Jul'25</th>
                        <th>Aug'25</th>
                        <th>Sep'25</th>
                        <th>Oct'25</th>
                        <th style="background: #f0f9ff;">YTD</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Group by entity if Pfizer or WTW
    if (projectName === 'Pfizer' || projectName.includes('WTW')) {
        const entityGroups = {};
        projectData.forEach(row => {
            const entity = row.Project;
            if (!entityGroups[entity]) entityGroups[entity] = [];
            entityGroups[entity].push(row);
        });
        
        Object.keys(entityGroups).forEach(entity => {
            html += `
                <tr style="background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary-color) 100%); color: white;">
                    <td colspan="10" style="font-weight: bold; padding: 12px;">
                        <i class="bi bi-building"></i> ${entity}
                    </td>
                </tr>
            `;
            
            entityGroups[entity].forEach(measure => {
                html += generateMeasureRow(measure);
            });
        });
    } else {
        projectData.forEach(measure => {
            html += generateMeasureRow(measure);
        });
    }
    
    html += '</tbody></table></div>';
    
    document.getElementById('drilldownTitle').innerHTML = 
        `<i class="bi bi-bar-chart-line"></i> ${projectName} - Detailed Performance Metrics`;
    document.getElementById('drilldownContent').innerHTML = html;
    document.getElementById('drilldownPanel').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function generateMeasureRow(measure) {
    const months = ['April', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct'];
    let row = `
        <tr>
            <td style="text-align: left; padding-left: 20px;">
                ${measure['Performance Measure ']}
            </td>
            <td>${measure['Target'] || '-'}</td>
    `;
    
    months.forEach(month => {
        const scoreCol = `${month}25 Score`;
        const statusCol = `${month} MET/NOT_MET`;
        const score = measure[scoreCol] || '-';
        const status = measure[statusCol] || '-';
        
        const bgColor = status === 'Met' ? '#d1fae5' : 
                       status === 'Not Met' ? '#ffe4e6' : 
                       '#f3f4f6';
        const textColor = status === 'Met' ? '#065f46' :
                         status === 'Not Met' ? '#991b1b' :
                         '#6b7280';
        
        row += `
            <td style="background: ${bgColor}; color: ${textColor}; font-weight: 500;">
                ${score}<br>
                <small style="font-size: 0.75em;">${status}</small>
            </td>
        `;
    });
    
    // YTD column
    const ytdScore = measure['YTD Score'] || '-';
    const ytdStatus = measure['YTD MET/NOT_MET'] || '-';
    const ytdBg = ytdStatus === 'Met' ? '#dbeafe' : 
                  ytdStatus === 'Not Met' ? '#fee2e2' : 
                  '#f3f4f6';
    const ytdColor = ytdStatus === 'Met' ? '#1e40af' :
                     ytdStatus === 'Not Met' ? '#991b1b' :
                     '#6b7280';
    
    row += `
            <td style="background: ${ytdBg}; color: ${ytdColor}; font-weight: bold;">
                ${ytdScore}<br>
                <small style="font-size: 0.75em;">${ytdStatus}</small>
            </td>
        </tr>
    `;
    
    return row;
}

function closeDrilldown() {
    document.getElementById('drilldownPanel').style.display = 'none';
    document.body.style.overflow = 'auto';
}
```

### 6. Update CSS for Drill-Down
```css
/* Add to existing styles */
.metrics-table-container {
    max-height: 60vh;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 8px;
}

.metrics-table-container table {
    margin: 0;
}

.metrics-table-container thead th {
    position: sticky;
    top: 0;
    background: var(--card-bg);
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

## Special Handling for Pfizer & WTW

### Pfizer Entities (in Metrics Details)
- Pfizer (FLM/RBM) - 6 measures
- Pfizer (FS & FLM) - 2 measures
- Pfizer (FS) - 7 measures
- Pfizer (FS/FLM/RBM) - 7 measures
- Pfizer (FS & FLM) (Chennai) - 2 measures
**Total: 24 performance measures**

### WTW Entities (in Metrics Details)
- WTW (Ops) - 5 measures
- WTW (Tech) - 5 measures
- WTW (Ops & Tech) - 7 measures
**Total: 17 performance measures**

## Testing Checklist
- [ ] Load Excel file with new sheet
- [ ] Click on regular project (e.g., BITS) - should show 5 measures
- [ ] Click on Pfizer - should show ALL 24 measures grouped by entity
- [ ] Click on WTW - should show ALL 17 measures grouped by entity
- [ ] Verify month-wise scores display correctly
- [ ] Verify Met/Not Met color coding
- [ ] Verify YTD column highlights
- [ ] Test close button
- [ ] Test responsive layout
- [ ] Test with filters applied

## Files Modified
1. `index.html` - Main implementation
2. `SLA_Monthly_Status_Summary_FINAL_NEW.xlsx` - New data file (testing only)

## Deployment Notes
- **DO NOT COMMIT** until confirmed by user
- Test locally first
- User confirmation required before GitHub push
