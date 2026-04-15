# 🔧 FILE UPLOAD TROUBLESHOOTING GUIDE

## ✅ Enhanced Upload Features

**Date**: 2025-12-24  
**Status**: ✅ **ENHANCED** - Comprehensive logging and drag-and-drop support

---

## 🆕 New Features Added

### **1. Comprehensive Console Logging** 🐛
Now you can see exactly what's happening during upload:
```
🔄 File upload started...
📁 File selected: Base File.xlsx Size: 1.67MB
📊 Starting to read file...
📖 File read complete, parsing...
📦 File data loaded: 1752130 bytes
📊 Workbook parsed successfully
📊 Available sheets: [list]
✅ All data loaded successfully!
```

### **2. Drag-and-Drop Support** 📂
- Can now **drag files** directly onto upload zone
- Visual feedback: Orange highlight on drag over
- Automatic file validation

### **3. Better Error Messages** ⚠️
- File type validation (must be .xlsx or .xls)
- File size display
- Detailed error messages with stack traces
- Helpful troubleshooting suggestions

### **4. Progress Bar Reset** 🔄
- Progress bar properly hides on error
- File input resets after upload
- Clean state for retry

---

## 🧪 How to Debug Upload Issues

### **Step 1: Open Browser Console** (F12)

1. Click **F12** (Windows/Linux) or **Cmd+Option+I** (Mac)
2. Go to **Console** tab
3. Keep it open while uploading

### **Step 2: Upload Your File**

**Method 1: Click to Upload**
- Click "Upload Excel" button
- Click upload zone
- Select "Base File.xlsx"
- Watch console logs

**Method 2: Drag-and-Drop** (NEW!)
- Drag "Base File.xlsx" onto upload zone
- Drop file
- Watch console logs

### **Step 3: Check Console Logs**

**Successful Upload Logs:**
```
🔄 File upload started...
📁 File selected: Base File.xlsx Size: 1.67MB
📊 Starting to read file...
📖 File read complete, parsing...
📦 File data loaded: 1752130 bytes
📊 Workbook parsed successfully
📊 Available sheets: ["Parameter_Audit_Count", "Recruiter_Audit_Count", "Account_Summary", "RCA_CAPA", "Projects", "CSAT"]
✅ Parameter_Audit_Count rows: 1234
✅ Recruiter_Audit_Count rows: 789
✅ Account_Summary rows: 56
📄 First Account_Summary row: {Account: "XYZ Corp", ...}
✅ RCA_CAPA rows: 45
✅ Projects rows: 23
✅ CSAT rows: 12
💾 Data saved to localStorage
✅ All data loaded successfully!
```

**Error Logs:**
```
❌ Error parsing Excel: [Error object]
Error details: [specific error message]
Error stack: [stack trace]
```

---

## 🐛 Common Issues & Solutions

### **Issue 1: File Not Uploading**

**Symptoms:**
- Click upload zone, nothing happens
- No console logs appear

**Solutions:**
1. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Check file format**: Must be `.xlsx` or `.xls`
3. **Check console**: Look for JavaScript errors
4. **Try drag-and-drop**: Drag file directly onto upload zone

### **Issue 2: "Error Parsing File"**

**Symptoms:**
- File uploads but shows error message
- Console shows parsing errors

**Solutions:**
1. **Check sheet names**: Must have exact names:
   - `Parameter_Audit_Count`
   - `Recruiter_Audit_Count`
   - `Account_Summary`
   - `RCA_CAPA`
   - `Projects`
   - `CSAT`

2. **Check file corruption**:
   - Try opening file in Excel
   - Save a fresh copy
   - Re-upload

3. **Check file size**:
   - Very large files (>10MB) may timeout
   - Try compressing or splitting data

### **Issue 3: LocalStorage Error**

**Symptoms:**
- Console shows "Could not save to localStorage"
- Data uploads but doesn't persist

