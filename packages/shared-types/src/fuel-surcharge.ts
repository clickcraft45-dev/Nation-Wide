/** One recorded change to a carrier's fuel surcharge. Only the last five per carrier are kept. */
export interface FuelSurchargeUpdateDto {
  id: string;
  percent: number;
  previousPercent: number;
  /** Where the figure came from: the carrier's published page, or an admin typing it. */
  source: "CARRIER_SITE" | "MANUAL";
  /** What the source called it, e.g. "CW 40". */
  label: string | null;
  appliedByEmail: string | null;
  createdAt: string; // ISO 8601
}

/** What a carrier is charging, what its site says, and how it got there. */
export interface FuelSurchargeCheckDto {
  rateProviderId: string;
  code: string;
  name: string;
  configuredPercent: number;
  /** Null when the site cannot be read automatically, or the read failed. */
  fetchedPercent: number | null;
  fetchedLabel: string | null;
  sourceUrl: string | null;
  /** False for carriers that serve their page to browsers only — enter the number by hand. */
  automatic: boolean;
  note: string;
  error: string | null;
  history: FuelSurchargeUpdateDto[];
}

export interface ApplyFuelSurchargeDto {
  percent: number;
  /** Omitted for a manual entry; the carrier's own label when taken from its page. */
  label?: string;
  source: "CARRIER_SITE" | "MANUAL";
}
