// ==========================================
// GUIDED TOUR SYSTEM - Exact Template Implementation
// ==========================================

// Tour configuration for all tabs
window.tourGuides = {
  'home': [
    { 
      selector: '.upload-btn', 
      title: 'Upload Excel File', 
      desc: 'Click here to upload your Base File.xlsx. The dashboard will automatically load all tabs with your data.', 
      position: 'bottom' 
    },
    { 
      selector: '#insightCards', 
      title: 'Insight Cards Carousel', 
      desc: 'Quick overview cards showing key insights from your data. Scroll through to see different metrics.', 
      position: 'top' 
    },
    { 
      selector: '.nav-sidebar', 
      title: 'Navigation Menu', 
      desc: 'Use the left sidebar to navigate between different dashboard views and analysis tabs.', 
      position: 'right' 
    }
  ],
  
  'journey-at-glance': [
    { 
      selector: '#journeySearchInput', 
      title: 'Search Accounts', 
      desc: 'Type to search and filter accounts by name in real-time.', 
      position: 'bottom' 
    },
    { 
      selector: '#journeyRegionFilter', 
      title: 'Region Filter', 
      desc: 'Filter accounts by geographical region (North, South, East, West, Central).', 
      position: 'bottom' 
    },
    { 
      selector: '#journeyStatusFilter', 
      title: 'Status Filter', 
      desc: 'Filter accounts by their current status (Active/Inactive).', 
      position: 'bottom' 
    },
    { 
      selector: '#journeyAuditFilter', 
      title: 'Audit Status Filter', 
      desc: 'Filter accounts by audit status (Yes/No/On Hold).', 
      position: 'bottom' 
    },
    { 
      selector: '#journeyHealthFilter', 
      title: 'Accuracy Filter', 
      desc: 'Filter accounts by accuracy performance: Excellent (95+%), Good (85-94%), Fair (75-84%), or Poor (<75%).', 
      position: 'bottom' 
    },
    { 
      selector: '#journeyStatsGrid', 
      title: 'Journey Summary Statistics - 5 KPI Cards', 
      desc: '<div style="line-height: 1.7;"><strong style="color: #1E3A8A; font-size: 1.05em;">📊 Total Population:</strong><br><span style="color: #111827;">Total no of records available to conduct the audits.</span><br><br><strong style="color: #1E3A8A; font-size: 1.05em;">✓ Total Opportunity:</strong><br><span style="color: #111827;">The selected samples to perform the audits.</span><br><br><strong style="color: #16A34A; font-size: 1.05em;">✓ Accuracy %:</strong><br><span style="color: #111827;">(Sum of Opportunity Pass ÷ Total Opportunity) × 100</span><br><em style="color: #6B7280; font-size: 0.92em;">(excluding the non-applicable cases)</em><br><br><strong style="color: #F59E0B; font-size: 1.05em;">📈 Sample %:</strong><br><span style="color: #111827;">(Total Opportunity ÷ Total Population) × 100</span><br><br><strong style="color: #4F46E5; font-size: 1.05em;">🎯 SLA Compliance %:</strong><br><span style="color: #111827;">The percentage of hiring activities completed within agreed Service Level Agreements, such as turnaround time, shortlist delivery, interview scheduling, or offer closure.</span></div>', 
      position: 'top' 
    },
    { 
      selector: '#journeyAccountsGrid', 
      title: 'Account Cards', 
      desc: 'Each card shows comprehensive account details including KPIs, audit information, projects, and RCA/CAPA. Click accuracy circles to view monthly trends.', 
      position: 'top' 
    }
  ],
  
  'account-summary': [
    { 
      selector: '#accountFilters', 
      title: 'Quick Filters', 
      desc: 'Use these filter dropdowns to quickly narrow down accounts by Practice Head, Region, Audit Status, and other criteria. Select multiple options for combined filtering.', 
      position: 'bottom' 
    },
    { 
      selector: '#activeAccountCount', 
      title: 'Active Account Count', 
      desc: 'Total number of accounts currently displayed after applying filters. Click to show all accounts.', 
      position: 'left' 
    },
    { 
      selector: '#beSPOCAudit', 
      title: 'BE SPOC - Audit Distribution', 
      desc: 'View top BE SPOCs for Audit. Click any SPOC name to instantly filter the account table below.', 
      position: 'top' 
    },
    { 
      selector: '#regionChartContainer', 
      title: 'Regional Distribution Chart', 
      desc: 'Visual chart showing account distribution across India regions with color-coded indicators.', 
      position: 'top' 
    },
    { 
      selector: '#accountTable', 
      title: 'Account Details Table', 
      desc: 'Comprehensive table showing all account information. Includes search, sorting, and filtering capabilities. Each row is clickable for detailed view.', 
      position: 'top' 
    }
  ],
  
  'transactional': [
    { 
      selector: '#transactionalFilters', 
      title: 'Drill-Down Filters', 
      desc: 'Six powerful filters to drill down into your transactional data: Account, Region, Practice Head, Stage, Critical/Non-Critical, and Month. Select multiple options for combined filtering.', 
      position: 'bottom' 
    },
    { 
      selector: '#overallAccuracy', 
      title: 'Overall Accuracy', 
      desc: 'Your overall accuracy percentage across all filtered transactions. Green indicates excellent performance (95%+), red indicates needs attention (<95%).', 
      position: 'bottom' 
    },
    { 
      selector: '#overallSample', 
      title: 'Sample Percentage', 
      desc: 'Percentage of total population that was sampled for audit. Higher percentages indicate more comprehensive coverage.', 
      position: 'bottom' 
    },
    { 
      selector: '#regionBreakdown', 
      title: 'Region-wise Analysis', 
      desc: 'See accuracy, sample %, and error % broken down by geographical region to identify regional performance patterns.', 
      position: 'right' 
    },
    { 
      selector: '#criticalBreakdown', 
      title: 'Criticality Analysis', 
      desc: 'Compare performance between Critical and Non-Critical parameters. Critical parameters have higher impact on quality.', 
      position: 'right' 
    },
    { 
      selector: '#stageBreakdown', 
      title: 'Stage-wise Performance', 
      desc: 'Track performance across different process stages to identify where errors occur most frequently.', 
      position: 'right' 
    }
  ],
  
  'audit-summary': [
    { 
      selector: '#parameterFilters', 
      title: 'Parameter Filters', 
      desc: 'Filter your parameter audit data by Account, Month, Stage, and Critical/Non-Critical classification.', 
      position: 'bottom' 
    },
    { 
      selector: '#monthWiseChart', 
      title: 'Monthly Trend Chart', 
      desc: 'View trends over time with interactive charts showing accuracy and other key metrics month by month.', 
      position: 'top' 
    },
    { 
      selector: '#parameterTableContainer', 
      title: 'Parameter Performance Table', 
      desc: 'Detailed table showing each parameter\'s performance including Accuracy %, Sample %, Error %, and total audits. Sort by any column to identify top and bottom performers.', 
      position: 'top' 
    }
  ],
  
  'recruiter': [
    { 
      selector: '#recruiterFilters', 
      title: 'Recruiter Filters', 
      desc: 'Filter recruiter performance by Account, Month, and Region to analyze individual and team performance.', 
      position: 'bottom' 
    },
    { 
      selector: '#recruiterTableContainer', 
      title: 'Recruiter Performance Table', 
      desc: 'Main table showing each recruiter\'s overall accuracy, sample count, and audit records. Click any recruiter to see their parameter-wise performance below.', 
      position: 'top' 
    },
    { 
      selector: '#recruiterParameterTableContainer', 
      title: 'Recruiter Parameter Details', 
      desc: 'After selecting a recruiter above, this table shows their detailed performance for each audit parameter. Identify top performers and those needing additional support.', 
      position: 'top' 
    }
  ],
  
  'strategic': [
    { 
      selector: '#strategic', 
      title: 'Strategic Overview', 
      desc: 'High-level executive dashboard showing overall business excellence metrics and trends. Upload data to view comprehensive strategic insights.', 
      position: 'top' 
    }
  ],
  
  'projects': [
    { 
      selector: '#projectFilters', 
      title: 'Project Filters', 
      desc: 'Filter projects by Account, Status (Active/Closed), and Project Type to focus on specific initiatives.', 
      position: 'bottom' 
    },
    { 
      selector: '#projects', 
      title: 'Project Overview', 
      desc: 'View all projects with details including opportunity statement, type, status, and related account. Click for full details.', 
      position: 'top' 
    }
  ],
  
  'rca-capa': [
    { 
      selector: '#rcaCapaFilters', 
      title: 'RCA & CAPA Filters', 
      desc: 'Four smart filters: Practice Head, Financial Year, Region, and Status. The system intelligently detects correct columns even if your Excel file uses different naming conventions.', 
      position: 'bottom' 
    },
    { 
      selector: '#rcaKPICards', 
      title: 'RCA & CAPA KPIs', 
      desc: 'See breakdown by Error Type (People/Process/System/Technology), Impact Level (Compliance/Customer/Productivity/Quality), and Status (Open/Closed/In Progress).', 
      position: 'top' 
    },
    { 
      selector: '#rcaRegionChart', 
      title: 'Region-wise Bar Chart', 
      desc: 'Colorful bar chart showing RCA & CAPA count by region to identify geographical patterns in quality issues.', 
      position: 'top' 
    },
    { 
      selector: '#rcaAccountList', 
      title: 'Account Issue List', 
      desc: 'Collapsible list of accounts with problem statement preview. Click any account to expand and see full details including RCA, CAPA, owner, and due date.', 
      position: 'top' 
    }
  ],
  
  'csat': [
    { 
      selector: '#csatTable', 
      title: 'CSAT Data Table', 
      desc: 'Customer satisfaction data showing feedback from clients. Filter by Account, Month, and Rating to analyze feedback patterns and track improvement.', 
      position: 'top' 
    }
  ]
};

