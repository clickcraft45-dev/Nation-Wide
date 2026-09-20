import type { PickupRecipientDto } from "./pickup-request";

/**
 * One box. Dimensions are optional only so a document envelope can be booked on weight alone;
 * whenever they are given, all three are.
 */
export interface ParcelPackageDto {
  weightKg: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

/** One line of a shipment's contents — what DHL/FedEx/UPS/DPD ask for on the commercial invoice. */
export interface ShipmentItemDto {
  /** The kind of goods, e.g. "Garments". The description is the specific item, e.g. "Saree". */
  category?: string | null;
  description: string;
  quantity: number;
  /** Per unit, INR. */
  unitValue: number;
  hsCode?: string | null;
}

export interface SavedItemDto {
  id: string;
  category: string | null;
  description: string;
  hsCode: string | null;
  unitValue: number;
}

export interface SaveItemDto {
  category?: string;
  description: string;
  unitValue: number;
  hsCode?: string;
}

/** Where the customer's last pickup was collected from — prefills the next booking. */
export interface SavedPickupAddressDto {
  contactName: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

export interface SavedRecipientDto extends PickupRecipientDto {
  country: string;
  /**
   * What was last sent to this recipient. Picking their name brings these back, so a customer
   * shipping the same goods to the same person does not retype them. Read off the most recent
   * booking to that address — nothing extra is stored.
   */
  lastItems: ShipmentItemDto[] | null;
}

/** Everything a booking form can prefill for one customer. */
export interface AddressBookDto {
  lastPickup: SavedPickupAddressDto | null;
  recipients: SavedRecipientDto[];
  savedItems: SavedItemDto[];
}

/** The carriers' divisor: volumetric kg = L × W × H (cm) ÷ 5000. Matches the published terms. */
export const VOLUMETRIC_DIVISOR = 5000;

export function volumetricWeightKg(pkg: ParcelPackageDto): number {
  if (!pkg.lengthCm || !pkg.widthCm || !pkg.heightCm) return 0;
  return (pkg.lengthCm * pkg.widthCm * pkg.heightCm) / VOLUMETRIC_DIVISOR;
}

/**
 * What the shipment is priced on: each box charged at the greater of its actual and volumetric
 * weight, summed. Rounded UP to 2 decimals — never under-charge by a rounding hair, and the API
 * accepts at most 2 decimal places. Shared by the browser (to preview) and the server (to price),
 * so the two cannot disagree.
 */
export function chargeableWeightKg(packages: ParcelPackageDto[]): number {
  const total = packages.reduce(
    (sum, pkg) => sum + Math.max(pkg.weightKg, volumetricWeightKg(pkg)),
    0,
  );
  // toFixed first strips float noise (0.1 + 0.2) that would otherwise ceil to an extra cent.
  return Math.ceil(Number((total * 100).toFixed(6))) / 100;
}
