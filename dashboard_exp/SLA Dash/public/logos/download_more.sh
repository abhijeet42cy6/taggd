#!/bin/bash

# Download more automotive logos
curl -L -o hyundai.png "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Hyundai_Motor_Company_logo_%282011%29.svg/200px-Hyundai_Motor_Company_logo_%282011%29.svg.png" 2>/dev/null
curl -L -o isuzu.png "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Isuzu_logo.svg/200px-Isuzu_logo.svg.png" 2>/dev/null
curl -L -o bridgestone.png "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Bridgestone_logo.svg/200px-Bridgestone_logo.svg.png" 2>/dev/null
curl -L -o subros.png "https://upload.wikimedia.org/wikipedia/en/thumb/1/1f/Subros_logo.png/200px-Subros_logo.png" 2>/dev/null

# Tech/IT logos
curl -L -o wipro.png "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Wipro_Primary_Logo_Color_RGB.svg/200px-Wipro_Primary_Logo_Color_RGB.svg.png" 2>/dev/null
curl -L -o hpe.png "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Hewlett_Packard_Enterprise_logo.svg/200px-Hewlett_Packard_Enterprise_logo.svg.png" 2>/dev/null

# Consumer goods
curl -L -o pg.png "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Procter_%26_Gamble_logo.svg/200px-Procter_%26_Gamble_logo.svg.png" 2>/dev/null
curl -L -o pidilite.png "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Pidilite_logo.svg/200px-Pidilite_logo.svg.png" 2>/dev/null
curl -L -o ultratech.png "https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/UltraTech_Cement_Logo.svg/200px-UltraTech_Cement_Logo.svg.png" 2>/dev/null

# Industrial
curl -L -o schaeffler.png "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Schaeffler_Logo.svg/200px-Schaeffler_Logo.svg.png" 2>/dev/null
curl -L -o vertiv.png "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Vertiv_logo.svg/200px-Vertiv_logo.svg.png" 2>/dev/null

# Financial
curl -L -o sbi-card.png "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/SBI-logo.svg/200px-SBI-logo.svg.png" 2>/dev/null

echo "✓ Downloaded additional logos"
ls -lh *.png 2>/dev/null | wc -l
