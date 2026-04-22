# Contract workbook ingest report

**File:** `Project Signup Renewal Detail New.xlsx`  
**Source path:** `excel_files_imp/Project Signup Renewal Detail New.xlsx`  

## Summary

- **Created:** 50
- **Updated (upsert):** 6
- **Skipped rows:** 6

### Project resolution (same rules as SLA directory)

- `account_norm`: **48**
- `sbu_db_to_sheet`: **5**
- `fuzzy`: **2**
- `sbu_sheet_to_db`: **1**

### Unmatched `Customer` values (no project in DB)

- 'M2P Solutions'
- 'Epack Petroleum'
- 'Synergy Maritime'
- 'Transport Corporation of India'
- 'Indosol Solar'
- 'Yash Technologies'

## Row resolution log

- INSERT 'BITS' → PRJ-14 (client_id=6, match=account_norm)
- INSERT 'Pfizer' → PRJ-68 (client_id=60, match=account_norm)
- UPDATE 'Siemens' → PRJ-72 (client_id=64, match=account_norm, contract_id=5)
- INSERT 'Vertiv' → PRJ-74 (client_id=66, match=account_norm)
- INSERT 'Pidilite' → PRJ-25 (client_id=17, match=account_norm)
- INSERT 'Birla Paints' → PRJ-33 (client_id=25, match=account_norm)
- INSERT 'Mahindra Holidays' → PRJ-17 (client_id=9, match=account_norm)
- INSERT 'Ingram Micro' → PRJ-34 (client_id=26, match=account_norm)
- UPDATE 'Siemens Healthineers' → PRJ-72 (client_id=64, match=sbu_db_to_sheet, contract_id=5)
- INSERT 'Isuzu' → PRJ-75 (client_id=67, match=account_norm)
- UPDATE 'HPE' → PRJ-37 (client_id=29, match=account_norm, contract_id=2)
- UPDATE 'Wipro' → PRJ-35 (client_id=27, match=account_norm, contract_id=6)
- INSERT 'DP World' → PRJ-41 (client_id=33, match=account_norm)
- INSERT 'SKF India' → PRJ-71 (client_id=63, match=account_norm)
- INSERT 'Ametek' → PRJ-42 (client_id=34, match=account_norm)
- UPDATE 'Honeywell' → PRJ-15 (client_id=7, match=account_norm, contract_id=1)
- INSERT 'Optum' → PRJ-115 (client_id=107, match=account_norm)
- INSERT 'AMNS' → PRJ-45 (client_id=37, match=account_norm)
- INSERT 'Tata Electronics' → PRJ-44 (client_id=36, match=account_norm)
- INSERT 'Jindal' → PRJ-47 (client_id=39, match=account_norm)
- INSERT 'M&M' → PRJ-16 (client_id=8, match=account_norm)
- INSERT 'Schaeffler' → PRJ-51 (client_id=43, match=account_norm)
- INSERT 'Royal Enfield' → PRJ-49 (client_id=41, match=account_norm)
- INSERT 'Maruti Suzuki' → PRJ-54 (client_id=46, match=account_norm)
- INSERT 'Nagarjuna Education' → PRJ-112 (client_id=104, match=sbu_db_to_sheet)
- INSERT 'SBI Cards' → PRJ-85 (client_id=77, match=account_norm)
- INSERT 'Hyundai' → PRJ-53 (client_id=45, match=account_norm)
- INSERT 'Tata Consumer' → PRJ-56 (client_id=48, match=account_norm)
- INSERT 'Excelacom Technologies' → PRJ-52 (client_id=44, match=sbu_db_to_sheet)
- INSERT 'Tata Play' → PRJ-91 (client_id=83, match=account_norm)
- INSERT 'Mahindra Finance' → PRJ-18 (client_id=10, match=account_norm)
- INSERT 'Suzuki R&D' → PRJ-99 (client_id=91, match=account_norm)
- INSERT 'Atomberg' → PRJ-57 (client_id=49, match=account_norm)
- INSERT 'Subros' → PRJ-58 (client_id=50, match=account_norm)
- INSERT 'Ambuja Cements' → PRJ-67 (client_id=59, match=fuzzy)
- INSERT 'Ashok Leyland' → PRJ-60 (client_id=52, match=account_norm)
- INSERT 'Bridgestone' → PRJ-61 (client_id=53, match=account_norm)
- INSERT 'Sterling Tools' → PRJ-59 (client_id=51, match=account_norm)
- INSERT 'Pernod Ricard' → PRJ-65 (client_id=57, match=account_norm)
- INSERT 'ABB Global' → PRJ-103 (client_id=95, match=sbu_db_to_sheet)
- INSERT 'Leap India' → PRJ-66 (client_id=58, match=account_norm)
- INSERT 'Unicharm' → PRJ-134 (client_id=125, match=account_norm)
- INSERT 'TCG Group' → PRJ-138 (client_id=129, match=account_norm)
- INSERT 'Saint Gobin' → PRJ-135 (client_id=126, match=fuzzy)
- INSERT 'MetglaS' → PRJ-141 (client_id=132, match=account_norm)
- INSERT 'Neosoft' → PRJ-136 (client_id=127, match=account_norm)
- INSERT 'CG Power' → PRJ-140 (client_id=131, match=account_norm)
- UPDATE 'Reliance' → PRJ-118 (client_id=110, match=sbu_sheet_to_db, contract_id=3)
- INSERT 'Triveni' → PRJ-142 (client_id=133, match=account_norm)
- INSERT 'Gala Precision' → PRJ-144 (client_id=135, match=account_norm)
- INSERT 'ITW India' → PRJ-145 (client_id=136, match=account_norm)
- INSERT 'Primetals Technologies' → PRJ-146 (client_id=137, match=account_norm)
- INSERT 'Arvind Smartspaces' → PRJ-147 (client_id=138, match=account_norm)
- INSERT 'Autofit' → PRJ-148 (client_id=139, match=account_norm)
- INSERT 'Carplai' → PRJ-149 (client_id=140, match=account_norm)
- INSERT 'Banswara Syntex' → PRJ-143 (client_id=134, match=sbu_db_to_sheet)

