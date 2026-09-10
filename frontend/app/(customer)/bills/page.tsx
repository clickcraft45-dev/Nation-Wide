import { redirect } from "next/navigation";

// The invoices-only Bills page grew into Invoices & Receipts at /documents. Kept as a redirect
// rather than deleted so a bookmarked or previously shared /bills link still lands somewhere.
export default function BillsRedirect() {
  redirect("/documents");
}
