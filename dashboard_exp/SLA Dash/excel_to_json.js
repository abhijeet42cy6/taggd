const XLSX = require('xlsx');
const fs = require('fs');

// Read the Excel file
const workbook = XLSX.readFile('/home/user/uploaded_files/SLA_Monthly_Status_Summary_FINAL.xlsx');

// Parse FY 24-25 Summary
const fy2425Sheet = workbook.Sheets['FY 24-25 Summary'];
const fy2425Data = XLSX.utils.sheet_to_json(fy2425Sheet, { defval: null });

// Parse FY 25-26 Summary
const fy2526Sheet = workbook.Sheets['FY 25-26 Summary'];
const fy2526Data = XLSX.utils.sheet_to_json(fy2526Sheet, { defval: null });

// Create the output structure
const output = {
  fy24_25: fy2425Data,
  fy25_26: fy2526Data
};

// Write to sample_data.json
fs.writeFileSync('/home/user/webapp/sample_data.json', JSON.stringify(output, null, 2));

console.log('✅ Data conversion complete!');
console.log(`FY 24-25: ${fy2425Data.length} rows`);
console.log(`FY 25-26: ${fy2526Data.length} rows`);

// Verify June data exists
const fy2425JuneCount = fy2425Data.filter(row => row.June_Met > 0 || row.June_Not_Met > 0).length;
const fy2526JuneCount = fy2526Data.filter(row => row.June_Met > 0 || row.June_Not_Met > 0).length;

console.log(`\nJune data verification:`);
console.log(`FY 24-25: ${fy2425JuneCount} projects with June data`);
console.log(`FY 25-26: ${fy2526JuneCount} projects with June data`);

// Show some sample June data
console.log('\nSample FY 24-25 June data:');
fy2425Data.slice(0, 5).forEach(row => {
  console.log(`  ${row.Project}: June_Met=${row.June_Met}, June_Not_Met=${row.June_Not_Met}`);
});

console.log('\nSample FY 25-26 June data:');
fy2526Data.slice(0, 5).forEach(row => {
  console.log(`  ${row.Project}: June_Met=${row.June_Met}, June_Not_Met=${row.June_Not_Met}`);
});
