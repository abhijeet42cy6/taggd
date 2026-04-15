#!/bin/bash

# Function to download and process logo
download_logo() {
    local url="$1"
    local filename="$2"
    echo "Downloading $filename..."
    wget -q -O "$filename" "$url" 2>/dev/null || echo "  Failed: $filename"
}

# Download major company logos from Wikimedia Commons / Public sources
# Honeywell
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Honeywell_logo.svg/512px-Honeywell_logo.svg.png" "honeywell.png"

# Mahindra
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Mahindra_Rise_Logo.svg/512px-Mahindra_Rise_Logo.svg.png" "mm.png"
cp mm.png mahindra-finance.png
cp mm.png mahindra-holidays.png

# Pfizer  
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Pfizer_logo.svg/512px-Pfizer_logo.svg.png" "pfizer.png"

# SKF
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/SKF_logo.svg/512px-SKF_logo.svg.png" "skf.png"

# Siemens
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Siemens-logo.svg/512px-Siemens-logo.svg.png" "siemens.png"

# TATA
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Tata_logo.svg/512px-Tata_logo.svg.png" "tata.png"

# Maruti Suzuki
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Suzuki_logo_2.svg/512px-Suzuki_logo_2.svg.png" "maruti-suzuki.png"

# Hyundai
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Hyundai_Motor_Company_logo.svg/512px-Hyundai_Motor_Company_logo.svg.png" "hyundai.png"

# Bridgestone
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Bridgestone.svg/512px-Bridgestone.svg.png" "bridgestone.png"

# P&G
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Procter_%26_Gamble_logo.svg/512px-Procter_%26_Gamble_logo.svg.png" "pg.png"

# Bosch
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Bosch-logotype.svg/512px-Bosch-logotype.svg.png" "robert-bosch.png"

# HPE
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Hewlett_Packard_Enterprise_logo.svg/512px-Hewlett_Packard_Enterprise_logo.svg.png" "hpe.png"

# Wipro
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Wipro_Primary_Logo_Color_RGB.svg/512px-Wipro_Primary_Logo_Color_RGB.svg.png" "wipro.png"

# Royal Enfield
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Royal_Enfield_logo.svg/512px-Royal_Enfield_logo.svg.png" "royal-enfield.png"

# Ashok Leyland
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Ashok_Leyland_Logo.svg/512px-Ashok_Leyland_Logo.svg.png" "ashok-leyland.png"

# Schaeffler
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Schaeffler_AG_logo.svg/512px-Schaeffler_AG_logo.svg.png" "schaeffler.png"

# Titan
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Titan_Company_Logo.svg/512px-Titan_Company_Logo.svg.png" "titan.png"

# Ultratech
download_logo "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/UltraTech_Cement.svg/512px-UltraTech_Cement.svg.png" "ultratech.png"

echo ""
echo "Download complete! Checking files..."
ls -lh *.png 2>/dev/null | wc -l
