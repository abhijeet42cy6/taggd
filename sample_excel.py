import pandas as pd
import os
import json

excel_dir = "/Users/arjun/Software/tgddata/excel_files"
targets = [
    {"file": "Birla_Paint.xlsx", "tracker": "Sheet1", "contract": "Contract"},
    {"file": "Pfizer.xlsx", "tracker": "Position Tracker 2025", "contract": "Contract"}
]

def clean(val):
    if pd.isna(val): return None
    if isinstance(val, (pd.Timestamp, pd.DatetimeIndex)): return val.isoformat()
    return val

for t in targets:
    filepath = os.path.join(excel_dir, t['file'])
    print(f"\nFILE: {t['file']}")
    for s_type, s_name in [("Tracker", t['tracker']), ("Contract", t['contract'])]:
        print(f"\n--- {s_type} Sheet: {s_name} (10 Random Rows) ---")
        df = pd.read_excel(filepath, sheet_name=s_name)
        sample_size = min(10, len(df))
        sample = df.sample(sample_size).applymap(clean).to_dict(orient='records')
        for i, row in enumerate(sample):
            print(f"Row {i+1}: { {k:v for k,v in row.items() if v is not None} }")
