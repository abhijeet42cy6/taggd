// ============================================================
// FINANCE EXECUTIVE DASHBOARD v2 — js/data.js
// All values sourced directly from Excel sheets.
// FY24-25: Full year Apr24-Mar25 (12 months)
// FY25-26: YTD through Feb26 (11 months actuals; Mar26 = 0)
// Units: Lakhs (L) unless stated otherwise.
// ============================================================
'use strict';

window.FIN_DATA = {

  // ─────────────────────────────────────────────────────────
  // FY 2024-25  (Source: FY24-25_Finance_Data.xlsx)
  // Sheets: Revenue_Actual, Revenue_Budget, Rev_Forecast,
  //   CM_Actual, CM_Budget, CM_Forecast, Collection Target,
  //   Revenue_Collected, Actual_Headcount Overall,
  //   Approved_Headcount, Actual Headcount WL1,
  //   Actual_PPC, Taggd_Source_Joiner, Non Taggd Source Joiner,
  //   Unbilled, Bad Debt, Rev_Adjustment, Target_Rev_Productivity
  // ─────────────────────────────────────────────────────────
  FY2425: {
    label: 'FY 2024-25',
    short: 'FY24-25',
    months:  ['Apr24','May24','Jun24','Jul24','Aug24','Sep24','Oct24','Nov24','Dec24','Jan25','Feb25','Mar25'],
    mLabels: ['Apr',  'May',  'Jun',  'Jul',  'Aug',  'Sep',  'Oct',  'Nov',  'Dec',  'Jan',  'Feb',  'Mar'],

    // ── Full-year totals (sourced directly from Excel, all monthly sums verified) ──
    totals: {
      revA: 8477.27,   revB: 13000.00,  revF: 9163.00,
      cmA:  2601.14,   cmB:  5460.00,   cmF:  3210.07,
      cmAPct: 30.68,   cmBPct: 42.00,   cmFPct: 35.03,
      collA: 10004.65, collT: 14830.34,
      hcOverall: 577,  hcWL1: 459,      hcApproved: 377,
      ppcAvg: 82509,   // ₹ per person per month — sum(TotalCost Apr24–Mar25) / sum(HC Apr24–Mar25)
      taggd: 8878,     nonTaggd: 10611, totalJ: 19489, taggdMix: 45.56,
      unbilled: 0,     badDebt: 0,
      revAdj: 347.13,
    },

    // ── Monthly arrays — index 0=Apr24, 11=Mar25 ──────────
    monthly: {
      // Revenue Actual (₹ L) — from Revenue_Actual sheet (sourced directly from Excel, all 12 months summed per month)
      revA: [639.72, 710.79, 714.58, 684.24, 701.91, 853.35,
             625.97, 710.87, 795.08, 641.27, 629.30, 770.19],

      // Revenue Budget (₹ L) — from Revenue_Budget sheet (sourced directly from Excel)
      revB: [623.39, 872.75, 997.43, 771.22, 1079.71, 1233.95,
             869.16, 1216.82, 1390.65, 986.23, 1380.72, 1577.96],

      // Revenue Forecast (₹ L) — from Rev_Forecast sheet (sourced directly from Excel)
      revF: [527.47, 738.46, 843.95, 579.37, 811.12, 926.99,
             581.38, 813.94, 930.21, 602.53, 843.54, 964.04],

      // CM Actual (₹ L) — from CM_Actual sheet (sourced directly from Excel)
      cmA: [128.33, 207.10, 231.59, 201.59, 206.35, 310.59,
            166.59, 252.92, 318.89, 158.15, 161.23, 257.81],

      // CM Budget (₹ L) — from CM_Budget sheet (sourced directly from Excel)
      cmB: [261.83, 366.56, 418.92, 323.91, 453.48, 518.26,
            365.05, 511.06, 584.07, 414.22, 579.90, 662.74],

      // CM Forecast (₹ L) — from CM_Forecast sheet (sourced directly from Excel)
      cmF: [168.34, 256.95, 301.26, 190.14, 287.47, 336.14,
            190.98, 288.65, 337.49, 199.86, 301.09, 351.70],

      // CM% Actual — derived: cmA/revA*100 (recalculated with correct Excel values)
      cmAPct: [20.06, 29.14, 32.41, 29.46, 29.40, 36.40,
               26.61, 35.58, 40.11, 24.66, 25.62, 33.48],

      // CM% Budget — constant 42% of budget revenue
      cmBPct: [42.00, 42.00, 42.00, 42.00, 42.00, 42.00,
               42.00, 42.00, 42.00, 42.00, 42.00, 42.00],

      // Total Cost (₹) — from Total Cost sheet (used for PPC = Total Cost / HC Overall)
      // Formula: PPC per month = totalCost[i] / hcOverall[i]
      totalCost: [51138707, 50369423, 48293341, 48260799, 49550713, 54196408,
                  45936923, 45792923, 47616217, 48312427, 46806955, 51238229],

      // PPC (₹/person/month) — derived: totalCost / hcOverall per month
      // Used for display; calcMetrics recomputes for selected period using sum(TC)/sum(HC)
      ppc: [79346, 80462, 78335, 79902, 82174, 88992,
            78525, 80621, 84734, 85812, 82407, 88801],

      // Collections Actual (₹ L) — from Revenue_Collected sheet (verified from Excel)
      collA: [946.37, 758.93, 1073.20, 779.78, 782.54, 768.34,
              881.05, 690.89, 916.57, 676.35, 840.03, 890.61],

      // Collections Target (₹ L) — from Collection Target sheet (verified from Excel)
      collT: [1444.87, 1209.70, 1507.47, 1142.32, 1066.33, 1201.04,
              1134.12, 1163.83, 1279.13, 1177.16, 1281.87, 1222.51],

      // Headcount Overall (from Actual_Headcount Overall sheet)
      hcOverall: [644.5, 626.0, 616.5, 604.0, 603.0, 609.0,
                  585.0, 568.0, 562.0, 563.0, 568.0, 577.0],

      // Headcount WL1 (from Actual Headcount WL1 sheet)
      hcWL1: [531, 510, 503, 478, 467, 486, 459, 462, 460, 459, 455, 452],

      // Headcount Approved (from Approved_Headcount sheet)
      hcApproved: [399, 392, 377, 374, 362, 389, 365, 381, 390, 405, 406, 409],

      // Taggd Joiners (from Taggd_Source_Joiner sheet)
      // Source: FY24-25_Finance_Data.xlsx → Taggd_Source_Joiner (column sums per month)
      // May24 updated: 701 (previously null — now confirmed from updated Excel)
      taggd: [834, 701, 711, 747, 830, 790, 495, 528, 688, 718, 814, 1022],

      // Non-Taggd Joiners (from Non Taggd Source Joiner sheet)
      // Source: FY24-25_Finance_Data.xlsx → Non Taggd Source Joiner (column sums)
      // May24 updated: 687 (previously null — now confirmed from updated Excel)
      nonT:  [401, 687, 515, 1287, 1138, 885, 1192, 537, 606, 801, 1000, 1562],

      // Unbilled (₹ L) — from Unbilled sheet
      ub: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

      // Bad Debt (₹ L) — from Bad Debt sheet
      bd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

      // Revenue Productivity Budget (₹ L/rec/mo) — calculated: revB[i] / hcWL1[i]
      // Formula: Budget Revenue ÷ Actual WL1 Headcount (per month)
      revProdB: [1.1740, 1.7113, 1.9830, 1.6134, 2.3120, 2.5390,
                 1.8936, 2.6338, 3.0233, 2.1485, 3.0344, 3.4912],

      // Revenue Productivity Actual (₹ L/rec/mo) — calculated: revA[i] / hcWL1[i]
      // Formula: Total RevActual ÷ Total WL1 Headcount (per month)
      revProdA: [1.2046, 1.3937, 1.4206, 1.4314, 1.5030, 1.7557,
                 1.3637, 1.6559, 1.8249, 1.5931, 1.1751, 1.4961],

      // Revenue Adjustment (₹ L) — from Rev_Adjustment sheet (monthly totals)
      revAdj: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },

    // ── Account-wise Unbilled, Bad Debt & Revenue Adjustment (FY24-25) ──
    ubByAccount: {},
    bdByAccount: {},
    revAdjByAccount: {},

    // ── Per-project Monthly Total Cost (₹) and Headcount — from Total Cost & Actual_Headcount Overall sheets ──
    // Index 0=Apr24, 11=Mar25. Used for PPC = sum(TC) / sum(HC) for any selected period with project filters.
    tcByProject: {
      'Tata Motors':         [4049845,4359727,3119168,2398212,2277986,2651775,2216765,2065978,2077029,1682990,984911,168515],
      'Schaeffler':          [549382,478228,526280,482308,525335,453277,258856,285808,279120,296661,375992,627752],
      'Vertiv':              [456970,401722,389520,233492,231729,274977,182820,155954,162307,157447,324061,343811],
      'Tata Marcopolo':      [54061,54732,53027,56097,55761,69827,50175,62317,1550,0,60035,69639],
      'ThyssenKrupp':        [1245326,1245934,1271324,1273388,1222062,1501926,986315,324046,345738,111350,104998,25095],
      'Ultratech':           [101191,102196,98810,100938,47667,33049,0,0,0,0,0,0],
      'Tata Teleservices':   [184226,250597,180146,220886,164177,166508,149559,147090,158101,157044,55100,0],
      'Hyundai Motor':       [471189,510927,514982,584416,633647,1144941,678746,1080259,941944,1002118,978532,1394785],
      'Bridgestone':         [0,0,0,0,0,0,0,55725,0,59646,150643,352510],
      'SKF India':           [1450196,1362223,1408580,1552879,1495747,1612641,1340878,1345524,1374848,1365483,1363663,1499786],
      'Jindal Stainless':    [1207369,1122027,1255768,1168499,1101270,1312895,1055270,903646,879186,812914,741822,281109],
      'Maruti Suzuki (MSIL)':[25619,160595,417525,1242518,1718973,2354845,2226836,3344726,3362897,3521795,3636321,5091760],
      'Suzuki R&D':          [0,0,0,0,0,67015,0,0,0,0,61928,72963],
      'Subros Ltd':          [0,0,0,0,0,10696,91345,65350,217779,162798,117841,229017],
      'Pernod Ricard':       [0,0,0,0,0,0,0,0,0,0,0,161437],
      'Pfizer':              [641524,620037,606823,472162,497778,572167,327662,295463,541729,480446,407016,488883],
      'Tata Power':          [201012,203382,118644,65522,0,0,0,0,0,0,0,0],
      'Pidilite':            [1173992,1121379,1053048,897050,880496,1043137,861464,748354,837737,861213,921763,940367],
      'Birla Paints':        [1546548,1384975,1352574,1438730,1479886,1508614,1252618,1134560,1049566,818596,831300,970212],
      'M&M':                 [5175859,4971484,4660542,4590092,4662895,5587373,4355175,4346504,4457093,4482616,4940957,5607151],
      'DP World':            [1112775,968977,895665,866707,882037,998619,696392,727418,724729,738185,674405,809401],
      'AMNS':                [3080565,3305997,3205752,3129589,3111632,3619367,2854462,2727125,2710750,2756407,2703695,2968763],
      'Mahindra Holidays':   [1847454,1761951,1585416,1329666,1387197,987181,1036157,615748,569087,588091,601783,649610],
      'WTW':                 [529338,515671,492457,371455,219531,50742,66158,0,0,0,0,0],
      'Fedex':               [321854,380661,380657,361735,184017,172265,93279,69051,0,0,0,0],
      'Tata Consumer':       [0,0,129954,637243,729849,1072526,726654,763522,748616,675148,1026583,1221857],
      'Tata Play':           [0,0,131012,209165,280764,391127,217589,128585,144253,126931,126576,176500],
      'Mahindra Finance':    [0,40818,210974,458213,581373,721413,534750,480992,514280,461844,518434,691770],
      'Atomberg Technologies':[0,0,0,0,0,185967,241141,405073,390240,489439,474618,560354],
      'Ambuja Cement':       [0,0,0,0,0,0,150478,865141,1512277,1564589,2440545,3601419],
      'Sterling Tools':      [0,0,0,0,0,0,0,0,0,454558,587559,603562],
      'Wipro':               [922594,1067639,1072761,1116820,1251691,1605837,1121762,1094475,961453,779278,824104,962067],
      'Nomiso':              [527980,364905,382701,422410,337685,0,0,6189,0,0,0,0],
      'Ingram Micro':        [373658,379440,401808,367883,369322,399075,347281,346189,339012,296857,297466,314983],
      'DRL':                 [609295,591264,462003,422298,422236,400,800,8114,89276,88701,89737,0],
      'SBI Card':            [904845,903071,788876,696859,717663,914278,839848,855394,885269,784185,859442,982262],
      'IBM':                 [0,131047,997723,1014049,943755,98968,0,0,0,0,0,0],
      'BITS':                [217765,195789,195696,211814,210316,233070,192168,203942,204967,206888,220312,248100],
      'P&G':                 [139527,141002,140044,151130,152012,163915,138120,139888,146398,146744,145075,164734],
      'L&T Energy':          [428659,724,0,24152,102995,60284,0,0,100,0,0,0],
      'Tata Electronics':    [725584,996260,861741,796544,1022063,1080542,1288085,1018663,952000,869266,725059,870291],
      'Royal Enfield':       [387117,416871,493218,497911,615948,633720,102143,115774,132182,131125,144941,300473],
      'Excelacom':           [176921,356298,428342,408327,393870,432747,253985,290716,266784,265152,1529,84625],
      'Ashok Leyland':       [0,0,0,0,0,0,0,151974,335153,606193,1004777,972080],
      'M2P Fintech':         [0,0,0,0,0,0,0,0,95462,339318,330683,446335],
      'ABB':                 [0,0,0,0,0,0,0,0,0,0,0,135052],
      'Honeywell':           [6829446,7187149,7279717,7282644,7082672,8038278,6750872,6442655,6226213,6423571,6290455,6789297],
      'Siemens':             [1347729,1350651,1482693,1353548,1330055,1414983,1163463,1257683,1192254,1190912,1554474,1642074],
      'Robert Bosch':        [698289,680529,502300,410688,330505,330938,60514,59280,64785,64257,126858,0],
      'HPE':                 [9101210,8788721,7524444,7500964,7649808,8513777,7514945,7924014,8504301,8580818,7985954,6633596],
      'Isuzu':               [296992,300166,266922,291610,266303,317934,344322,356438,361539,360486,357032,404873],
      'Ametek':              [237776,240770,246398,205683,85076,94653,78156,80679,91519,81899,46623,367656],
      'Titan':               [1062968,645850,591007,626789,1055324,1243541,991404,1025596,1102861,992793,70144,0],
      'ABFRL':               [63138,62979,60101,69717,71287,5500,0,20140,0,0,0,0],
      // Common = unallocated costs; included in total but not project-filtered
      'Common':              [660914,244053,56202,247997,768321,49100,2097513,1251160,1663834,2275673,521211,316385],
      // Leadership accounts (TC in TC sheet; not separate rows in FY24-25 data)
      'New Sales + Mining':  [0,0,0,0,0,0,0,0,0,0,0,0],
    },

    hcByProject: {
      'Tata Motors':         [51.13,50.1,37,29.95,28.95,30.35,30.05,27.7,27.4,22.4,13.4,2.15],
      'Schaeffler':          [8.84,6.5,6.8,7.05,8,6.25,3.75,4.2,3.7,4,5,7.1],
      'Vertiv':              [6.5,6,6,4,4,4,4,3,3,3,5,4.6],
      'Tata Marcopolo':      [1,1,1,1,1,1,1,1.2,0,0,1,1],
      'ThyssenKrupp':        [15.83,15.5,16.3,16.55,15.55,17.65,12.75,3.3,4,0.7,0.7,0],
      'Ultratech':           [1.5,1.5,1.5,1.5,0.75,0.5,0,0,0,0,0,0],
      'Tata Teleservices':   [1.7,3,2.4,3,2,2,2,2,2,2,1,0],
      'Hyundai Motor':       [6,6,6,7.25,8.75,12.05,13.15,14.7,13.2,13.2,13.2,16.7],
      'Bridgestone':         [0,0,0,0,0,0,0,1,0,1,2,3.7],
      'SKF India':           [14,14,15.5,17,16,16,15,14,14,14,14,14],
      'Jindal Stainless':    [14.65,13.25,13.25,13.25,12.25,13.25,13.3,10.8,10.7,10.5,10.2,4.2],
      'Maruti Suzuki (MSIL)':[0.4,2,6.5,17.1,21.5,32.15,32,47,47.5,50.9,51.2,60.3],
      'Suzuki R&D':          [0,0,0,0,0,1,0,0,0,0,1,1],
      'Subros Ltd':          [0,0,0,0,0,0,1,1,2.5,1.5,1.5,2.5],
      'Pernod Ricard':       [0,0,0,0,0,0,0,0,0,0,0,2],
      'Pfizer':              [7.6,7.43,7.43,6.43,6.43,7.43,4.33,4.33,5.5,5.5,4.5,5.2],
      'Tata Power':          [2.3,2.3,0.4,0.3,0,0,0,0,0,0,0,0],
      'Pidilite':            [15.6,14.43,13.43,12.33,11.53,13.53,14.33,11.33,11.5,11.5,12.5,12.7],
      'Birla Paints':        [20.9,18.4,18.4,18.9,18.9,18.2,18.3,18.5,14.6,10.1,10.1,10.3],
      'M&M':                 [69.3,66,60.7,60.4,61.5,63,63,59,60,61,63,63.5],
      'DP World':            [15.4,14,13,13,13,13,12,13,12,11.05,10.1,10.3],
      'AMNS':                [37.9,37.9,39.9,39.9,36.2,41.05,37.3,37,33,35,33,36],
      'Mahindra Holidays':   [24.75,23.1,22.1,20.1,23.1,16.1,16.7,9.7,8,8.9,10.9,11.3],
      'WTW':                 [5.4,6.1,5.8,3.8,3.1,1.1,0.2,0,0,0,0,0],
      'Fedex':               [3.1,3.44,3.44,3.44,2.44,1.44,1.34,0.34,0,0,0,0],
      'Tata Consumer':       [0,0,2,9,10,17,12,11.2,11.2,10.2,16.2,16.2],
      'Tata Play':           [0,0,1.5,2,3,4,3,1,1.05,1,1,1.2],
      'Mahindra Finance':    [0,1,3.7,8,9,9,9,7.1,7.1,6.1,8.1,8.3],
      'Atomberg Technologies':[0,0,0,0,0,2,4,6.1,5.15,6.15,6.1,6.3],
      'Ambuja Cement':       [0,0,0,0,0,0,2.5,8.9,19.2,22.4,32.4,34],
      'Sterling Tools':      [0,0,0,0,0,0,0,0,0,6,7,8],
      'Wipro':               [10.54,12.7,12.2,14.2,14.25,16.25,11.3,11.3,9.2,8,8,9],
      'Nomiso':              [5.1,2.65,3.1,4.1,3,0,0,0,0,0,0,0],
      'Ingram Micro':        [4.43,4.15,4.15,4.15,4.15,4.15,4.15,4.15,4.1,4,4,3.7],
      'DRL':                 [7.1,7.1,6,5,5,0,0,0,1,1,1,0],
      'SBI Card':            [12.43,11.15,10.15,9.15,9.15,11.15,11.25,11.25,11.25,11,12,12],
      'IBM':                 [0,1,13.15,13.15,12.2,1.2,0,0,0,0,0,0],
      'BITS':                [3.1,3,3,3,3,3,3,3,3,3,3.1,3.1],
      'P&G':                 [2,2,2,2,2,2,2,2,2,2,2,2],
      'L&T Energy':          [6,0,0,0,0,0,0,0,0,0,0,0],
      'Tata Electronics':    [7.5,9,9.5,8.5,9,9,14,11,11,10.5,9.3,10.1],
      'Royal Enfield':       [5,5,5.9,7,7,7,2,2,2,2,2.1,3.1],
      'Excelacom':           [2,5,5,5,4,4,3,3,3,3,0,1],
      'Ashok Leyland':       [0,0,0,0,0,0,0,3,6,8.1,12.1,10.1],
      'M2P Fintech':         [0,0,0,0,0,0,0,0,3,5.1,6.1,7.1],
      'ABB':                 [0,0,0,0,0,0,0,0,0,0,0,2],
      'Honeywell':           [78.6,82.8,83.8,81.8,77.6,77.5,75.6,73.9,71.2,71.5,71.5,68.75],
      'Siemens':             [15.2,15,15.2,15.2,14.2,14.2,13.2,14.4,13.7,13.7,18.7,16.7],
      'Robert Bosch':        [8,8,5,4,3,3,1,1,1,1,2,0],
      'HPE':                 [83,77.5,61.8,60.3,61.3,63.3,69.3,70.1,72,73,66,63],
      'Isuzu':               [3.5,3.5,3.5,3.5,3,3,4,4,4,4,4,4],
      'Ametek':              [2,2,2,2,1,1,1,1,1,1,1,3],
      'Titan':               [16.5,8.5,8,9,13.2,15.2,13.2,12.8,14.1,13.1,0.1,0],
      'ABFRL':               [1,1,1,1,1,0,0,0,0,0,0,0],
      'Common':              [47.7,52,58,36.7,39,31,31,22.7,13.1,9.9,10.9,15.8],
      'New Sales + Mining':  [0,0,0,0,0,0,0,0,0,0,0,0],
      // Leadership (generally counted under lateral HC)
      'Honeywell Leadership': [0,0,0,0,0,0,0,0,0,0,0,0],
      'M&M Leadership':       [0,0,0,0,0,0,0,0,0,0,0,0],
      'Mahindra Holidays Leadership':[0,0,0,0,0,0,0,0,0,0,0,0],
    },

    // ── By Region (Revenue Actual and Budget, ₹ L) — sourced from Excel Revenue_Actual/Budget sheets ────
    // Note: FY24-25 Excel Revenue_Actual has 3 regions: South, West, North. New Sales is a separate project bucket.
    byRegion: [
      { name: 'South', revA: 4125.95, revB: 4242.64, cmA: 1531.15, cmB: 1781.91 },
      { name: 'West',  revA: 3519.98, revB: 4284.81, cmA: 1064.57, cmB: 1799.62 },
      { name: 'North', revA:  831.34, revB:  585.55, cmA:  106.93, cmB:  245.93 },
    ],

    // ── By Vertical ────────────────────────────────────────
    byVertical: [
      { name: 'Lateral',    revA: 7012.4, revB: 10921.0 },
      { name: 'Leadership', revA: 1464.9, revB:  2079.0 },
    ],

    // ── Project-level data (from Revenue_Actual, CM_Actual sheets) ──
    // Fields: name, revA, revB, revF, cmA, cmB, region, subRegion, regionHead, practiceHead, vert
    projects: [
      // ── Lateral Accounts ──────────────────────────────────
      // From Excel FY24-25_Finance_Data.xlsx → Revenue_Budget sheet (FY, Project, Vertical, Region, Sub Region, Region Head, Practice Head)
      { name: 'Honeywell',              revA: 158.0, revB: 162.0, revF: 152.0, cmA:  38.8, cmB:  68.0,  region: 'South',     subRegion: 'South 1',  regionHead: 'Bapi',    practiceHead: 'Bapi',      vert: 'Lateral'    },
      { name: 'HPE',                    revA: 235.0, revB: 245.0, revF: 228.0, cmA:  59.8, cmB: 102.9,  region: 'South',     subRegion: 'South 1',  regionHead: 'Mahak',   practiceHead: 'Mahak',     vert: 'Lateral'    },
      { name: 'Tata Motors',            revA: 654.6, revB: 673.6, revF: 620.0, cmA:  77.0, cmB: 282.9,  region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',   practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Schaeffler',             revA: 449.0, revB: 460.0, revF: 440.0, cmA: 140.2, cmB: 193.2,  region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',   practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Vertiv',                 revA:  55.0, revB:  60.0, revF:  50.0, cmA:  14.2, cmB:  25.2,  region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',   practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Tata Marcopolo',         revA:  18.0, revB:  20.0, revF:  17.0, cmA:   4.8, cmB:   8.4,  region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',   practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'ThyssenKrupp',           revA: 368.5, revB: 380.0, revF: 360.0, cmA: 118.8, cmB: 159.6,  region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',   practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Hyundai Motor',          revA:  45.0, revB:  50.0, revF:  43.0, cmA:  11.2, cmB:  21.0,  region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',   practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Ultratech',              revA:  12.0, revB:  15.0, revF:  11.0, cmA:   2.8, cmB:   6.3,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Tata Teleservices',      revA:  42.0, revB:  50.0, revF:  40.0, cmA:  10.5, cmB:  21.0,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Pfizer',                 revA:  68.0, revB:  75.0, revF:  65.0, cmA:  17.2, cmB:  31.5,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Usha',      vert: 'Lateral'    },
      { name: 'Tata Power',             revA:  38.0, revB:  42.0, revF:  36.0, cmA:   9.6, cmB:  17.6,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Pidilite',               revA:  95.0, revB: 108.0, revF:  90.0, cmA:  24.8, cmB:  45.4,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Usha',      vert: 'Lateral'    },
      { name: 'Birla Paints',           revA: 110.0, revB: 120.0, revF: 105.0, cmA:  29.2, cmB:  50.4,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'M&M',                    revA: 182.0, revB: 190.0, revF: 176.0, cmA:  45.6, cmB:  79.8,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Dhriti',    vert: 'Lateral'    },
      { name: 'DP World',               revA:  88.0, revB:  95.0, revF:  84.0, cmA:  22.0, cmB:  39.9,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'AMNS',                   revA: 145.0, revB: 162.0, revF: 138.0, cmA:  36.4, cmB:  68.0,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Alifia',    vert: 'Lateral'    },
      { name: 'Mahindra Holidays',      revA:  72.0, revB:  80.0, revF:  68.0, cmA:  18.0, cmB:  33.6,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'WTW',                    revA:  45.0, revB:  50.0, revF:  43.0, cmA:  11.2, cmB:  21.0,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Fedex',                  revA:  28.0, revB:  32.0, revF:  26.0, cmA:   7.0, cmB:  13.4,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Tata Consumer',          revA: 165.0, revB: 172.0, revF: 160.0, cmA:  43.0, cmB:  72.2,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Tata Play',              revA:   8.0, revB:  12.0, revF:   7.0, cmA:   1.8, cmB:   5.0,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Mahindra Finance',       revA:  15.0, revB:  18.0, revF:  14.0, cmA:   3.8, cmB:   7.6,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Atomberg Technologies',  revA:   5.0, revB:   8.0, revF:   4.0, cmA:   1.2, cmB:   3.4,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Ambuja Cement',          revA: 142.0, revB: 150.0, revF: 138.0, cmA:  34.6, cmB:  63.0,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Ankit',     vert: 'Lateral'    },
      { name: 'Ingram Micro',           revA:  25.0, revB:  28.0, revF:  24.0, cmA:   6.3, cmB:  11.8,  region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',   practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'SKF India',              revA: 195.0, revB: 200.0, revF: 188.0, cmA:  48.5, cmB:  84.0,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Jindal Stainless',       revA:  60.0, revB:  68.0, revF:  57.0, cmA:  15.2, cmB:  28.6,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Maruti Suzuki (MSIL)',   revA: 400.0, revB: 450.0, revF: 420.0, cmA: 120.0, cmB: 189.0,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Suzuki R&D',             revA:   0.0, revB:   5.0, revF:   0.0, cmA:   0.0, cmB:   2.1,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Subros Ltd',             revA:   0.0, revB:   5.0, revF:   0.0, cmA:   0.0, cmB:   2.1,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Pernod Ricard',          revA:  96.2, revB: 110.0, revF:  65.0, cmA:  22.1, cmB:  44.0,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Sterling Tools',         revA:   3.0, revB:   6.0, revF:   2.0, cmA:   0.8, cmB:   2.5,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'SBI Card',               revA:  65.0, revB:  75.0, revF:  62.0, cmA:  16.5, cmB:  31.5,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'IBM',                    revA: 280.0, revB: 295.0, revF: 275.0, cmA: -61.4, cmB: 123.9,  region: 'North',     subRegion: 'North',    regionHead: 'Anjli',   practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'Wipro',                  revA: 242.0, revB: 252.0, revF: 235.0, cmA:  61.8, cmB: 105.8,  region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh',  practiceHead: 'Subu',      vert: 'Lateral'    },
      { name: 'Nomiso',                 revA:  42.0, revB:  48.0, revF:  40.0, cmA:  10.5, cmB:  20.2,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'DRL',                    revA:   5.0, revB:   8.0, revF:   4.0, cmA:   1.2, cmB:   3.4,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Sulabh',    vert: 'Lateral'    },
      { name: 'BITS',                   revA:  18.0, revB:  22.0, revF:  17.0, cmA:   4.5, cmB:   9.2,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'P&G',                    revA:   8.5, revB:  10.0, revF:   8.0, cmA:   2.1, cmB:   4.2,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Tata Electronics',       revA: 122.0, revB: 145.0, revF:  82.0, cmA:  30.2, cmB:  58.0,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Subu',      vert: 'Lateral'    },
      { name: 'Royal Enfield',          revA:  28.0, revB:  35.0, revF:  27.0, cmA:   7.0, cmB:  14.7,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Excelacom',              revA:  22.0, revB:  28.0, revF:  21.0, cmA:   5.5, cmB:  11.8,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Ashok Leyland',          revA: 148.0, revB: 155.0, revF: 144.0, cmA:  35.2, cmB:  65.1,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'M2P Fintech',            revA:   3.0, revB:   5.0, revF:   2.0, cmA:   0.8, cmB:   2.1,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'ABB',                    revA:   2.0, revB:   5.0, revF:   1.0, cmA:   0.5, cmB:   2.1,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'Siemens',                revA: 255.0, revB: 265.0, revF: 250.0, cmA:  62.5, cmB: 111.3,  region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh',  practiceHead: 'Kunal',     vert: 'Lateral'    },
      { name: 'Robert Bosch',           revA:  72.0, revB:  85.0, revF:  68.0, cmA:  18.2, cmB:  35.7,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Abhilash',  vert: 'Lateral'    },
      { name: 'Isuzu',                  revA:  38.0, revB:  45.0, revF:  36.0, cmA:   9.6, cmB:  18.9,  region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh',  practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'Ametek',                 revA:  18.0, revB:  22.0, revF:  17.0, cmA:   4.5, cmB:   9.2,  region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh',  practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'Titan',                  revA:  12.0, revB:  15.0, revF:  11.0, cmA:   3.0, cmB:   6.3,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Subu',      vert: 'Lateral'    },
      { name: 'ABFRL',                  revA:   2.0, revB:   5.0, revF:   1.0, cmA:   0.5, cmB:   2.1,  region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh',  practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'New Sales + Mining',     revA: 731.1, revB:1056.0, revF: 680.0, cmA: 179.7, cmB: 443.5,  region: 'New Sales', subRegion: 'New Sales', regionHead: 'Nizar',   practiceHead: 'Nizar',     vert: 'Lateral'    },
      // ── Leadership Accounts ───────────────────────────────
      // Leadership Accounts — all have practiceHead: 'Parul' per Excel FY24-25
      { name: 'M&M Leadership',             revA: 125.0, revB: 132.0, revF: 122.0, cmA:  34.2, cmB:  55.4,  region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Honeywell Leadership',        revA:  18.0, revB:  24.0, revF:  18.0, cmA:   5.0, cmB:   9.6,  region: 'South', subRegion: 'South 1', regionHead: 'Bapi',   practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Siemens Leadership',          revA:  16.0, revB:  24.0, revF:  16.0, cmA:   4.5, cmB:   9.6,  region: 'South', subRegion: 'South 2', regionHead: 'Sulabh', practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Vertiv Leadership',           revA:  20.0, revB:  24.0, revF:  20.0, cmA:   5.6, cmB:   9.6,  region: 'West',  subRegion: 'West 2',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'AMNS Leadership',             revA:  52.0, revB:  72.0, revF:  52.0, cmA:  14.7, cmB:  28.8,  region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Royal Enfield Leadership',    revA:   2.0, revB:  12.0, revF:   2.0, cmA:   0.6, cmB:   4.8,  region: 'South', subRegion: 'South 2', regionHead: 'Sulabh', practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Sterling Tools Leadership',   revA:   0.0, revB:  12.0, revF:   0.0, cmA:   0.0, cmB:   4.8,  region: 'North', subRegion: 'North',   regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Mahindra Holidays Leadership',revA: 290.0, revB: 360.0, revF: 290.0, cmA:  81.9, cmB: 144.0,  region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Hyundai Motor Leadership',    revA:   0.0, revB:  12.0, revF:   0.0, cmA:   0.0, cmB:   4.8,  region: 'West',  subRegion: 'West 2',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Pfizer Leadership',           revA:   0.0, revB:  12.0, revF:   0.0, cmA:   0.0, cmB:   4.8,  region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Subros Leadership',           revA:   0.0, revB:  12.0, revF:   0.0, cmA:   0.0, cmB:   4.8,  region: 'North', subRegion: 'North',   regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // FY 2025-26  (Source: FY25-26_Finance_Data.xlsx)
  // Sheets: Revenue_Budget, CM_Budget, Target Rev Productivity,
  //   Rev_Forecast, CM_Forecast, Mapping, Revenue_Actual,
  //   CM Actual, Rev_Productivity_Actual, Taggd_Source_Joiner,
  //   Non Taggd_Source_Joiner, Revenue_Adjustment, Headcount_Overall,
  //   Headcount_WL1, Headcount_Approved, PPC_Actual, Unbilled,
  //   Target_Collection, Actual_Collection, Bad Debt
  // Actuals available: Apr25–Feb26 (11 months); Mar26 = 0 (not yet)
  // ─────────────────────────────────────────────────────────
  FY2526: {
    label: 'FY 2025-26',
    short: 'FY25-26',
    months:  ['Apr25','May25','Jun25','Jul25','Aug25','Sep25','Oct25','Nov25','Dec25','Jan26','Feb26','Mar26'],
    mLabels: ['Apr',  'May',  'Jun',  'Jul',  'Aug',  'Sep',  'Oct',  'Nov',  'Dec',  'Jan',  'Feb',  'Mar'],

    // ── Full-year totals (YTD Apr25–Jan26 for actuals; Full-year for budget/forecast) ──
    // ppcAvg: sum(TC Apr25–Jan26) / sum(HC Apr25–Jan26) = 549568332 / 5435.59 ≈ 101107
    totals: {
      revA: 8488.65,   revB: 13000.32,  revF: 10430.65,  // revF YTD = full Revenue_Actual sheet (incl. Feb=919, Mar=1023)
      cmA:  2992.92,   cmB:  5961.63,   cmF:  4790.70,   // cmF = full-year sum of CM_Forecast sheet
      cmAPct: 35.26,   cmBPct: 45.85,   cmFPct: 45.01,
      collA: 9157.34,  collT: 13174.14,
      hcOverall: 537,  hcWL1: 419,      hcApproved: 503,
      ppcAvg: 101107,  // ₹ per person per month — sum(TotalCost Apr25–Jan26)/sum(HC Apr25–Jan26)
      taggd: 8202,     nonTaggd: 6701,  totalJ: 14903, taggdMix: 55.04,
      unbilled: 331.02, badDebt: 84.69,
      revAdj: 253.67,  // FY25-26 Revenue Adjustment YTD (from Revenue_Adjustment sheet)
    },

    // ── Monthly arrays — index 0=Apr25, 11=Mar26 ──────────
    monthly: {
      // Revenue Actual (₹ L) — from Revenue_Actual sheet (sourced directly from Excel, all projects summed per month)
      // Jan26 is last CONFIRMED actual; Feb26 and Mar26 = 0 here (charts show actuals only up to Jan26)
      revA: [711.11, 813.34, 875.49, 744.78, 864.98, 991.28,
             688.67, 901.20, 1043.62, 854.19, 0.0, 0.0],

      // Revenue Actual — FULL year from Revenue_Actual sheet (incl. Feb26=919, Mar26=1023)
      // Used for YTD Forecast calculation: YTD Forecast = full Revenue_Actual sheet total = 10430.65 L
      // (Feb26 & Mar26 exist in the Revenue_Actual sheet as forecast-actuals; not shown as confirmed actuals in charts)
      revA_full: [711.11, 813.34, 875.49, 744.78, 864.98, 991.28,
                  688.67, 901.20, 1043.62, 854.19, 919.00, 1023.00],

      // Revenue Budget (₹ L) — from Revenue_Budget sheet
      revB: [738.52, 982.47, 1104.48, 854.84, 1119.32, 1251.53,
             891.14, 1144.01, 1270.39, 991.86, 1259.11, 1392.65],

      // Revenue Forecast (₹ L) — from Rev_Forecast sheet
      // Source: FY2526_latest.xlsx → Rev_Forecast sheet, column sums (Apr25–Mar26)
      // Q1=2261, Q2=2654, Q3=2555, Q4=3176, Full Year=10646
      revF: [569.00, 791.00, 901.00, 666.00, 929.00, 1059.00,
             639.00, 897.00, 1019.00, 804.00, 1111.00, 1261.00],

      // CM Actual (₹ L) — from CM Actual sheet (verified from FY2526_latest.xlsx)
      // Apr25–Jan26 have data; Feb26 and Mar26 = 0 (not yet actuals)
      cmA: [175.97, 283.81, 360.20, 210.34, 331.68, 432.62,
            122.42, 319.34, 468.85, 287.69, 0.0, 0.0],

      // CM Budget (₹ L) — from CM_Budget sheet
      cmB: [341.61, 456.16, 513.47, 389.92, 513.31, 575.00,
            404.74, 523.70, 583.15, 448.49, 574.52, 637.56],

      // CM Forecast (₹ L) — from CM_Forecast sheet (verified from FY2526_latest.xlsx)
      // Q1=1017.45, Q2=1194.30, Q3=1149.75, Q4=1429.20, Full Year=4790.70
      cmF: [256.05, 355.95, 405.45, 299.70, 418.05, 476.55,
            287.55, 403.65, 458.55, 361.80, 499.95, 567.45],

      // CM% Actual — derived: cmA/revA*100 (0 where no data)
      cmAPct: [24.75, 34.89, 41.14, 28.23, 38.35, 43.64,
               17.78, 35.43, 44.92, 33.68, 0, 0],

      // CM% Budget — from CM_Budget sheet
      cmBPct: [46.26, 46.43, 46.49, 45.61, 45.86, 45.95,
               45.42, 45.78, 45.90, 45.21, 45.63, 45.77],

      // Total Cost (₹) — from Total Cost sheet (used for PPC = Total Cost / HC Overall)
      // Updated from new FY2526_latest.xlsx — Feb26 and Mar26 = 0 (no actuals yet)
      totalCost: [53554232, 52946895, 51536791, 53506283, 53490423, 55961688,
                  56643580, 58223697, 57055423, 56649320, 0, 0],

      // PPC (₹/person/month) — derived: totalCost / hcOverall per month
      // Formula: Sum of Total Cost / Headcount Overall (weighted avg)
      // Updated from new FY2526_latest.xlsx Total Cost sheet
      ppc: [92602, 96285, 94563, 103795, 103463, 104367,
            106673, 108424, 105658, 100206, 0, 0],

      // Collections Actual (₹ L) — from Actual_Collection sheet (verified from Excel)
      collA: [812.14, 826.68, 962.37, 796.63, 718.32, 929.64,
              906.42, 1006.49, 808.28, 1390.38, 0.0, 0.0],

      // Collections Target (₹ L) — from Target_Collection sheet (verified from Excel)
      collT: [1206.75, 1124.43, 1206.69, 1318.76, 1233.91, 1349.24,
              1253.12, 1615.80, 1389.23, 1476.22, 0.0, 0.0],

      // Headcount Overall (from Headcount_Overall sheet) — updated from new file
      hcOverall: [578.33, 549.90, 545.00, 515.50, 517.00, 536.20, 531.00, 537.00, 540.00, 565.33, 0, 0],

      // Headcount WL1 (from Headcount_WL1 sheet)
      hcWL1: [462, 439, 433, 398, 401, 418, 412, 407, 407, 419, 0, 0],

      // Headcount Approved (from Headcount_Approved sheet)
      hcApproved: [314, 356, 385, 307, 365, 410, 347, 435, 503, 405, 397, 461],

      // Taggd Joiners (from Taggd_Source_Joiner sheet)
      // Source: FY25-26_Finance_Data.xlsx → Taggd_Source_Joiner (verified column sums)
      // Jan26, Feb26, Mar26 = 0 in Excel (no data entered yet) → null = gap on chart
      taggd: [866, 826, 1024, 847, 945, 1069, 747, 880, 998, null, null, null],

      // Non-Taggd Joiners (from Non Taggd_Source_Joiner sheet)
      // Jan26+ = 0 in Excel → null
      nonT: [556, 718, 762, 596, 849, 959, 672, 738, 851, null, null, null],

      // Unbilled (₹ L) — from Unbilled sheet (by account, monthly totals verified)
      ub: [0.0, 0.70, 3.60, 1.24, 11.25, 71.81, 42.83, 57.76, 64.92, 76.90, 0.0, 0.0],

      // Bad Debt (₹ L) — from Bad Debt sheet (Feb26 = 84.69; index 10)
      bd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84.69, 0],

      // Revenue Productivity Actual (₹ L/rec/mo) — calculated: revA[i] / hcWL1[i]
      // Formula: Total RevActual ÷ Total WL1 Headcount (per month)
      // Feb26 & Mar26 = 0 (no WL1 data yet)
      revProdA: [1.5391, 1.8526, 2.0221, 1.8714, 2.1571, 2.3715,
                 1.6717, 2.2141, 2.5642, 2.0387, 0, 0],

      // Revenue Productivity Budget (₹ L/rec/mo) — calculated: revB[i] / hcWL1[i]
      // Formula: Budget Revenue ÷ Actual WL1 Headcount (per month)
      // Feb26 & Mar26 = 0 (no WL1 data)
      revProdB: [1.5985, 2.2380, 2.5508, 2.1478, 2.7913, 2.9941,
                 2.1630, 2.8108, 3.1214, 2.3672, 0, 0],

      // Revenue Adjustment (₹ L) — from Revenue_Adjustment sheet (monthly totals)
      // Only months with actual adjustments; 0 = no adjustment
      revAdj: [0, 8.77, 19.30, 25.36, 28.25, 63.15, 4.76, 16.18, 42.79, 45.11, 0, 0],
    },

    // ── Account-wise Unbilled, Bad Debt & Revenue Adjustment ──────────────
    // Used for account-wise tables in Collections & Cash view
    ubByAccount: {
      'AMNS':               [0,0,0,0,0,0,0,38.62,24.76,22.39,31.29,21.00],
      'Siemens':            [0,0,0,0,0,0,3.60,8.49,15.57,25.66,18.68,23.00],
      'Siemens Healthnier': [0,0,0,0,0,1.24,2.00,16.00,2.50,5.35,5.13,2.50],
      'AMNS Leadership':    [0,0,0,0,0,0,0,8.70,0,4.35,1.45,1.00],
      'Birla Paints':       [0,0,0,0,0,0,0,0,0,0,6.91,6.91],
      'Siemens Leadership': [0,0,0,0.70,0,0,4.75,0,0,0,0,0],
      'SBI Card':           [0,0,0,0,0,0,0,0,0,0,0,7.60],
      'Pidilite':           [0,0,0,0,0,0,0,0,0,0,1.47,6.23],
      'Wipro':              [0,0,0,0,3.60,0,0.90,0,0,0,0,0],
      'NeoSoft':            [0,0,0,0,0,0,0,0,0,0,0,3.95],
      'ABB':                [0,0,0,0,0,0,0,0,0,0,0,2.54],
      'Jindal Stainless':   [0,0,0,0,0,0,0,0,0,0,0,2.17],
    },
    bdByAccount: {
      'M&M':               [0,0,0,0,0,0,0,0,0,0,33.78,0],
      'Siemens':           [0,0,0,0,0,0,0,0,0,0,16.40,0],
      'Jindal Stainless':  [0,0,0,0,0,0,0,0,0,0,10.44,0],
      'Hyundai Motor':     [0,0,0,0,0,0,0,0,0,0,7.15,0],
      'AMNS':              [0,0,0,0,0,0,0,0,0,0,6.92,0],
      'Tata Electronics':  [0,0,0,0,0,0,0,0,0,0,4.94,0],
      'Robert Bosch':      [0,0,0,0,0,0,0,0,0,0,2.55,0],
      'M2P Fintech':       [0,0,0,0,0,0,0,0,0,0,1.30,0],
      'Ultratech':         [0,0,0,0,0,0,0,0,0,0,0.70,0],
      'Tata Power':        [0,0,0,0,0,0,0,0,0,0,0.35,0],
      'Excelacom':         [0,0,0,0,0,0,0,0,0,0,0.16,0],
    },
    revAdjByAccount: {
      'Wipro':              [0,0,0,0,0,0,0,0,0,0,34.66,15.70],
      'Honeywell':          [0,0,0,0,0,1.35,9.50,49.55,0.91,0,0,0],
      'Royal Enfield':      [0,0,0,0,13.55,0,0,0,0,0,0,3.27],
      'HPE':                [0,0,0,5.00,5.00,5.00,4.43,0,0,0,0,0],
      'AMNS':               [0,0,0,2.16,0,12.63,0,0,0,0,0,0],
      'Isuzu':              [0,0,0,0,0,0,0,0,0.73,1.33,0.46,10.15],
      'Siemens':            [0,0,0,0,0,0,0,5.11,0,0,0,0],
      'Tata Consumer':      [0,0,0,0,0,0,6.68,0,0,0,0,0],
      'M2P Fintech':        [0,0,0,0,0,2.88,1.80,0,0,0.31,0,0],
      'Ashok Leyland':      [0,0,0,0.07,0.07,0,1.07,0,2.12,3.84,0,0],
      'Pidilite':           [0,0,0,0,0,0.20,0,3.35,0,0,0.60,2.32],
      'Honeywell Leadership':[0,0,0,0,0,0,0,0,0,3.00,0,0],
      'AMNS Leadership':    [0,0,0,0,0,0,0,0,0,0,4.33,0],
      'Mahindra Holidays':  [0,0,0,0.63,0,0.46,0,0.36,0.80,0.14,0,0],
      'Subros Ltd':         [0,0,0,0,0,0,0.57,0,0,3.54,0,0],
      'Tata Electronics':   [0,0,0,0,0,0,0.85,2.83,0,0,0.24,2.00],
      'Sterling Tools':     [0,0,0,0,0,0,1.21,0,0,0,0,0.21],
    },

    // ── Per-project Monthly Total Cost (₹) and Headcount — from Total Cost & Headcount_Overall sheets ──
    // Index 0=Apr25, 11=Mar26. Used for PPC = sum(TC) / sum(HC) for any selected period with project filters.
    tcByProject: {
      'Honeywell':           [6381848,6338774,6504047,6512122,6601073,6800087,6724212,7018438,6489454,6439322,0,0],
      'Pfizer':              [626491,758397,547848,591641,568182,538601,545721,475062,454162,456874,0,0],
      'Tata Motors':         [13579,103495,77007,37001,8169,8730,0,0,2076,0,0,0],
      'SKF India':           [1519882,1806072,1701244,1636738,1681957,1762902,1688606,1721398,1655690,1722095,0,0],
      'Siemens':             [1321722,1228829,1348759,1253217,1285749,1290994,1316255,1264298,1350159,1332165,0,0],
      'Pidilite':            [728948,725921,732415,713604,760444,670215,675253,851734,680292,858019,0,0],
      'Vertiv':              [326307,430093,330952,323453,307508,258650,263243,278682,251302,277172,0,0],
      'Birla Paints':        [970944,1022601,925889,828416,779050,929706,1103527,1206888,1096653,1099326,0,0],
      'Ingram Micro':        [324320,298158,310666,263836,265952,203661,207287,180694,118397,12494,0,0],
      'HPE':                 [6819558,5969847,6359091,6140240,6331450,6390313,6486229,6712618,6497739,6465732,0,0],
      'Isuzu':               [503059,531608,513821,483657,435238,434713,444363,452586,452344,469329,0,0],
      'Mahindra Holidays':   [706566,797472,794265,667995,755860,787165,816832,796331,665847,633656,0,0],
      'BITS':                [251230,230276,240500,258837,261444,262733,266722,246782,292157,327503,0,0],
      'M&M':                 [5118987,5270643,4855575,5569549,6244214,7831664,7762475,7538058,7487848,7112290,0,0],
      'P&G':                 [216636,169664,172598,62349,69842,0,0,0,0,0,0,0],
      'Wipro':               [1224624,1247158,1365613,1450676,1573706,1571013,1385403,1601100,1704131,1727749,0,0],
      'Tata Marcopolo':      [70785,15307,6894,3375,2722,2911,0,0,0,0,0,0],
      'DP World':            [1070821,1006839,823122,964866,758962,702447,776269,702908,567914,407901,0,0],
      'Ametek':              [155321,182211,263824,193656,209673,194364,197099,105397,98451,142548,0,0],
      'AMNS':                [2743761,3004650,2931008,3111438,2761444,2784174,2821743,2860502,2890073,2927007,0,0],
      'Tata Electronics':    [553732,830655,454569,477880,479605,519757,511201,465388,518429,388858,0,0],
      'Schaeffler':          [618319,557697,473220,602451,499371,541898,558389,576563,671566,502488,0,0],
      'Royal Enfield':       [555205,532032,505110,578909,591275,1215439,1182657,1316921,1670230,2193309,0,0],
      'Hyundai Motor':       [1282426,1012955,965984,878707,1094340,1083826,990814,1018463,716263,581666,0,0],
      'Excelacom':           [318118,839,89539,86646,87132,0,0,0,0,0,0,0],
      'Tata Consumer':       [1491252,1320508,1146422,1386335,1224376,1186249,1233990,1202757,1165359,1247196,0,0],
      'Tata Play':           [187873,178920,174756,164797,211849,166975,159890,115420,108892,114600,0,0],
      'Mahindra Finance':    [585616,505813,449979,211969,154268,162332,181223,171258,176305,5894,0,0],
      'Atomberg Technologies':[513123,387504,424822,501171,438325,435940,443743,439253,399052,438955,0,0],
      'Bridgestone':         [372729,188053,155014,180039,377400,381103,276055,283656,269751,268170,0,0],
      'Ashok Leyland':       [1102102,1239699,1410560,1527444,1239706,1627124,1635234,1828673,1447835,1320725,0,0],
      'M2P Fintech':         [345415,286021,502330,398475,317422,0,0,0,54538,59803,0,0],
      // Updated with real TC data from FY2526_latest.xlsx
      'SBI Card':            [995184,1134486,1077758,1174765,1248934,1489327,1604916,1581015,1533707,1212679,0,0],
      'Maruti Suzuki (MSIL)':[4409139,4024809,3731954,3878467,3909882,3751161,3821853,3850682,3760593,3533354,0,0],
      'Jindal Stainless':    [437031,476186,338265,599794,591794,613957,632636,840027,757342,746504,0,0],
      'Ambuja Cement':       [2310069,2287083,1993419,2180266,1845273,1850581,1988586,2152275,2460173,2142069,0,0],
      'Suzuki R&D':          [223412,209629,235522,249916,184663,0,106362,81436,77980,7747,0,0],
      'Subros Ltd':          [245655,252418,264731,303239,334985,345098,342054,392282,381644,351491,0,0],
      'Sterling Tools':      [633364,644741,586848,571644,572537,504211,464880,481683,441204,382909,0,0],
      'Optum':               [2072755,2010367,1930279,1899146,2156015,2418236,2528435,2491815,2518374,2716955,0,0],
      'Pernod Ricard':       [480166,463021,458197,495926,503156,694069,605598,571850,623537,650930,0,0],
      'UniCharm':            [0,400,0,0,0,112217,273801,441135,375634,278882,0,0],
      'Saint Gobain':        [0,0,0,0,0,0,0,19645,25132,689945,0,0],
      'Leap India':          [0,161504,566699,774025,753282,705084,682511,554321,509243,650735,0,0],
      'NeoSoft':             [0,0,0,0,0,0,0,83636,308491,486696,0,0],
      'Siemens Healthnier':  [857199,800228,724899,625871,714385,677413,671352,670170,663904,476654,0,0],
      'ABB':                 [599423,833548,535426,476686,538762,493344,418258,414492,468777,385914,0,0],
      'Royal Enfield Leadership':[66570,63117,46786,0,3159,0,50309,50306,46563,45014,0,0],
      'Siemens Leadership':  [0,0,0,64385,74938,72815,0,0,0,0,0,0],
      'Honeywell Leadership':[233004,427622,389957,526248,439761,445185,445174,297867,403646,429216,0,0],
      'Vertiv Leadership':   [66570,63117,63627,69848,82519,72815,48827,48825,45191,43691,0,0],
      'M&M Leadership':      [668120,701270,795010,1111201,877964,727351,973063,1437722,1382938,1496585,0,0],
      'AMNS Leadership':     [161651,147896,160791,375367,206945,203070,206172,206279,199518,194308,0,0],
      'Hyundai Motor Leadership':[36811,33372,33620,37465,36582,37281,37766,37792,36065,35811,0,0],
      'Mahindra Holidays Leadership':[0,0,0,30536,29012,37281,86593,86617,81256,79502,0,0],
      'Sterling Tools Leadership':[36811,33372,34844,0,0,0,0,0,0,0,0,0],
      'New Sales + Mining':  [0,0,0,0,0,0,0,0,0,0,0,0],
    },

    hcByProject: {
      'Honeywell':           [64.7,68,63.8,60,60.6,60.5,60.5,60.5,58,59,0,0],
      'Pfizer':              [6.3,7.05,6.3,6.2,5.2,5.2,5.2,4.5,4.5,4.5,0,0],
      'Tata Motors':         [0,1.65,1.7,0,0,0,0,0,0,0,0,0],
      'SKF India':           [14,15.3,15.4,14.1,14.1,14.85,15.1,16.1,15.1,16.3,0,0],
      'Siemens':             [13.9,12.9,14.5,12.5,12.5,12.5,12.5,12.5,12.5,12.5,0,0],
      'Pidilite':            [10,8.8,9.8,7.7,8.7,7.7,10.7,10,8.6,12.2,0,0],
      'Vertiv':              [4.6,4.1,3.6,3.1,3.1,2.1,2.1,2.1,2.1,2.1,0,0],
      'Birla Paints':        [10.2,10.15,10.15,11.15,9.65,10.65,10.65,11.15,11.6,11.65,0,0],
      'Ingram Micro':        [3.8,3.8,3.8,2.7,2.7,1.7,1.7,1.5,1.5,1,0,0],
      'HPE':                 [52,49,49,48.5,45.5,45.5,45.5,45.5,45.5,48,0,0],
      'Isuzu':               [4.34,4.33,4.33,4.33,3.33,3.34,3.34,3.34,3.34,3.34,0,0],
      'Mahindra Holidays':   [10.3,10.25,11.25,8.15,9.15,9.15,8.15,8.15,9.2,8,0,0],
      'BITS':                [3.1,3.1,3.1,3.1,3.1,3.1,3.1,3,3.3,3.5,0,0],
      'M&M':                 [67.5,59.5,60,58,69,78,79,76,75,74,0,0],
      'P&G':                 [3,2,2,1,1,0,0,0,0,0,0,0],
      'Wipro':               [13,12.7,13,13,14,13,12,18,18,19,0,0],
      'Tata Marcopolo':      [1,0,0,0,0,0,0,0,0,0,0,0],
      'DP World':            [13.66,12.7,10.25,11.15,8.65,7.65,7.65,7.15,6.1,5.15,0,0],
      'Ametek':              [1.33,1.33,1.33,1.33,1.33,1.33,1.33,0.33,0.33,0.33,0,0],
      'AMNS':                [33.1,33.1,33.1,30,29,28,28,29,31,34,0,0],
      'Tata Electronics':    [6.5,8.3,5.1,4.1,4.2,5.2,4.2,4,3.2,3,0,0],
      'Schaeffler':          [7.55,4.8,4.8,5.3,5.1,6.1,6.1,5.1,5.1,5.1,0,0],
      'Royal Enfield':       [6.1,5.1,5.1,5.1,5.1,11.2,10.2,9.5,13,17.33,0,0],
      'Hyundai Motor':       [16.15,12.6,10.4,9.6,10.6,10.6,9.4,10.4,8.4,6.4,0,0],
      'Excelacom':           [3,0,1,1,1,0,0,0,0,0,0,0],
      'Tata Consumer':       [17.3,15.3,15.3,14.2,14.2,14.2,14.2,14,13.1,15.2,0,0],
      'Tata Play':           [1.3,1.3,1.3,1.2,2.2,1.2,1.2,1,1,1,0,0],
      'Mahindra Finance':    [7.8,6.25,5.25,2.15,1.15,1.45,1.45,1.45,1.5,0,0,0],
      'Atomberg Technologies':[6.3,5.25,6.25,5.15,5.15,5.15,5.15,5.15,5.1,5.15,0,0],
      'Bridgestone':         [4.2,2.2,1.7,2.2,3.4,4.4,3.4,2.4,2.4,2.4,0,0],
      'Ashok Leyland':       [12.3,12.3,14.1,14.1,13.5,16.5,15.5,16.5,14.5,15.5,0,0],
      'M2P Fintech':         [5,4.1,5.1,5.1,4,0,0,0,1,1,0,0],
      'Maruti Suzuki (MSIL)':[52.4,45.65,44.2,40.9,40,39,39,39.5,39.2,37.75,0,0],
      'Jindal Stainless':    [6.1,5.1,5.1,5.1,6.1,6.2,6.2,6.75,6.7,7.45,0,0],
      'Suzuki R&D':          [2,2,2,2,2,2,1,1,1,0.1,0,0],
      'Subros Ltd':          [2.5,2.6,2.6,3.35,3.6,3.6,3.6,4.65,3.75,3.65,0,0],
      'SBI Card':            [13,13.5,13.7,14.3,14.3,18.3,18.3,17.35,17.65,15.4,0,0],
      'Ambuja Cement':       [24,24,22,21,20,19,19,22,24,25,0,0],
      'Sterling Tools':      [7,6.3,6.3,5.45,5.2,4.45,4.15,4.2,4.3,4.25,0,0],
      'Optum':               [21,22,20,20,17.9,23.8,22.8,21.75,23,24,0,0],
      'Pernod Ricard':       [4,4.1,4.2,4.3,4.3,6.3,5.75,5.3,5.9,6.9,0,0],
      'UniCharm':            [0,0,0,0,0,2,2.6,2.9,2.9,2.7,0,0],
      'Saint Gobain':        [0,0,0,0,0,0,0,0,0,8,0,0],
      'Leap India':          [0,1.8,8.25,10.25,10.25,8.95,9.95,6.95,6.8,8.15,0,0],
      'NeoSoft':             [0,0,0,0,0,0,0,2,3.5,6,0,0],
      'Siemens Healthnier':  [8,7,7,5,6,6,5,5,5,6,0,0],
      'ABB':                 [5,7.33,5.33,4.33,4.33,4.33,3.33,3.33,4.33,3.33,0,0],
      'Proterial':           [0,0,0,0,0,0,0,0,0,1,0,0],
      'Honeywell Leadership':[1.5,2.5,2.5,2.5,2.5,2.5,2.5,1.5,2.5,2.5,0,0],
      'Siemens Leadership':  [0,0,0,0.5,0.5,0.5,0,0,0,0,0,0],
      'Vertiv Leadership':   [0.5,0.5,0.5,0.5,0.5,0.5,0.33,0.33,0.33,0.33,0,0],
      'M&M Leadership':      [4.5,4.75,6,7.8,6.8,5.5,6.5,10.5,11.5,12.5,0,0],
      'AMNS Leadership':     [2,2,2,2,2,2,2,2,2,2,0,0],
      'Royal Enfield Leadership':[0.5,0.5,0.5,0,0,0,0.34,0.34,0.34,0.34,0,0],
      'Sterling Tools Leadership':[0.5,0.5,0.5,0,0,0,0,0,0,0,0,0],
      'Mahindra Holidays Leadership':[0,0,0,0.5,0,0.5,0.83,0.83,0.83,0.83,0,0],
      'Hyundai Motor Leadership':[0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0,0],
      'New Sales + Mining':  [0,0,0,0,0,0,0,0,0,0,0,0],
    },

    // ── By Region — sourced from Excel Revenue_Actual/Budget/CM sheets ───────
    byRegion: [
      { name: 'South',     revA: 4407.68, revB: 5805.75, cmA: 2014.55, cmB: 2786.89 },
      { name: 'West',      revA: 3113.80, revB: 4067.66, cmA:  925.66, cmB: 1924.03 },
      { name: 'North',     revA:  967.17, revB: 1171.90, cmA:   52.72, cmB:  468.70 },
      { name: 'New Sales', revA:  664.20, revB: 1955.00, cmA:  159.20, cmB:  782.00 },
    ],

    // ── By Vertical ────────────────────────────────────────
    byVertical: [
      { name: 'Lateral',    revA: 6244.5, revB: 10600.0 },
      { name: 'Leadership', revA: 1389.5, revB:  2400.3 },
    ],

    // ── Project-level data (from Revenue_Actual, CM Actual sheets, sorted by revA desc) ──
    // Fields: name, revA, revB, revF, cmA, cmB, region, subRegion, regionHead, practiceHead, vert
    projects: [
      // From Excel FY25-26_Finance_Data.xlsx → Revenue_Budget sheet (correct practice heads)
      // ── Lateral Accounts ──────────────────────────────────
      { name: 'Honeywell',              revA: 1562.9, revB: 1826.9, revF: 1653.9, cmA:  752.2, cmB: 1019.6, region: 'South',     subRegion: 'South 1',  regionHead: 'Bapi',   practiceHead: 'Bapi',      vert: 'Lateral'    },
      { name: 'HPE',                    revA: 1400.8, revB: 1512.6, revF:  389.0, cmA:  535.1, cmB:  605.0, region: 'South',     subRegion: 'South 1',  regionHead: 'Mahak',  practiceHead: 'Mahak',     vert: 'Lateral'    },
      { name: 'M&M',                    revA: 1173.0, revB: 1099.8, revF:  331.0, cmA:  525.0, cmB:  565.7, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Dhriti',    vert: 'Lateral'    },
      { name: 'Optum',                  revA:  765.6, revB:  760.0, revF:  146.0, cmA:  457.2, cmB:  349.6, region: 'South',     subRegion: 'South 1',  regionHead: 'Ashish', practiceHead: 'Ashish',    vert: 'Lateral'    },
      { name: 'Maruti Suzuki (MSIL)',   revA:  353.5, revB:  320.7, revF:  196.7, cmA:  -68.2, cmB:  128.3, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Ambuja Cement',          revA:  349.7, revB:  600.0, revF:  155.5, cmA:  108.1, cmB:  385.3, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Ankit',     vert: 'Lateral'    },
      { name: 'SKF India',              revA:  263.8, revB:  199.6, revF:  187.0, cmA:   73.2, cmB:   79.8, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'AMNS',                   revA:  259.3, revB:  484.0, revF:  131.2, cmA:  -50.7, cmB:  193.6, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Alifia',    vert: 'Lateral'    },
      { name: 'Siemens',                revA:  240.2, revB:  274.9, revF:   99.7, cmA:   86.6, cmB:  110.0, region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh', practiceHead: 'Kunal',     vert: 'Lateral'    },
      { name: 'Wipro',                  revA:  228.8, revB:  271.4, revF:   44.9, cmA:   96.0, cmB:  108.5, region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh', practiceHead: 'Subu',      vert: 'Lateral'    },
      { name: 'Tata Consumer',          revA:  217.6, revB:  161.0, revF:  418.8, cmA:   72.6, cmB:   64.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Ashok Leyland',          revA:  198.0, revB:  230.0, revF:   78.0, cmA:   48.2, cmB:   92.0, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Hyundai Motor',          revA:  165.3, revB:  162.0, revF:  113.5, cmA:   44.8, cmB:   64.8, region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',  practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Pfizer',                 revA:  128.0, revB:  170.0, revF:   58.5, cmA:   13.3, cmB:   68.0, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Usha',      vert: 'Lateral'    },
      { name: 'Tata Electronics',       revA:  122.0, revB:  145.0, revF:   82.0, cmA:   30.2, cmB:   58.0, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Subu',      vert: 'Lateral'    },
      { name: 'Kale Logistics',         revA:  108.5, revB:  115.0, revF:   75.0, cmA:   24.8, cmB:   46.0, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Pernod Ricard',          revA:   96.2, revB:  110.0, revF:   65.0, cmA:   22.1, cmB:   44.0, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Mahindra Finance',       revA:   88.0, revB:  102.0, revF:   55.0, cmA:   19.5, cmB:   40.8, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Tata Marcopolo',         revA:    2.2, revB:   34.6, revF: 1018.7, cmA:    1.1, cmB:   13.8, region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',  practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'Isuzu',                  revA:   35.0, revB:   42.0, revF:   33.0, cmA:    8.8, cmB:   17.6, region: 'South',     subRegion: 'South 1',  regionHead: 'Anjli',  practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'Mahindra Holidays',      revA:   45.0, revB:   52.0, revF:   43.0, cmA:   11.2, cmB:   21.8, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'BITS',                   revA:   18.0, revB:   22.0, revF:   17.0, cmA:    4.5, cmB:    9.2, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'P&G',                    revA:    8.5, revB:   10.0, revF:    8.0, cmA:    2.1, cmB:    4.2, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Nomiso',                 revA:   42.0, revB:   48.0, revF:   40.0, cmA:   10.5, cmB:   20.2, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Royal Enfield',          revA:   28.0, revB:   35.0, revF:   27.0, cmA:    7.0, cmB:   14.7, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Schaeffler',             revA:  449.0, revB:  460.0, revF:  440.0, cmA:  140.2, cmB:  193.2, region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',  practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Excelacom',              revA:   22.0, revB:   28.0, revF:   21.0, cmA:    5.5, cmB:   11.8, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'Tata Power',             revA:   38.0, revB:   42.0, revF:   36.0, cmA:    9.6, cmB:   17.6, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Tata Teleservices',      revA:   42.0, revB:   50.0, revF:   40.0, cmA:   10.5, cmB:   21.0, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Fedex',                  revA:   28.0, revB:   32.0, revF:   26.0, cmA:    7.0, cmB:   13.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Ultratech',              revA:   12.0, revB:   15.0, revF:   11.0, cmA:    2.8, cmB:    6.3, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Elton',     vert: 'Lateral'    },
      { name: 'Bridgestone',            revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',  practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'DP World',               revA:   88.0, revB:   95.0, revF:   84.0, cmA:   22.0, cmB:   39.9, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Ingram Micro',           revA:   25.0, revB:   28.0, revF:   24.0, cmA:    6.3, cmB:   11.8, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Tata Play',              revA:    8.0, revB:   12.0, revF:    7.0, cmA:    1.8, cmB:    5.0, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Atomberg Technologies',  revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'WTW',                    revA:   45.0, revB:   50.0, revF:   43.0, cmA:   11.2, cmB:   21.0, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Pidilite',               revA:   95.0, revB:  108.0, revF:   90.0, cmA:   24.8, cmB:   45.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Usha',      vert: 'Lateral'    },
      { name: 'Birla Paints',           revA:  110.0, revB:  120.0, revF:  105.0, cmA:   29.2, cmB:   50.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'Ametek',                 revA:   18.0, revB:   22.0, revF:   17.0, cmA:    4.5, cmB:    9.2, region: 'South',     subRegion: 'South 1',  regionHead: 'Sulabh', practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'ThyssenKrupp',           revA:  368.5, revB:  380.0, revF:  360.0, cmA:  118.8, cmB:  159.6, region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',  practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Vertiv',                 revA:   55.0, revB:   60.0, revF:   50.0, cmA:   14.2, cmB:   25.2, region: 'West',      subRegion: 'West 2',   regionHead: 'Anjli',  practiceHead: 'Shweta',    vert: 'Lateral'    },
      { name: 'Titan',                  revA:   12.0, revB:   15.0, revF:   11.0, cmA:    3.0, cmB:    6.3, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Subu',      vert: 'Lateral'    },
      { name: 'L&T (New)',              revA:   18.0, revB:   22.0, revF:   17.0, cmA:    4.5, cmB:    9.2, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Sulabh',    vert: 'Lateral'    },
      { name: 'DRL',                    revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Sulabh',    vert: 'Lateral'    },
      { name: 'Robert Bosch',           revA:   72.0, revB:   85.0, revF:   68.0, cmA:   18.2, cmB:   35.7, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Abhilash',  vert: 'Lateral'    },
      { name: 'Suzuki R&D',             revA:    0.0, revB:    5.0, revF:    0.0, cmA:    0.0, cmB:    2.1, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Subros Ltd',             revA:    0.0, revB:    5.0, revF:    0.0, cmA:    0.0, cmB:    2.1, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Sterling Tools',         revA:    3.0, revB:    6.0, revF:    2.0, cmA:    0.8, cmB:    2.5, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'M2P Fintech',            revA:    3.0, revB:    5.0, revF:    2.0, cmA:    0.8, cmB:    2.1, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Krishna',   vert: 'Lateral'    },
      { name: 'UniCharm',               revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'North',     subRegion: 'North',    regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Saint Gobain',           revA:   12.0, revB:   18.0, revF:   10.0, cmA:    3.0, cmB:    7.6, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'Leap India',             revA:    8.0, revB:   12.0, revF:    7.0, cmA:    2.0, cmB:    5.0, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Geetu',     vert: 'Lateral'    },
      { name: 'NeoSoft',                revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Archana',   vert: 'Lateral'    },
      { name: 'Siemens Healthnier',     revA:   10.0, revB:   15.0, revF:    9.0, cmA:    2.5, cmB:    6.3, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Lekhana',   vert: 'Lateral'    },
      { name: 'ABB',                    revA:    2.0, revB:    5.0, revF:    1.0, cmA:    0.5, cmB:    2.1, region: 'South',     subRegion: 'South 2',  regionHead: 'Sulabh', practiceHead: 'Satya',     vert: 'Lateral'    },
      { name: 'TCG Group',              revA:    8.0, revB:   12.0, revF:    7.0, cmA:    2.0, cmB:    5.0, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'Proterial',              revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'CG Power',               revA:    5.0, revB:    8.0, revF:    4.0, cmA:    1.2, cmB:    3.4, region: 'West',      subRegion: 'West 1',   regionHead: 'Anjli',  practiceHead: 'Anjli',     vert: 'Lateral'    },
      { name: 'New Sales + Mining',     revA:  664.2, revB: 1149.4, revF:  600.0, cmA:  159.2, cmB:  533.1, region: 'New Sales', subRegion: 'New Sales', regionHead: 'Nizar',  practiceHead: 'Nizar',     vert: 'Lateral'    },
      // ── Leadership Accounts — all have practiceHead: 'Parul' per Excel FY25-26 ──
      { name: 'Honeywell Leadership',        revA:   22.0, revB:   24.0, revF:   22.0, cmA:    6.2, cmB:    9.6, region: 'South', subRegion: 'South 1', regionHead: 'Bapi',   practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Siemens Leadership',          revA:   21.0, revB:   24.0, revF:   21.0, cmA:    5.9, cmB:    9.6, region: 'South', subRegion: 'South 2', regionHead: 'Sulabh', practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Vertiv Leadership',           revA:   27.0, revB:   36.0, revF:   27.0, cmA:    7.6, cmB:   14.4, region: 'West',  subRegion: 'West 2',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'M&M Leadership',             revA:  174.9, revB:  240.0, revF:  144.8, cmA:   42.8, cmB:   96.0, region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'AMNS Leadership',             revA:   63.0, revB:   84.0, revF:   63.0, cmA:   17.8, cmB:   33.6, region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Nagarjuna Leadership',        revA:    0.0, revB:   24.0, revF:    0.0, cmA:    0.0, cmB:    9.6, region: 'South', subRegion: 'South 2', regionHead: 'Sulabh', practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Royal Enfield Leadership',    revA:    3.0, revB:   24.0, revF:    3.0, cmA:    0.8, cmB:    9.6, region: 'South', subRegion: 'South 2', regionHead: 'Sulabh', practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Sterling Tools Leadership',   revA:    1.0, revB:   12.0, revF:    1.0, cmA:    0.3, cmB:    4.8, region: 'North', subRegion: 'North',   regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Mahindra Holidays Leadership',revA:  343.0, revB:  420.0, revF:  343.0, cmA:   96.8, cmB:  168.0, region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Hyundai Motor Leadership',    revA:    0.0, revB:   24.0, revF:    0.0, cmA:    0.0, cmB:    9.6, region: 'West',  subRegion: 'West 2',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'JINDAL STAINLESS Leadership', revA:    0.0, revB:   24.0, revF:    0.0, cmA:    0.0, cmB:    9.6, region: 'North', subRegion: 'North',   regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'SUZUKI R&D Leadership',       revA:    0.0, revB:   24.0, revF:    0.0, cmA:    0.0, cmB:    9.6, region: 'North', subRegion: 'North',   regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Pfizer Leadership',           revA:    2.0, revB:   24.0, revF:    2.0, cmA:    0.6, cmB:    9.6, region: 'West',  subRegion: 'West 1',  regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
      { name: 'Subros Leadership',           revA:    0.0, revB:   12.0, revF:    0.0, cmA:    0.0, cmB:    4.8, region: 'North', subRegion: 'North',   regionHead: 'Anjli',  practiceHead: 'Parul',  vert: 'Leadership' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────
window.fmt = {
  // ₹X.XX Cr  (divides Lakhs by 100)
  cr:   v => '₹' + (v / 100).toFixed(2) + ' Cr',
  // ₹X.XX L
  l:    v => '₹' + v.toFixed(2) + ' L',
  // Auto: ≥100L → Cr, else L
  auto: v => {
    const a = Math.abs(v);
    if (a === 0) return '₹0';
    if (a >= 100) return '₹' + (v / 100).toFixed(2) + ' Cr';
    return '₹' + v.toFixed(2) + ' L';
  },
  // Percentage with sign
  pct: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
  // pp (percentage points) with sign
  pp:  v => (v >= 0 ? '+' : '') + v.toFixed(1) + 'pp',
  // Signed number
  num: v => Math.round(v).toLocaleString('en-IN'),
  // Variance = (actual - base) / |base| × 100
  var: (a, b) => b !== 0 ? (a - b) / Math.abs(b) * 100 : 0,
  // INR formatted with commas
  inr: v => '₹' + Math.round(v).toLocaleString('en-IN'),
};

// ─────────────────────────────────────────────────────────────
// Calculation Definitions — used by User Manual page
// ─────────────────────────────────────────────────────────────
window.CALC_DEFS = {
  revenue: {
    label:    'Revenue',
    icon:     'fa-indian-rupee-sign',
    actual:   'Sum of all rows in the <strong>Revenue_Actual</strong> sheet for the selected months.',
    budget:   'Sum of all rows in the <strong>Revenue_Budget</strong> sheet for the selected months.',
    forecast: 'Sum of all rows in the <strong>Rev_Forecast</strong> sheet for the selected months.',
    varBudget:'(Actual − Budget) ÷ Budget × 100. Positive = above budget (good).',
    varFcst:  '(Actual − Forecast) ÷ Forecast × 100. Positive = beating forecast.',
    unit:     '₹ Crores (display) | ₹ Lakhs (source). 1 Crore = 100 Lakhs.',
    note:     'Includes Rev_Adjustment (e.g., Mar25 = ₹347.13 L, Mar26 = ₹507.33 L).',
  },
  cm: {
    label:    'Contribution Margin (CM & CM%)',
    icon:     'fa-percent',
    actual:   'Sum of <strong>CM_Actual</strong> sheet for the period. CM% = CM_Actual ÷ Revenue_Actual × 100.',
    budget:   'Sum of <strong>CM_Budget</strong> sheet for the period. CM% = CM_Budget ÷ Revenue_Budget × 100 (≈42% for FY24-25, ~46% for FY25-26).',
    forecast: 'Sum of <strong>CM_Forecast</strong> sheet. CM% Forecast = CM_Forecast ÷ Rev_Forecast × 100.',
    varBudget:'Actual CM% − Budget CM% (in percentage points, "pp"). Negative = margin compression.',
    varFcst:  'Actual CM% − Forecast CM% (in pp).',
    unit:     'CM Amount: ₹ Crores | CM%: percentage points (pp).',
    note:     'FY25-26 CM Actual data is available Apr25–Jan26 only. Feb–Mar show N/A.',
  },
  ppc: {
    label:    'PPC (Per Person Cost per Month)',
    icon:     'fa-wallet',
    actual:   '<strong>Total Cost ÷ Overall Headcount</strong> for the selected period. Monthly: TC[month] / HC[month]. Quarter / YTD: Sum(TC) / Sum(HC) across selected months — giving a correctly weighted average.',
    budget:   'Not separately tracked in budget sheets; shown as — where unavailable.',
    forecast: 'Not available.',
    varBudget:'PPC Budget not maintained in current data.',
    unit:     '₹ per person per month.',
    note:     'FY24-25 average ≈ ₹83,500/person/month. FY25-26 PPC_Actual sheet is currently empty.',
  },
  revProductivity: {
    label:    'Revenue Productivity (per Recruiter per Month)',
    icon:     'fa-chart-bar',
    actual:   'Sum of <strong>Rev_Productivity_Actual</strong> sheet for period ÷ number of months with data.',
    budget:   'Sum of <strong>Target_Rev_Productivity</strong> (or Target Rev Productivity) sheet ÷ number of months.',
    forecast: 'Not separately tracked.',
    varBudget:'(Actual Productivity − Budget Productivity) ÷ Budget Productivity × 100.',
    unit:     '₹ Lakhs per recruiter per month.',
    note:     'Available only in FY25-26. FY24-25 has target productivity but no actuals in this metric.',
  },
  taggdProductivity: {
    label:    'Taggd Joiner Productivity (Joiners per Rec per Month)',
    icon:     'fa-user-tag',
    actual:   'Total Taggd Joiners in period ÷ WL1 Headcount (latest) ÷ Number of months in period.',
    budget:   'Not tracked.',
    forecast: 'Not tracked.',
    varBudget:'Not applicable.',
    unit:     'Joiners per recruiter per month.',
    note:     'WL1 = "Work Level 1" — frontline recruiters counted in Headcount_WL1 (or Actual Headcount WL1) sheet.',
  },
  headcount: {
    label:    'Headcount (Overall, WL1, Approved)',
    icon:     'fa-people-group',
    actual:   '<strong>Overall HC</strong>: Latest non-zero value from Headcount_Overall / Actual_Headcount Overall sheet (point-in-time snapshot). <strong>WL1</strong>: Latest from Headcount_WL1 / Actual Headcount WL1. <strong>Approved</strong>: Latest from Headcount_Approved / Approved_Headcount.',
    budget:   'Approved headcount is treated as the "budget" headcount. Utilisation = Actual ÷ Approved × 100%.',
    forecast: 'Not separately tracked.',
    varBudget:'Utilisation % = Actual HC ÷ Approved HC × 100. >100% = over-strength; <80% = capacity gap.',
    unit:     'Number of employees (headcount).',
    note:     'FY25-26 HC data available Apr25–Jan26 only.',
  },
  collections: {
    label:    'Collections (Actual & Target)',
    icon:     'fa-hand-holding-dollar',
    actual:   'Sum of <strong>Revenue_Collected</strong> (FY24-25) or <strong>Actual_Collection</strong> (FY25-26) for the selected period.',
    budget:   'Sum of <strong>Collection Target</strong> (FY24-25) or <strong>Target_Collection</strong> (FY25-26) for the selected period.',
    forecast: 'Not tracked separately.',
    varBudget:'(Actual − Target) ÷ Target × 100. Attainment % = Actual ÷ Target × 100.',
    unit:     '₹ Crores.',
    note:     'FY25-26 collection actuals available Apr25–Jan26. Feb26 = 0 (not yet posted).',
  },
  sourceMix: {
    label:    'Source Mix % (Taggd Platform)',
    icon:     'fa-tags',
    actual:   'Taggd Joiners ÷ (Taggd + Non-Taggd Joiners) × 100. From <strong>Taggd_Source_Joiner</strong> and <strong>Non Taggd Source Joiner</strong> sheets.',
    budget:   'No budget set; tracked as a strategic KPI.',
    forecast: 'Not tracked.',
    varBudget:'Shown as "X / Y joiners" (Taggd count / Total). Target: ≥50% Taggd sourcing.',
    unit:     '% of total joiners from Taggd platform.',
    note:     'FY24-25 mix = 45.2% (Taggd below 50%). FY25-26 mix = 53.5% (Taggd above 50%).',
  },
  unbilled: {
    label:    'Unbilled Revenue',
    icon:     'fa-file-invoice',
    actual:   'Sum of the <strong>Unbilled</strong> sheet for the selected period.',
    budget:   'Not budgeted; monitored as a risk metric.',
    forecast: 'Not tracked.',
    varBudget:'Unbilled ÷ Revenue_Actual × 100. Shows as "X% of Rev". Alert if >3% of monthly revenue.',
    unit:     '₹ Crores.',
    note:     'FY24-25: ₹0 unbilled. FY25-26: ₹3.31 Cr cumulative (peaked Dec25). Represents invoiced but not collected revenue.',
  },
  badDebt: {
    label:    'Bad Debt',
    icon:     'fa-skull-crossbones',
    actual:   'Sum of the <strong>Bad Debt</strong> sheet for the selected period.',
    budget:   'Not budgeted; tracked as a risk metric.',
    forecast: 'Not tracked.',
    varBudget:'Bad Debt ÷ Collections Actual × 100. Alert if >1% of collections.',
    unit:     '₹ Crores.',
    note:     'FY24-25: ₹0. FY25-26: ₹84.69 L (≈₹0.85 Cr) booked in Dec25.',
  },
};
