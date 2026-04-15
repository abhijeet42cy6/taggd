import requests
import os

# Real logo URLs from Wikimedia Commons and official sources
logos = {
    # Major automotive
    'tata.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Tata_logo.svg/200px-Tata_logo.svg.png',
    'maruti-suzuki.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Maruti_Suzuki_India_Limited.svg/200px-Maruti_Suzuki_India_Limited.svg.png',
    'mahindra.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Mahindra_Logo.svg/200px-Mahindra_Logo.svg.png',
    'mm.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Mahindra_Logo.svg/200px-Mahindra_Logo.svg.png',
    'ashok-leyland.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Ashok_Leyland_Logo.svg/200px-Ashok_Leyland_Logo.svg.png',
    'hyundai.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Hyundai_Motor_Company_logo_%282011%29.svg/200px-Hyundai_Motor_Company_logo_%282011%29.svg.png',
    'royal-enfield.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Royal_Enfield_logo.svg/200px-Royal_Enfield_logo.svg.png',
    'isuzu.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Isuzu_logo.svg/200px-Isuzu_logo.svg.png',
    
    # Industrial/Manufacturing
    'honeywell.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Honeywell_logo.svg/200px-Honeywell_logo.svg.png',
    'siemens.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Siemens-logo.svg/200px-Siemens-logo.svg.png',
    'robert-bosch.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Bosch-logotype.svg/200px-Bosch-logotype.svg.png',
    'schaeffler.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Schaeffler_Logo.svg/200px-Schaeffler_Logo.svg.png',
    'skf.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/SKF_logo.svg/200px-SKF_logo.svg.png',
    'bridgestone.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Bridgestone_logo.svg/200px-Bridgestone_logo.svg.png',
    'vertiv.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Vertiv_logo.svg/200px-Vertiv_logo.svg.png',
    
    # Tech/IT
    'wipro.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Wipro_Primary_Logo_Color_RGB.svg/200px-Wipro_Primary_Logo_Color_RGB.svg.png',
    'hpe.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Hewlett_Packard_Enterprise_logo.svg/200px-Hewlett_Packard_Enterprise_logo.svg.png',
    'ingram-micro.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Ingram_Micro_logo.svg/200px-Ingram_Micro_logo.svg.png',
    
    # Consumer goods
    'pg.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Procter_%26_Gamble_logo.svg/200px-Procter_%26_Gamble_logo.svg.png',
    'pfizer.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Pfizer_logo.svg/200px-Pfizer_logo.svg.png',
    'pidilite.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Pidilite_logo.svg/200px-Pidilite_logo.svg.png',
    'titan.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Titan_Company_Logo.svg/200px-Titan_Company_Logo.svg.png',
    'ultratech.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/UltraTech_Cement_Logo.svg/200px-UltraTech_Cement_Logo.svg.png',
    'birla-paints.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Birla_Corporation_Logo.svg/200px-Birla_Corporation_Logo.svg.png',
    
    # Financial
    'sbi-card.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/SBI-logo.svg/200px-SBI-logo.svg.png',
    'mahindra-finance.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Mahindra_Logo.svg/200px-Mahindra_Logo.svg.png',
    'mahindra-holidays.png': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Mahindra_Logo.svg/200px-Mahindra_Logo.svg.png',
}

success = []
failed = []

for filename, url in logos.items():
    try:
        print(f"Downloading {filename}...")
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200 and len(response.content) > 100:
            with open(filename, 'wb') as f:
                f.write(response.content)
            success.append(filename)
            print(f"  ✓ {filename} ({len(response.content)} bytes)")
        else:
            failed.append(filename)
            print(f"  ✗ {filename} failed (status: {response.status_code})")
    except Exception as e:
        failed.append(filename)
        print(f"  ✗ {filename} error: {str(e)}")

print(f"\n✓ Success: {len(success)}")
print(f"✗ Failed: {len(failed)}")
if failed:
    print(f"Failed logos: {', '.join(failed)}")
