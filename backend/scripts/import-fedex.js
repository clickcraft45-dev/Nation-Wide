/* One-off data import: FedEx zones + Document/Pak/Package rates from the June 16, 2026 WH tariff sheet.
 * Run once with: node scripts/import-fedex.js
 * Deletes and re-creates FedEx's zones/rate cards each run so it is safe to re-run after fixing data.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ZONES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

// Destination -> zone letter, transcribed from the sheet's destination/zone table.
const COUNTRY_ZONE = {
  AF: 'C', AL: 'I', DZ: 'N', AS: 'E', AD: 'I', AO: 'N', AI: 'J', AG: 'J', AR: 'J', AM: 'I',
  AW: 'J', AU: 'E', AT: 'I', AZ: 'I',
  BS: 'J', BH: 'M', BD: 'B', BB: 'J', BY: 'I', BE: 'F', BZ: 'J', BJ: 'N', BM: 'J', BT: 'B',
  BO: 'J', BQ: 'J', BA: 'I', BW: 'N', BR: 'J', VG: 'J', BN: 'E', BG: 'I', BF: 'N', BI: 'N',
  KH: 'E', CM: 'N', CA: 'L', CV: 'N', KY: 'J', CF: 'N', TD: 'N', CL: 'J', CN: 'D', CO: 'J',
  CG: 'N', CK: 'E', CR: 'J', HR: 'I', CW: 'J', CY: 'I', CZ: 'I', CI: 'N',
  CD: 'N', DK: 'F', DJ: 'N', DM: 'J', DO: 'J',
  TL: 'E', EC: 'J', EG: 'C', SV: 'J', GQ: 'N', ER: 'N', EE: 'I', ET: 'N',
  FO: 'F', FJ: 'E', FI: 'I', FR: 'F', GF: 'J', PF: 'E',
  GA: 'N', GM: 'N', GE: 'I', DE: 'F', GH: 'N', GI: 'I', GR: 'I', GL: 'F', GD: 'J', GP: 'J',
  GU: 'E', GT: 'J', GN: 'N', GW: 'N', GY: 'J',
  HT: 'J', HN: 'J', HK: 'D', HU: 'I',
  IS: 'I', ID: 'E', IR: 'C', IQ: 'C', IE: 'I', IL: 'I', IT: 'F',
  JM: 'J', JP: 'H', JO: 'C',
  KZ: 'I', KE: 'N', KI: 'I', KW: 'M', KG: 'I',
  LA: 'E', LV: 'I', LB: 'C', LS: 'N', LR: 'N', LY: 'N', LI: 'F', LT: 'I', LU: 'F',
  MO: 'E', MK: 'I', MG: 'N', MW: 'N', MY: 'E', MV: 'B', ML: 'N', MT: 'I', MH: 'E', MQ: 'J',
  MR: 'N', MU: 'N', MX: 'G', FM: 'E', MC: 'I', MN: 'E', MS: 'J', ME: 'I', MA: 'N', MZ: 'N', MM: 'C',
  NA: 'N', NP: 'B', NL: 'F', NC: 'E', NZ: 'E', NI: 'J', NE: 'N', NG: 'N', MP: 'E', NO: 'I',
  OM: 'M',
  PK: 'B', PW: 'E', PS: 'C', PA: 'J', PG: 'E', PY: 'J', PE: 'J', PH: 'E', PL: 'I', PT: 'I',
  QA: 'M',
  MD: 'I', RO: 'I', RU: 'I', RW: 'N', RE: 'N',
  LC: 'J', WS: 'E', SA: 'C', SN: 'N', RS: 'I', SC: 'N', SL: 'N', SG: 'B', SK: 'I', SI: 'I',
  SB: 'E', ZA: 'K', KR: 'E', ES: 'F', LK: 'B', KN: 'J', SX: 'J', MF: 'J', VC: 'J', SD: 'N',
  SR: 'J', SZ: 'N', SE: 'I', CH: 'F', SY: 'C',
  TW: 'E', TH: 'D', TG: 'N', TO: 'E', TT: 'J', TN: 'N', TR: 'I', TM: 'C', TC: 'J', TV: 'E',
  UG: 'N', UA: 'I', AE: 'A', GB: 'F', TZ: 'N', UY: 'J', US: 'G', UZ: 'I',
  VU: 'E', VE: 'J', VN: 'E', VI: 'J',
  YE: 'C',
  ZM: 'N', ZW: 'N',
};

// baseRate per zone (A..N in order), transcribed verbatim from the sheet.
const DOC_2KG = {
  A: 1022, B: 994, C: 1177, D: 1238, E: 1392, F: 1209, G: 1161, H: 1433, I: 1433, J: 1418, K: 1474, L: 1202, M: 1093, N: 1639,
};

// Pak table: weight -> { zone: baseRate }
const PAK = {
  0.5: { A: 1022, B: 1080, C: 1176, D: 1403, E: 1387, F: 1064, G: 944, H: 1433, I: 1437, J: 1497, K: 1472, L: 1127, M: 1092, N: 1635 },
  1: { A: 1170, B: 1153, C: 1272, D: 1478, E: 1527, F: 1101, G: 1179, H: 1642, I: 1505, J: 1627, K: 1652, L: 1252, M: 1231, N: 1755 },
  1.5: { A: 1359, B: 1410, C: 1507, D: 1758, E: 1820, F: 1275, G: 1340, H: 1949, I: 1777, J: 1831, K: 1859, L: 1438, M: 1429, N: 1975 },
  2: { A: 1548, B: 1666, C: 1742, D: 2039, E: 2113, F: 1449, G: 1519, H: 2257, I: 2048, J: 2036, K: 2067, L: 1626, M: 1627, N: 2195 },
  2.5: { A: 1737, B: 1922, C: 1977, D: 2319, E: 2427, F: 1610, G: 1677, H: 2565, I: 2319, J: 2240, K: 2275, L: 1808, M: 1825, N: 2414 },
};

// Package table: weight -> { zone: baseRate }, 0.5-20kg in 0.5kg steps.
const PACKAGE = {
  0.5: { A: 1022, B: 1080, C: 830, D: 1403, E: 1387, F: 1064, G: 939, H: 1433, I: 1437, J: 1497, K: 1472, L: 1127, M: 1092, N: 1635 },
  1: { A: 1170, B: 1153, C: 875, D: 1478, E: 1527, F: 1101, G: 1187, H: 1642, I: 1505, J: 1627, K: 1652, L: 1265, M: 1231, N: 1755 },
  1.5: { A: 1359, B: 1410, C: 1030, D: 1758, E: 1820, F: 1275, G: 1345, H: 1949, I: 1777, J: 1831, K: 1859, L: 1444, M: 1429, N: 1975 },
  2: { A: 1548, B: 1666, C: 1185, D: 2039, E: 2113, F: 1449, G: 1509, H: 2257, I: 2048, J: 2036, K: 2067, L: 1626, M: 1627, N: 2195 },
  2.5: { A: 1737, B: 1922, C: 1340, D: 2319, E: 2427, F: 1610, G: 1672, H: 2565, I: 2319, J: 2240, K: 2275, L: 1808, M: 1825, N: 2414 },
  3: { A: 2317, B: 2376, C: 2012, D: 2549, E: 2597, F: 1870, G: 2089, H: 2709, I: 2669, J: 2718, K: 2860, L: 2232, M: 2318, N: 2821 },
  3.5: { A: 2479, B: 2499, C: 2083, D: 2650, E: 2789, F: 2020, G: 2247, H: 2964, I: 2890, J: 2922, K: 3137, L: 2412, M: 2480, N: 3095 },
  4: { A: 2641, B: 2621, C: 2153, D: 2822, E: 2932, F: 2183, G: 2405, H: 3220, I: 3110, J: 3126, K: 3415, L: 2607, M: 2642, N: 3369 },
  4.5: { A: 2804, B: 2743, C: 2224, D: 2994, E: 3127, F: 2334, G: 2564, H: 3475, I: 3331, J: 3330, K: 3692, L: 2779, M: 2805, N: 3643 },
  5: { A: 2966, B: 2866, C: 2294, D: 3165, E: 3268, F: 2486, G: 2798, H: 3730, I: 3552, J: 3534, K: 3969, L: 2983, M: 2967, N: 3917 },
  5.5: { A: 3406, B: 4676, C: 3059, D: 4674, E: 3596, F: 2736, G: 3060, H: 4716, I: 4400, J: 4802, K: 6532, L: 3296, M: 3567, N: 6532 },
  6: { A: 3570, B: 4907, C: 3202, D: 4881, E: 3797, F: 2879, G: 3186, H: 4871, I: 4660, J: 5074, K: 6859, L: 3459, M: 3738, N: 6859 },
  6.5: { A: 3734, B: 5138, C: 3346, D: 5087, E: 3934, F: 3035, G: 3350, H: 5025, I: 4920, J: 5347, K: 7186, L: 3610, M: 3910, N: 7186 },
  7: { A: 3898, B: 5370, C: 3489, D: 5293, E: 4138, F: 3171, G: 3460, H: 5180, I: 5179, J: 5619, K: 7513, L: 3795, M: 4081, N: 7513 },
  7.5: { A: 4063, B: 5601, C: 3633, D: 5500, E: 4272, F: 3308, G: 3608, H: 5334, I: 5439, J: 5892, K: 7840, L: 3955, M: 4252, N: 7840 },
  8: { A: 4227, B: 5832, C: 4017, D: 5706, E: 4724, F: 3302, G: 3787, H: 5488, I: 5698, J: 6396, K: 8167, L: 4103, M: 4424, N: 8167 },
  8.5: { A: 4391, B: 6063, C: 4170, D: 5913, E: 4862, F: 3441, G: 3914, H: 5643, I: 5958, J: 6678, K: 8494, L: 4264, M: 4595, N: 8494 },
  9: { A: 4555, B: 6294, C: 4323, D: 6119, E: 5040, F: 3588, G: 4062, H: 5797, I: 6218, J: 6961, K: 8821, L: 4432, M: 4767, N: 8821 },
  9.5: { A: 4720, B: 6525, C: 4475, D: 6325, E: 5262, F: 3712, G: 4220, H: 5952, I: 6477, J: 7243, K: 9147, L: 4575, M: 4938, N: 9147 },
  10: { A: 4884, B: 6756, C: 4628, D: 6532, E: 5441, F: 3866, G: 4357, H: 6106, I: 6737, J: 7526, K: 9474, L: 4830, M: 5110, N: 9474 },
  10.5: { A: 5033, B: 6977, C: 4733, D: 6708, E: 5578, F: 4011, G: 4515, H: 6750, I: 6986, J: 7865, K: 9789, L: 5065, M: 5265, N: 9789 },
  11: { A: 5184, B: 7197, C: 4837, D: 6885, E: 5810, F: 4164, G: 4689, H: 6985, I: 7236, J: 8180, K: 10103, L: 5299, M: 5423, N: 10103 },
  11.5: { A: 5336, B: 7417, C: 4941, D: 7061, E: 5944, F: 4319, G: 4900, H: 7219, I: 7485, J: 8495, K: 10418, L: 5532, M: 5581, N: 10418 },
  12: { A: 5487, B: 7638, C: 5045, D: 7238, E: 6127, F: 4508, G: 5117, H: 7454, I: 7735, J: 8810, K: 10732, L: 5765, M: 5739, N: 10732 },
  12.5: { A: 5639, B: 7858, C: 5149, D: 7415, E: 6310, F: 4663, G: 5333, H: 7689, I: 7984, J: 9125, K: 11046, L: 5999, M: 5897, N: 11046 },
  13: { A: 5791, B: 8078, C: 5253, D: 7591, E: 6548, F: 4811, G: 5539, H: 7924, I: 8233, J: 9440, K: 11361, L: 6232, M: 6055, N: 11361 },
  13.5: { A: 5942, B: 8299, C: 5357, D: 7768, E: 6732, F: 4983, G: 5755, H: 8159, I: 8483, J: 9755, K: 11675, L: 6336, M: 6213, N: 11675 },
  14: { A: 6094, B: 8519, C: 5461, D: 7944, E: 6917, F: 5119, G: 5971, H: 8394, I: 8732, J: 10071, K: 11989, L: 6532, M: 6371, N: 11989 },
  14.5: { A: 6245, B: 8739, C: 5565, D: 8121, E: 7042, F: 5260, G: 6182, H: 8628, I: 8982, J: 10386, K: 12304, L: 6730, M: 6530, N: 12304 },
  15: { A: 6397, B: 8960, C: 5669, D: 8297, E: 7225, F: 5434, G: 6393, H: 8863, I: 9231, J: 10701, K: 12618, L: 6926, M: 6688, N: 12618 },
  15.5: { A: 6549, B: 9180, C: 6806, D: 8474, E: 8000, F: 5359, G: 6699, H: 9098, I: 9480, J: 11016, K: 12932, L: 7313, M: 6906, N: 12932 },
  16: { A: 6700, B: 9400, C: 6928, D: 8650, E: 8129, F: 5514, G: 6847, H: 9333, I: 9730, J: 11331, K: 13247, L: 7513, M: 7066, N: 13247 },
  16.5: { A: 6852, B: 9621, C: 7051, D: 8827, E: 8394, F: 5652, G: 7032, H: 9568, I: 9979, J: 11646, K: 13561, L: 7715, M: 7225, N: 13561 },
  17: { A: 7004, B: 9841, C: 7174, D: 9003, E: 8520, F: 5800, G: 7248, H: 9802, I: 10229, J: 11961, K: 13876, L: 7917, M: 7385, N: 13876 },
  17.5: { A: 7155, B: 10062, C: 7296, D: 9180, E: 8715, F: 5944, G: 7459, H: 10037, I: 10478, J: 12276, K: 14190, L: 8119, M: 7544, N: 14190 },
  18: { A: 7307, B: 10282, C: 7419, D: 9356, E: 8911, F: 6093, G: 7675, H: 10272, I: 10727, J: 12591, K: 14504, L: 8321, M: 7703, N: 14504 },
  18.5: { A: 7458, B: 10502, C: 7542, D: 9533, E: 9107, F: 6302, G: 7886, H: 10507, I: 10977, J: 12907, K: 14819, L: 8522, M: 7863, N: 14819 },
  19: { A: 7610, B: 10723, C: 7664, D: 9709, E: 9380, F: 6392, G: 8092, H: 10742, I: 11226, J: 13222, K: 15133, L: 8723, M: 8022, N: 15133 },
  19.5: { A: 7762, B: 10943, C: 7787, D: 9886, E: 9577, F: 6558, G: 8308, H: 10976, I: 11476, J: 13537, K: 15447, L: 8924, M: 8182, N: 15447 },
  20: { A: 7913, B: 11163, C: 7910, D: 10062, E: 9693, F: 6693, G: 8530, H: 11211, I: 11725, J: 13852, K: 15762, L: 9126, M: 8341, N: 15762 },
};

// Top brackets: per-kg rate (not a flat total). Expanded into 1kg-wide slabs below,
// baseRate = perKgRate * weightToKg, matching FedEx's own per-kg billing for these ranges.
const PACKAGE_PER_KG_BRACKETS = [
  { fromKg: 20, toKg: 44, rates: { A: 422, B: 552, C: 392, D: 498, E: 487, F: 337, G: 415, H: 597, I: 585, J: 692, K: 785, L: 456, M: 440, N: 785 } },
  { fromKg: 44, toKg: 70, rates: { A: 347, B: 534, C: 352, D: 502, E: 468, F: 339, G: 413, H: 594, I: 539, J: 641, K: 835, L: 455, M: 362, N: 835 } },
  { fromKg: 70, toKg: 99, rates: { A: 326, B: 453, C: 288, D: 453, E: 474, F: 700, G: 700, H: 574, I: 700, J: 600, K: 757, L: 700, M: 373, N: 834 } },
];

function slabsFromCheckpoints(checkpoints) {
  // checkpoints: array of { weight, rates } sorted ascending. Each row covers
  // (previous weight + 0.01, this weight] to keep adjacent slabs non-overlapping.
  const rows = [];
  let prevWeight = 0;
  for (const { weight, rates } of checkpoints) {
    rows.push({ fromKg: prevWeight === 0 ? 0.01 : Number((prevWeight + 0.01).toFixed(2)), toKg: weight, rates });
    prevWeight = weight;
  }
  return rows;
}

function perKgSlabs() {
  const rows = [];
  for (const bracket of PACKAGE_PER_KG_BRACKETS) {
    for (let kg = bracket.fromKg + 1; kg <= bracket.toKg; kg++) {
      const rates = {};
      for (const zone of ZONES) rates[zone] = Math.round(bracket.rates[zone] * kg);
      rows.push({ fromKg: Number((kg - 1 + 0.01).toFixed(2)), toKg: kg, rates });
    }
  }
  return rows;
}

async function main() {
  const provider = await prisma.rateProvider.findFirst({ where: { code: 'FEDEX' } });
  if (!provider) throw new Error('FedEx rate provider not found — seed it first.');
  const admin = await prisma.adminUser.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No ADMIN user found for createdByAdminId.');

  const countries = await prisma.country.findMany();
  const countryByCode = new Map(countries.map((c) => [c.code, c]));

  // Clean slate for FedEx so this script is safely re-runnable.
  const existingZones = await prisma.zone.findMany({ where: { rateProviderId: provider.id } });
  const existingZoneIds = existingZones.map((z) => z.id);
  const existingCards = await prisma.rateCard.findMany({ where: { zoneId: { in: existingZoneIds } } });
  const existingCardIds = existingCards.map((c) => c.id);
  await prisma.rateQuoteOption.deleteMany({ where: { rateCardId: { in: existingCardIds } } });
  await prisma.weightSlab.deleteMany({ where: { rateCardId: { in: existingCardIds } } });
  await prisma.rateCard.deleteMany({ where: { id: { in: existingCardIds } } });
  await prisma.zoneCountry.deleteMany({ where: { rateProviderId: provider.id } });
  await prisma.zone.deleteMany({ where: { rateProviderId: provider.id } });

  const zoneByLetter = new Map();
  for (const letter of ZONES) {
    const zone = await prisma.zone.create({
      data: { rateProviderId: provider.id, name: `Zone ${letter}` },
    });
    zoneByLetter.set(letter, zone);
  }
  console.log(`Created ${zoneByLetter.size} zones.`);

  let assigned = 0;
  let missing = [];
  for (const [code, letter] of Object.entries(COUNTRY_ZONE)) {
    const country = countryByCode.get(code);
    if (!country) {
      missing.push(code);
      continue;
    }
    const zone = zoneByLetter.get(letter);
    await prisma.zoneCountry.upsert({
      where: { rateProviderId_countryId: { rateProviderId: provider.id, countryId: country.id } },
      update: { zoneId: zone.id },
      create: { zoneId: zone.id, countryId: country.id, rateProviderId: provider.id },
    });
    assigned++;
  }
  console.log(`Assigned ${assigned} countries to zones.${missing.length ? ` Missing DB rows for codes: ${missing.join(', ')}` : ''}`);

  async function createRateCard(letter, shipmentType, slabRows) {
    const zone = zoneByLetter.get(letter);
    const card = await prisma.rateCard.create({
      data: { zoneId: zone.id, shipmentType, currency: 'INR', createdByAdminId: admin.id },
    });
    await prisma.weightSlab.createMany({
      data: slabRows.map((row) => ({
        rateCardId: card.id,
        weightFromKg: row.fromKg,
        weightToKg: row.toKg,
        baseRate: row.baseRate,
        pssAmount: 0,
        fuelChargePercent: 0,
        gstPercent: 18,
        nationwideCut: 0,
        createdByAdminId: admin.id,
      })),
    });
    return slabRows.length;
  }

  // DOCUMENT: single checkpoint at 2kg per the sheet (no data below/above it — a real gap, not filled in).
  let docSlabs = 0;
  for (const letter of ZONES) {
    docSlabs += await createRateCard(letter, 'DOCUMENT', [{ fromKg: 0.01, toKg: 2, baseRate: DOC_2KG[letter] }]);
  }
  console.log(`Created DOCUMENT rate cards: ${docSlabs} slabs total.`);

  // PARCEL (Pak): 0.5-2.5kg in 0.5kg steps.
  const pakCheckpoints = Object.keys(PAK).map(Number).sort((a, b) => a - b).map((weight) => ({ weight, rates: PAK[weight] }));
  const pakRows = slabsFromCheckpoints(pakCheckpoints);
  let parcelSlabs = 0;
  for (const letter of ZONES) {
    const rows = pakRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[letter] }));
    parcelSlabs += await createRateCard(letter, 'PARCEL', rows);
  }
  console.log(`Created PARCEL rate cards: ${parcelSlabs} slabs total.`);

  // PACKAGE: 0.5-20kg in 0.5kg steps, plus the three per-kg brackets expanded to 1kg-wide slabs.
  const packageCheckpoints = Object.keys(PACKAGE).map(Number).sort((a, b) => a - b).map((weight) => ({ weight, rates: PACKAGE[weight] }));
  const packageRows = slabsFromCheckpoints(packageCheckpoints);
  const perKgRows = perKgSlabs();
  let packageSlabs = 0;
  for (const letter of ZONES) {
    const rows = [
      ...packageRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[letter] })),
      ...perKgRows.map((r) => ({ fromKg: r.fromKg, toKg: r.toKg, baseRate: r.rates[letter] })),
    ];
    packageSlabs += await createRateCard(letter, 'PACKAGE', rows);
  }
  console.log(`Created PACKAGE rate cards: ${packageSlabs} slabs total.`);

  console.log('FedEx import complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
