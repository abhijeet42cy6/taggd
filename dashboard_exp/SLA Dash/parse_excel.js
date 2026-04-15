const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('/home/user/uploaded_files/SLA_Monthly_Status_Summary_FINAL.xlsx');

console.log('Sheet names:', workbook.SheetNames);

// Parse each sheet
workbook.SheetNames.forEach(sheetName => {
    console.log('\n========================================');
    console.log(`Sheet: ${sheetName}`);
    console.log('========================================\n');
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    console.log(`Total rows: ${data.length}`);
    
    if (data.length > 0) {
        console.log('\nColumn names:');
        console.log(Object.keys(data[0]));
        
        console.log('\nFirst 3 rows:');
        console.log(JSON.stringify(data.slice(0, 3), null, 2));
        
        // Check for June-related columns
        const columns = Object.keys(data[0]);
        const juneColumns = columns.filter(col => col.toLowerCase().includes('june') || col.toLowerCase().includes('jun'));
        
        if (juneColumns.length > 0) {
            console.log('\nJune-related columns found:');
            console.log(juneColumns);
            
            console.log('\nSample June data (first 3 rows):');
            data.slice(0, 3).forEach((row, idx) => {
                console.log(`\nRow ${idx + 1}:`);
                juneColumns.forEach(col => {
                    console.log(`  ${col}: ${row[col]}`);
                });
            });
        } else {
            console.log('\n⚠️ No June columns found!');
        }
    }
});
