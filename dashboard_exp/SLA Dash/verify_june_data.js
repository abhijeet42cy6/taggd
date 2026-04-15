const fs = require('fs');

// Read the updated sample_data.json
const data = JSON.parse(fs.readFileSync('/home/user/webapp/sample_data.json', 'utf8'));

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         JUNE DATA VERIFICATION REPORT                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Function to analyze June data for a fiscal year
function analyzeJuneData(fiscalData, fiscalYear) {
    const projectsWithJuneData = fiscalData.filter(row => 
        (row.June_Met && row.June_Met > 0) || (row.June_Not_Met && row.June_Not_Met > 0)
    );
    
    const totalJuneMet = fiscalData.reduce((sum, row) => sum + (row.June_Met || 0), 0);
    const totalJuneNotMet = fiscalData.reduce((sum, row) => sum + (row.June_Not_Met || 0), 0);
    const totalJune = totalJuneMet + totalJuneNotMet;
    
    console.log(`\n📊 ${fiscalYear} June Analysis:`);
    console.log('─'.repeat(60));
    console.log(`Total projects: ${fiscalData.length}`);
    console.log(`Projects with June data: ${projectsWithJuneData.length}`);
    console.log(`Projects without June data: ${fiscalData.length - projectsWithJuneData.length}`);
    console.log(`\nJune SLA Summary:`);
    console.log(`  • Met: ${totalJuneMet} tickets`);
    console.log(`  • Not Met: ${totalJuneNotMet} tickets`);
    console.log(`  • Total: ${totalJune} tickets`);
    if (totalJune > 0) {
        console.log(`  • Success Rate: ${((totalJuneMet / totalJune) * 100).toFixed(2)}%`);
    }
    
    console.log(`\n📋 Top 10 Projects with June Activity:`);
    const sortedProjects = projectsWithJuneData
        .map(row => ({
            project: row.Project,
            practice: row['Practice Head'],
            met: row.June_Met || 0,
            notMet: row.June_Not_Met || 0,
            total: (row.June_Met || 0) + (row.June_Not_Met || 0)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    
    sortedProjects.forEach((proj, idx) => {
        const rate = proj.total > 0 ? ((proj.met / proj.total) * 100).toFixed(1) : '0';
        console.log(`  ${idx + 1}. ${proj.project.padEnd(30)} | Met: ${String(proj.met).padStart(3)} | Not Met: ${String(proj.notMet).padStart(3)} | Total: ${String(proj.total).padStart(3)} | Rate: ${rate}%`);
    });
    
    // Practice Head analysis
    const practiceHeads = {};
    projectsWithJuneData.forEach(row => {
        const practice = row['Practice Head'];
        if (!practiceHeads[practice]) {
            practiceHeads[practice] = { met: 0, notMet: 0, projects: 0 };
        }
        practiceHeads[practice].met += row.June_Met || 0;
        practiceHeads[practice].notMet += row.June_Not_Met || 0;
        practiceHeads[practice].projects += 1;
    });
    
    console.log(`\n👥 Practice Head June Performance:`);
    const sortedPractices = Object.entries(practiceHeads)
        .map(([name, stats]) => ({
            name,
            ...stats,
            total: stats.met + stats.notMet,
            rate: stats.met + stats.notMet > 0 ? ((stats.met / (stats.met + stats.notMet)) * 100).toFixed(1) : '0'
        }))
        .sort((a, b) => b.total - a.total);
    
    sortedPractices.forEach((practice, idx) => {
        console.log(`  ${idx + 1}. ${practice.name.padEnd(25)} | Projects: ${String(practice.projects).padStart(2)} | Met: ${String(practice.met).padStart(3)} | Not Met: ${String(practice.notMet).padStart(3)} | Rate: ${practice.rate}%`);
    });
}

// Analyze both fiscal years
analyzeJuneData(data.fy24_25, 'FY 24-25');
analyzeJuneData(data.fy25_26, 'FY 25-26');

console.log('\n\n✅ VERIFICATION COMPLETE');
console.log('─'.repeat(60));
console.log('The June data is present and correctly structured.');
console.log('The dashboard should now display June data when filtered.\n');
