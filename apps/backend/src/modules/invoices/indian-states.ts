/**
 * GST state codes — the two-digit prefix of every GSTIN, and the "Place of Supply" code a tax
 * invoice must carry alongside the state name.
 *
 * Reference data, not logic: this is the official list, it changes only when Parliament redraws a
 * state, and it is here rather than in the database because an invoice that can't name its place
 * of supply can't be issued at all — a seed step that hasn't been run is not an acceptable
 * failure mode for that.
 */
const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
  'other territory': '97',
};

/** Common alternates and old spellings, so a stored address doesn't fail to resolve. */
const ALIASES: Record<string, string> = {
  orissa: 'odisha',
  pondicherry: 'puducherry',
  'new delhi': 'delhi',
  'nct of delhi': 'delhi',
  uttaranchal: 'uttarakhand',
  'daman and diu': 'dadra and nagar haveli and daman and diu',
  'dadra and nagar haveli': 'dadra and nagar haveli and daman and diu',
  'jammu & kashmir': 'jammu and kashmir',
  telengana: 'telangana',
};

function normalise(state: string): string {
  return state.trim().toLowerCase().replace(/\s+/g, ' ').replace(/&/g, 'and');
}

/** The GST code for a state name, or null when it isn't an Indian state this list knows. */
export function gstStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const key = normalise(state);
  return STATE_CODES[ALIASES[key] ?? key] ?? null;
}

/**
 * Whether a supply is intra-state, and therefore CGST+SGST rather than IGST.
 *
 * Compares CODES, not names: "Telangana" and "telengana" are the same state and must not produce
 * a different tax treatment because of how someone typed an address. Two states that both fail to
 * resolve are NOT treated as equal — an unknown code is unknown, not a match.
 */
export function isIntraStateSupply(
  supplierStateCode: string | null,
  placeOfSupplyCode: string | null,
): boolean {
  return (
    supplierStateCode !== null &&
    placeOfSupplyCode !== null &&
    supplierStateCode === placeOfSupplyCode
  );
}
