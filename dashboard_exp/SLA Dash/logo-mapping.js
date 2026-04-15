// Logo mapping for all accounts
// This maps account names to logo filenames
const accountLogos = {
    'AMNS': 'amns.png',
    'Ametek': 'ametek.png',
    'Ashok Leyland': 'ashok-leyland.png',
    'Atomberg': 'atomberg.png',
    'BITS': 'bits.png',
    'Birla Paints': 'birla-paints.png',
    'Bridgestone': 'bridgestone.png',
    'DP World': 'dp-world.png',
    'Excelacom': 'excelacom.png',
    'HPE': 'hpe.png',
    'Honeywell': 'honeywell.png',
    'Hyundai': 'hyundai.png',
    'ISUZU (UD Trucks)': 'isuzu.png',
    'Ingram Micro': 'ingram-micro.png',
    'Jindal': 'jindal.png',
    'M&M': 'mm.png',
    'Mahindra Finance': 'mahindra-finance.png',
    'Mahindra Holidays': 'mahindra-holidays.png',
    'Maruti Suzuki': 'maruti-suzuki.png',
    'P&G': 'pg.png',
    'Pfizer': 'pfizer.png',
    'Pidilite': 'pidilite.png',
    'Robert Bosch': 'robert-bosch.png',
    'Royal Enfield': 'royal-enfield.png',
    'SBI Card': 'sbi-card.png',
    'SKF': 'skf.png',
    'SKF Auto': 'skf.png', // Same as SKF
    'SKF Industrial': 'skf.png', // Same as SKF
    'Schaeffler': 'schaeffler.png',
    'Servify': 'servify.png',
    'Siemens - Advanta': 'siemens.png',
    'Siemens - Energy': 'siemens.png',
    'Siemens - GBS': 'siemens.png',
    'Sterling tools': 'sterling-tools.png',
    'Subros': 'subros.png',
    'TATA Consumer': 'tata.png',
    'TATA Electronics': 'tata.png',
    'TATA Fiber': 'tata.png',
    'TATA Power': 'tata.png',
    'TATA Tele': 'tata.png',
    'TITAN': 'titan.png',
    'Ultratech': 'ultratech.png',
    'Vertiv Energy': 'vertiv.png',
    'WTW (Ops & Tech)': 'wtw.png',
    'Wipro': 'wipro.png'
};

// Get logo URL for an account
function getLogoUrl(accountName) {
    const filename = accountLogos[accountName];
    if (filename) {
        return `/logos/${filename}`;
    }
    return null; // No logo found
}

// Get initials for fallback
function getAccountInitials(accountName) {
    return accountName
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}
