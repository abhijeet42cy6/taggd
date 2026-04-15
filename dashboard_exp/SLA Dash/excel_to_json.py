#!/usr/bin/env python3
"""
TAGGD Dashboard Data Converter
Converts Excel SLA data to JSON format for automatic dashboard loading
"""

import json
import sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("❌ Error: pandas library not found!")
    print("\nPlease install required libraries:")
    print("  pip install pandas openpyxl")
    sys.exit(1)

def convert_excel_to_json(excel_file, output_file='sample_data.json'):
    """
    Convert TAGGD Excel file to JSON format
    
    Args:
        excel_file: Path to Excel file
        output_file: Output JSON file path (default: sample_data.json)
    """
    try:
        print(f"📂 Reading Excel file: {excel_file}")
        
        # Check if file exists
        if not Path(excel_file).exists():
            print(f"❌ Error: File not found: {excel_file}")
            return False
        
        # Read required sheets
        print("📊 Loading sheets...")
        
        sheets_to_read = {
            'fy24_25': 'FY 24-25 Summary',
            'fy25_26': 'FY 25-26 Summary',
            'fy2425NotReported': 'FY24-25 Not Reported',
            'fy2526NotReported': 'FY25-26 Not Reported'
        }
        
        data = {}
        
        for key, sheet_name in sheets_to_read.items():
            try:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
                
                # Convert to list of dictionaries
                data[key] = df.to_dict('records')
                
                print(f"  ✅ {sheet_name}: {len(df)} rows loaded")
                
                # Validate required columns
                if key in ['fy24_25', 'fy25_26']:
                    required_cols = ['Project', 'Region', 'Practice Head']
                    missing_cols = [col for col in required_cols if col not in df.columns]
                    
                    if missing_cols:
                        print(f"  ⚠️  Warning: Missing columns in {sheet_name}: {missing_cols}")
                
            except Exception as e:
                print(f"  ❌ Error reading sheet '{sheet_name}': {e}")
                print(f"     This sheet will be set to empty array")
                data[key] = []
        
        # Save as JSON
        print(f"\n💾 Saving to {output_file}...")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        # Validate output
        file_size = Path(output_file).stat().st_size
        print(f"✅ Conversion complete!")
        print(f"   Output file: {output_file}")
        print(f"   File size: {file_size:,} bytes")
        print(f"\n📊 Data Summary:")
        print(f"   FY 24-25: {len(data['fy24_25'])} projects")
        print(f"   FY 25-26: {len(data['fy25_26'])} projects")
        print(f"   FY 24-25 Not Reported: {len(data['fy2425NotReported'])} rows")
        print(f"   FY 25-26 Not Reported: {len(data['fy2526NotReported'])} rows")
        
        print(f"\n🚀 Next Steps:")
        print(f"   1. Test locally: python -m http.server 3000")
        print(f"   2. Deploy: git add {output_file} && git commit -m 'Update data' && git push")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main entry point"""
    print("=" * 60)
    print("  TAGGD Dashboard - Excel to JSON Converter")
    print("=" * 60)
    print()
    
    # Check arguments
    if len(sys.argv) < 2:
        print("Usage: python excel_to_json.py <excel_file> [output_file]")
        print("\nExample:")
        print("  python excel_to_json.py SLA_Data.xlsx")
        print("  python excel_to_json.py SLA_Data.xlsx custom_data.json")
        print("\nRequired Excel sheets:")
        print("  - FY 24-25 Summary")
        print("  - FY 25-26 Summary")
        print("  - FY24-25 Not Reported")
        print("  - FY25-26 Not Reported")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'sample_data.json'
    
    success = convert_excel_to_json(excel_file, output_file)
    
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
