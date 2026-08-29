/**
 * Result of verifying an Indian PIN code. `valid: false` means the code is well-formed but no
 * post office answers to it; a malformed code is rejected as a 400 before this DTO is ever built.
 */
export interface PincodeLookupDto {
  pincode: string;
  valid: boolean;
  /** Post-office town/locality — the best "city" answer India Post gives for the code. */
  city: string | null;
  district: string | null;
  state: string | null;
  /** Every post office sharing the code, first one first. Empty when `valid` is false. */
  postOffices: string[];
}
