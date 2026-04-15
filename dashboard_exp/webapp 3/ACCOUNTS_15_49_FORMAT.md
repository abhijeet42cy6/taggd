# ✅ Accounts Under Audit Display Updated to 15/49 Format

## Changes Applied
Updated the calculation to show "15/49" format where:
- **15** = Accounts with Audit Status = "YES" (from Account_Summary)
- **49** = Total unique accounts (from Parameter_Audit_Count)

## Previous vs Current Calculation

### Before:
- **Under Audit**: Accounts with Audit Status = "YES" from Account_Summary
- **Total**: Total rows in Account_Summary sheet
- **Format**: X/Y (e.g., "15/35")

### After (Current):
- **Under Audit**: Accounts with Audit Status = "YES" from Account_Summary
- **Total**: Unique accounts from Parameter_Audit_Count sheet
- **Format**: 15/49

## Calculation Logic

### Updated Function: `getAccountsUnderAudit()`

```javascript
// Step 1: Count accounts under audit (Audit Status = YES)
// Source: Account_Summary sheet
accountsUnderAudit = count where Audit Status = "YES"

// Step 2: Count total unique accounts
// Source: Parameter_Audit_Count sheet
totalAccounts = count of unique accounts in Parameter_Audit_Count

// Step 3: Format display
display = "15/49"
```

### Field Mapping:
**For Under Audit (from Account_Summary):**
- Checks: `Audit Status`, `Audit_Status`, `AuditStatus`
- Condition: Value = "YES" (case-insensitive)

**For Total (from Parameter_Audit_Count):**
- Checks: `Account`, `Client`, `Account Name`
- Counts: Unique account names (deduplicates)

## Why Parameter_Audit_Count for Total?

Parameter_Audit_Count contains all accounts that have audit data, including:
- Accounts with Audit Status = YES (active audits)
- Accounts with Audit Status = NO (inactive/completed audits)
- Historical audit records

This gives a more comprehensive total of all accounts in the audit system.

## Example Output
```
┌────────────────────────────┐
│  Accounts    [Accounts]    │
│                            │
│  Accounts Under Audit      │
│         15/49              │  ← Updated format
│    Active Audits           │
└────────────────────────────┘
```

## Data Sources
1. **Account_Summary** (35 rows)
   - Used for counting accounts under audit (Audit Status = YES)
   - Example: 15 accounts with YES status

2. **Parameter_Audit_Count** (thousands of rows)
   - Used for total unique accounts
   - Example: 49 unique account names

## Console Logs
The function now logs:
```
🔍 getAccountsUnderAudit called
📊 Accounts Under Audit: 15
📊 Total Accounts (from Parameter_Audit_Count): 49
```

## Files Changed
- `index.html` - Updated `getAccountsUnderAudit()` function

## Testing
- Server restarted successfully
- Preview URL: https://3000-iiqzlm50w1twpgggr1553-82b888ba.sandbox.novita.ai
- Card now displays "15/49" format
- Calculation matches requested format

## Status
🟢 **COMPLETE** - Accounts Under Audit card now shows "15/49" format using:
- 15 from Account_Summary (Audit Status = YES)
- 49 from Parameter_Audit_Count (unique accounts)
