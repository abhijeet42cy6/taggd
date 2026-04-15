import requests
import os
from PIL import Image
from io import BytesIO

# List of companies and their search queries
companies = [
    ('honeywell', 'Honeywell'),
    ('mahindra', 'Mahindra & Mahindra M&M'),
    ('pfizer', 'Pfizer'),
    ('skf', 'SKF'),
    ('siemens', 'Siemens'),
    ('tata', 'TATA Group'),
    ('maruti-suzuki', 'Maruti Suzuki'),
    ('hyundai', 'Hyundai'),
    ('bridgestone', 'Bridgestone'),
    ('pg', 'Procter & Gamble P&G'),
    ('robert-bosch', 'Bosch'),
    ('hpe', 'HPE Hewlett Packard Enterprise'),
    ('sbi-card', 'SBI Card'),
    ('titan', 'Titan Company'),
    ('ultratech', 'Ultratech Cement'),
    ('royal-enfield', 'Royal Enfield'),
    ('ashok-leyland', 'Ashok Leyland'),
    ('schaeffler', 'Schaeffler'),
    ('jindal', 'Jindal Steel'),
    ('wtw', 'WTW Willis Towers Watson'),
    ('wipro', 'Wipro'),
    ('pidilite', 'Pidilite'),
    ('dp-world', 'DP World'),
    ('birla-paints', 'Birla Paints'),
    ('vertiv', 'Vertiv'),
    ('ingram-micro', 'Ingram Micro'),
    ('isuzu', 'ISUZU'),
    ('ametek', 'Ametek'),
    ('atomberg', 'Atomberg'),
    ('bits', 'BITS Pilani'),
    ('mahindra-finance', 'Mahindra Finance'),
    ('mahindra-holidays', 'Mahindra Holidays'),
    ('subros', 'Subros'),
    ('servify', 'Servify'),
    ('amns', 'AMNS India'),
    ('excelacom', 'Excelacom')
]

logos_dir = '/home/user/webapp/public/logos'
os.makedirs(logos_dir, exist_ok=True)

print(f"Created logos directory: {logos_dir}")
print(f"Will download {len(companies)} company logos...")
