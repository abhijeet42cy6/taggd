#!/bin/bash

echo "Downloading correct company logos..."

# Mahindra & Mahindra (M&M)
echo "1. Mahindra & Mahindra..."
curl -L -o mm-temp.png "https://logos-world.net/wp-content/uploads/2021/08/Mahindra-and-Mahindra-Logo.png" 2>/dev/null
if [ -s mm-temp.png ]; then mv mm-temp.png mm.png; echo "  ✓ M&M"; else echo "  ✗ M&M failed"; fi

# Maruti Suzuki India Ltd
echo "2. Maruti Suzuki India Ltd..."
curl -L -o maruti-temp.png "https://logos-world.net/wp-content/uploads/2021/09/Maruti-Suzuki-Logo.png" 2>/dev/null
if [ -s maruti-temp.png ]; then mv maruti-temp.png maruti-suzuki.png; echo "  ✓ Maruti Suzuki"; else echo "  ✗ Maruti failed"; fi

# Ashok Leyland
echo "3. Ashok Leyland..."
curl -L -o ashok-temp.png "https://logos-world.net/wp-content/uploads/2021/09/Ashok-Leyland-Logo.png" 2>/dev/null
if [ -s ashok-temp.png ]; then mv ashok-temp.png ashok-leyland.png; echo "  ✓ Ashok Leyland"; else echo "  ✗ Ashok failed"; fi

# Pfizer
echo "4. Pfizer..."
curl -L -o pfizer-temp.png "https://logos-world.net/wp-content/uploads/2020/11/Pfizer-Logo.png" 2>/dev/null
if [ -s pfizer-temp.png ]; then mv pfizer-temp.png pfizer.png; echo "  ✓ Pfizer"; else echo "  ✗ Pfizer failed"; fi

# Honeywell
echo "5. Honeywell..."
curl -L -o honeywell-temp.png "https://logos-world.net/wp-content/uploads/2021/02/Honeywell-Logo.png" 2>/dev/null
if [ -s honeywell-temp.png ]; then mv honeywell-temp.png honeywell.png; echo "  ✓ Honeywell"; else echo "  ✗ Honeywell failed"; fi

# UD Trucks (ISUZU variant)
echo "6. UD Trucks..."
curl -L -o ud-temp.png "https://www.carlogos.org/logo/UD-Trucks-logo-2010-2560x1440.png" 2>/dev/null
if [ -s ud-temp.png ]; then 
    mv ud-temp.png isuzu.png
    echo "  ✓ UD Trucks (for ISUZU)"
else 
    echo "  ✗ UD Trucks failed"
fi

# SKF (will be used for SKF, SKF Auto, SKF Industrial)
echo "7. SKF..."
curl -L -o skf-temp.png "https://logos-world.net/wp-content/uploads/2022/04/SKF-Logo.png" 2>/dev/null
if [ -s skf-temp.png ]; then 
    cp skf-temp.png skf.png
    cp skf-temp.png skf-auto.png
    cp skf-temp.png skf-industrial.png
    rm skf-temp.png
    echo "  ✓ SKF (+ Auto, Industrial)"
else 
    echo "  ✗ SKF failed"
fi

# Titan
echo "8. Titan..."
curl -L -o titan-temp.png "https://logos-world.net/wp-content/uploads/2022/04/Titan-Company-Logo.png" 2>/dev/null
if [ -s titan-temp.png ]; then mv titan-temp.png titan.png; echo "  ✓ Titan"; else echo "  ✗ Titan failed"; fi

# TATA (for TATA marcopolo and other TATA variants)
echo "9. TATA Logo (for all TATA variants)..."
curl -L -o tata-temp.png "https://logos-world.net/wp-content/uploads/2020/11/Tata-Logo.png" 2>/dev/null
if [ -s tata-temp.png ]; then 
    cp tata-temp.png tata.png
    cp tata-temp.png tata-consumer.png
    cp tata-temp.png tata-electronics.png
    cp tata-temp.png tata-fiber.png
    cp tata-temp.png tata-power.png
    cp tata-temp.png tata-tele.png
    rm tata-temp.png
    echo "  ✓ TATA (+ all variants)"
else 
    echo "  ✗ TATA failed"
fi

echo ""
echo "Download complete!"
echo ""
echo "Verifying downloaded logos:"
ls -lh *.png 2>/dev/null | awk '{if ($5 != "0" && $5 ~ /K|M/) print "  ✓", $9, "-", $5}'
