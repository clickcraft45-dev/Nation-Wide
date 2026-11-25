/**
 * UPI payment links (NPCI's upi://pay), the text inside a UPI QR. Any UPI app that scans one opens
 * a payment to `upiId` with the amount and note already filled in, so the customer only confirms.
 */

/** handle@bank, the same check the backend applies when admin saves it. */
export const UPI_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isUpiId(value: string): boolean {
  return UPI_ID_PATTERN.test(value.trim());
}

export function upiPayLink({
  upiId,
  payeeName,
  amount,
  note,
}: {
  upiId: string;
  payeeName?: string | null;
  /** Rupees. Left out, the customer types the amount themselves. */
  amount?: number;
  /** Shows in the customer's and our bank statement: a pickup reference helps match the payment. */
  note?: string;
}): string {
  const params: [string, string][] = [["pa", upiId.trim()]];
  if (payeeName?.trim()) params.push(["pn", payeeName.trim()]);
  if (amount !== undefined && amount > 0) params.push(["am", amount.toFixed(2)]);
  params.push(["cu", "INR"]);
  // UPI apps cap the note; longer ones are cut or refused.
  if (note?.trim()) params.push(["tn", note.trim().slice(0, 50)]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
