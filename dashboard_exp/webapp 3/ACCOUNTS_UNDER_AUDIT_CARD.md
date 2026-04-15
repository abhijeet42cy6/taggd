# ✅ Accounts Under Audit Card Added - Complete

## New Card Added
A new insight card has been added to the scrolling cards section showing:
- **Accounts Under Audit** with format "X/Total"
- Calculated from Account_Summary sheet
- Shows accounts with Audit Status = "YES"

## Card Design

### Visual Layout:
```
┌────────────────────────────┐
│  Accounts    [Accounts]    │  ← Ribbon
│                            │
│  Accounts Under Audit      │  ← Title
│       15/35                │  ← Value (X/Total)
│   Active Audits            │  ← Label
└────────────────────────────┘
```

## Calculation Logic

### Function: `getAccountsUnderAudit()`
```javascript
- Data Source: window.dashboardData.accountSummary (Account_Summary sheet)
- Logic:
  1. Count total accounts in Account_Summary
  2. Filter accounts where Audit Status = "YES"
  3. Return format: "X/Total" (e.g., "15/35")
```

### Field Mapping:
- **Audit Status field**: Checks multiple variations
  - `Audit Status`
  - `Audit_Status`
  - `AuditStatus`
- **Condition**: Status must equal "YES" (case-insensitive)

## Card Order
The new card is displayed **first** in the scrolling carousel:
1. **Accounts Under Audit** (NEW) - "15/35" format
2. Account of the Month - "HPE" with accuracy
3. Closed Projects - "21" count
4. Closed RCA & CAPA - "85" count

## Card Properties
```javascript
{
    title: 'Accounts Under Audit',
    value: '15/35',           // Dynamic: underAudit/total
    label: 'Active Audits',
    ribbon: 'Accounts'
}
```

## Data Flow
1. Load Account_Summary sheet into `window.dashboardData.accountSummary`
2. Call `getAccountsUnderAudit()` in `renderInsightCards()`
3. Filter accounts with Audit Status = "YES"
4. Format as "X/Total"
5. Display in scrolling card carousel

## Example Output
Based on Account_Summary data:
- **Total Accounts**: 35 (all rows in Account_Summary)
- **Accounts with Audit Status = YES**: 15
- **Display**: "15/35"

## Files Changed
- `index.html` - 2 modifications:
  1. Added `getAccountsUnderAudit()` function
  2. Updated `renderInsightCards()` to include new card

## Testing
- Server restarted successfully
- Preview URL: https://3000-iiqzlm50w1twpgggr1553-82b888ba.sandbox.novita.ai
- Card displays in scrolling carousel
- Calculation based on Account_Summary data

## Console Logs
The function logs:
- `🔍 getAccountsUnderAudit called`
- `📊 Total Accounts: X`
- `📊 Accounts Under Audit: Y out of X`

## Status
🟢 **COMPLETE** - New "Accounts Under Audit" card added as first card in carousel with format "X/Total".
