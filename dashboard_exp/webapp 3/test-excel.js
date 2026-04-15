const XLSX = require('xlsx');
const fs = require('fs');

console.log('📁 Reading Base File.xlsx...');
const workbook = XLSX.readFile('/home/user/uploaded_files/Base File.xlsx');

console.log('\n📊 Sheet Names in File:');
workbook.SheetNames.forEach((name, index) => {
    console.log(`  ${index + 1}. "${name}"`);
});

console.log('\n📊 Checking critical sheets:');

// Check Account_Summary
const accountSheet = workbook.Sheets['Account_Summary'];
if (accountSheet) {
    const data = XLSX.utils.sheet_to_json(accountSheet);
    console.log(`✅ Account_Summary: ${data.length} rows`);
    if (data.length > 0) {
        console.log('   Columns:', Object.keys(data[0]).join(', '));
    }
} else {
    console.log('❌ Account_Summary sheet NOT FOUND');
}

// Check Parameter_Audit_Count
const paramSheet = workbook.Sheets['Parameter_Audit_Count'];
if (paramSheet) {
    const data = XLSX.utils.sheet_to_json(paramSheet);
    console.log(`✅ Parameter_Audit_Count: ${data.length} rows`);
    if (data.length > 0) {
        console.log('   Columns:', Object.keys(data[0]).join(', '));
    }
} else {
    console.log('❌ Parameter_Audit_Count sheet NOT FOUND');
}

console.log('\n✅ Excel file structure verified!');
