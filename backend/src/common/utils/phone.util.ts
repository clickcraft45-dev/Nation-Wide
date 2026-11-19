/**
 * The phone as something a person could dial, or null.
 *
 * Google sign-ups are created with a "google:<id>" placeholder in Customer.phone (the column is
 * required and unique, and Google gives no number). That value must never be printed on an
 * invoice or receipt, or sent to as if it were a number.
 */
export function dialablePhone(phone: string | null | undefined): string | null {
  return phone && /^\+\d{6,}$/.test(phone.replace(/[\s-]/g, '')) ? phone : null;
}
