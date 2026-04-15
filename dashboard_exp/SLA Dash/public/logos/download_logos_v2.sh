#!/bin/bash

# Download TATA logo (from Wikimedia Commons)
curl -L -o tata.png "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Tata_logo.svg/200px-Tata_logo.svg.png" 2>/dev/null

# Download Honeywell logo (from Wikimedia Commons)
curl -L -o honeywell.png "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Honeywell_logo.svg/200px-Honeywell_logo.svg.png" 2>/dev/null

# Download Ashok Leyland logo (from Seeklogo)
curl -L -o ashok-leyland.png "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Ashok_Leyland_Logo.svg/200px-Ashok_Leyland_Logo.svg.png" 2>/dev/null

# Download other major logos
curl -L -o maruti-suzuki.png "https://upload.wikimedia.org/wikipedia/en/thumb/e/e9/Maruti_Suzuki_India_Limited_Logo.svg/200px-Maruti_Suzuki_India_Limited_Logo.svg.png" 2>/dev/null
curl -L -o mahindra.png "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Mahindra_and_Mahindra_Logo.svg/200px-Mahindra_and_Mahindra_Logo.svg.png" 2>/dev/null
curl -L -o royal-enfield.png "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Royal_Enfield_logo.svg/200px-Royal_Enfield_logo.svg.png" 2>/dev/null
curl -L -o skf.png "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/SKF_logo.svg/200px-SKF_logo.svg.png" 2>/dev/null
curl -L -o bosch.png "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Bosch-logotype.svg/200px-Bosch-logotype.svg.png" 2>/dev/null
curl -L -o pfizer.png "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Pfizer_logo.svg/200px-Pfizer_logo.svg.png" 2>/dev/null
curl -L -o titan.png "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Titan_Company_Logo.svg/200px-Titan_Company_Logo.svg.png" 2>/dev/null

echo "Download complete!"
ls -lh *.png 2>/dev/null | awk '{if ($5 != "0") print $9 " - " $5}'
