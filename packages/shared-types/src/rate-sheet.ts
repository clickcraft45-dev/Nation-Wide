// A provider's rate sheet (Admin → Pricing → Rate sheets): the live rates laid out as the carrier's
// own weight × zone grid, and the same grid comparing an uploaded sheet against them.

export interface RateGridCellDto {
  /** The live rate for this weight band and column; null when there is none. */
  old: number | null;
  /** The rate after applying the upload; null when the band goes away. Always null with no upload. */
  new: number | null;
  /** Charged per kg rather than as a flat price for the band. */
  perKg: boolean;
  changed: boolean;
}

export interface RateGridRowDto {
  fromKg: number;
  toKg: number;
  cells: RateGridCellDto[];
}

export interface RateGridDto {
  shipmentType: "DOCUMENT" | "PACKAGE";
  /** Prices already include fuel and GST. With an upload: what applying it will set. */
  allIn: boolean;
  /** Whether the live rates are all-in today. */
  wasAllIn: boolean;
  /** As headed in the sheet: "Zone 1", "A", or a destination name. */
  columns: string[];
  rows: RateGridRowDto[];
}

export interface ProviderRateSheetDto {
  providerId: string;
  providerCode: string;
  providerName: string;
  /** True for an upload preview, false for the live rates alone. */
  compare: boolean;
  grids: RateGridDto[];
  /** Cell counts for a preview; all zero otherwise. */
  summary: { added: number; changed: number; removed: number; unchanged: number };
  /** Where in the workbook the rates were read from: "DHL, rows 5–70". */
  sources: string[];
  warnings: string[];
}

export interface RateSheetApplyResultDto {
  zonesCreated: number;
  bandsCreated: number;
  bandsUpdated: number;
  /** Bands the new sheet no longer has: switched off, not deleted. */
  bandsDeactivated: number;
  countriesLinked: number;
  warnings: string[];
}