**Solutions:**
1. **Clear localStorage**:
   ```javascript
   localStorage.clear()
   ```
   (Run in browser console)

2. **Check available space**:
   - LocalStorage has ~5-10MB limit
   - Large files may exceed limit

3. **Disable private browsing**:
   - LocalStorage may be disabled in private mode

### **Issue 4: No Data in Account Summary**

**Symptoms:**
- Upload successful
- Account Summary tab is empty

**Solutions:**
1. **Check sheet name**: Must be exactly `Account_Summary` (case-sensitive)
2. **Check console**: Look for row count:
   ```
   ✅ Account_Summary rows: 0
   ```
3. **Check sheet data**: Ensure Account_Summary sheet has data rows

---

## 📊 Expected File Structure

### **Required Sheets**
1. `Parameter_Audit_Count` - Audit parameters data
2. `Recruiter_Audit_Count` - Recruiter audit data
3. `Account_Summary` - Account summary data
4. `RCA_CAPA` - RCA & CAPA data
5. `Projects` - Projects data
6. `CSAT` - Customer satisfaction data

### **Account_Summary Columns** (Example)
- `Account` or `Client` or `Account Name`
- `Practice Head` or `Practice`
- `Regional Head` or `Region` or `Regional`
- `Audit Status`
- `Client Interaction` or `Interaction`
- `Audit Frequency` or `Frequency`

---

## 🔍 Debug Checklist

Before reporting issues, check:

- [ ] Browser console open (F12)
- [ ] File format is .xlsx or .xls
- [ ] File size < 10MB
- [ ] All required sheets present
- [ ] Sheet names match exactly (case-sensitive)
- [ ] Account_Summary has data rows
- [ ] Hard refresh attempted (Ctrl+Shift+R)
- [ ] Drag-and-drop tested
- [ ] Console logs captured

---

## 📱 Test Upload

1. **Visit**: https://3000-ifyzmdkl96jjed6itxsc7-d0b9e1e2.sandbox.novita.ai
2. **Open Console**: F12 → Console tab
3. **Upload File**: Click or drag "Base File.xlsx"
4. **Watch Logs**: See detailed progress
5. **Check Result**: See success alert with row counts

---

## 🚀 Upload Process Flow

```
User Action
    ↓
[Click Upload Zone] or [Drag File]
    ↓
🔄 File upload started...
    ↓
📁 File selected: [name] Size: [MB]
    ↓
📊 Starting to read file...
    ↓
📖 File read complete, parsing...
    ↓
📦 File data loaded: [bytes] bytes
    ↓
📊 Workbook parsed successfully
    ↓
[Parse Each Sheet]
    ↓
✅ Parameter_Audit_Count rows: [N]
✅ Recruiter_Audit_Count rows: [N]
✅ Account_Summary rows: [N]
✅ RCA_CAPA rows: [N]
✅ Projects rows: [N]
✅ CSAT rows: [N]
    ↓
💾 Data saved to localStorage
    ↓
✅ All data loaded successfully!
    ↓
[Close Modal + Refresh Dashboard]
    ↓
✅ Success Alert
```

---

## 💡 Tips for Successful Upload

1. **Use latest Excel format** (.xlsx preferred)
2. **Ensure clean data** - no merged cells, no formulas
3. **Keep file size reasonable** (< 5MB recommended)
4. **Match sheet names exactly** (case-sensitive)
5. **Include all required sheets** (even if empty)
6. **Test with smaller file first** if having issues
7. **Check console logs** for detailed feedback
8. **Try drag-and-drop** if click doesn't work

---

## 🎉 SUCCESS!

File upload now includes:
- ✅ Comprehensive console logging
- ✅ Drag-and-drop support
- ✅ Better error messages
- ✅ File type validation
- ✅ Progress bar management
- ✅ Clean error recovery

**Try uploading now and check the console (F12) to see all the detailed logs!** 🚀