// Current tour state
window.currentTour = {
  tabId: null,
  step: 0,
  active: false
};

// Start guided tour for current tab
window.startGuidedTour = function() {
  // Determine current active tab
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) {
    alert('Please navigate to a tab first before starting the tour.');
    return;
  }
  
  const tabId = activeTab.id;
  const tourSteps = window.tourGuides[tabId];
  
  if (!tourSteps || tourSteps.length === 0) {
    alert('No tour available for this tab yet. Tours are available for: Home, Journey at Glance, Account Summary, Transactional, Parameter Performance, Recruiter, Strategic, Projects, RCA & CAPA, and CSAT tabs.');
    return;
  }
  
  // Initialize tour
  window.currentTour = {
    tabId: tabId,
    step: 0,
    active: true
  };
  
  window.showTourStep();
};

// Show current tour step
window.showTourStep = function() {
  const tour = window.currentTour;
  if (!tour.active) return;
  
  const tourSteps = window.tourGuides[tour.tabId];
  if (!tourSteps || tour.step >= tourSteps.length) {
    window.endTour();
    return;
  }
  
  const step = tourSteps[tour.step];
  const element = document.querySelector(step.selector);
  
  // Remove previous highlights
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  
  // Create tooltip
  const existingTooltip = document.getElementById('tourTooltip');
  if (existingTooltip) existingTooltip.remove();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'tourTooltip';
  tooltip.className = 'tour-tooltip';
  tooltip.innerHTML = `
    <div class="tour-tooltip-header">
      <div class="tour-tooltip-title">
        <i class="fas fa-lightbulb" style="color: #F59E0B; margin-right: 8px;"></i>
        ${step.title}
      </div>
      <button class="tour-tooltip-close" onclick="window.endTour()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="tour-tooltip-body">
      ${step.desc}
    </div>
    <div class="tour-tooltip-footer">
      <div class="tour-tooltip-progress">Step ${tour.step + 1} of ${tourSteps.length}</div>
      <div class="tour-tooltip-actions">
        ${tour.step > 0 ? '<button class="tour-btn tour-btn-secondary" onclick="window.previousTourStep()"><i class="fas fa-arrow-left"></i> Previous</button>' : ''}
        <button class="tour-btn tour-btn-secondary" onclick="window.endTour()">Skip Tour</button>
        ${tour.step < tourSteps.length - 1 ? '<button class="tour-btn tour-btn-primary" onclick="window.nextTourStep()">Next <i class="fas fa-arrow-right"></i></button>' : '<button class="tour-btn tour-btn-primary" onclick="window.endTour()"><i class="fas fa-check"></i> Finish</button>'}
      </div>
    </div>
  `;
  
  document.body.appendChild(tooltip);
  
  // Highlight element if it exists
  if (element) {
    element.classList.add('tour-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  
  // ALWAYS position tooltip in center of screen
  tooltip.style.top = '50%';
  tooltip.style.left = '50%';
  tooltip.style.transform = 'translate(-50%, -50%)';
};

// Navigation functions
window.nextTourStep = function() {
  window.currentTour.step++;
  window.showTourStep();
};

window.previousTourStep = function() {
  if (window.currentTour.step > 0) {
    window.currentTour.step--;
    window.showTourStep();
  }
};

window.endTour = function() {
  window.currentTour.active = false;
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  const tooltip = document.getElementById('tourTooltip');
  if (tooltip) tooltip.remove();
};

// Handle escape key to close tour
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && window.currentTour.active) {
    window.endTour();
  }
});
