/**
 * The supplier's own GST registration — transcribed from the Registration Certificate
 * (Form GST REG-06, see Rule 10(1)) issued 29/08/2024 by the Hyderabad jurisdictional office,
 * registration type Regular, constitution Proprietorship, valid from 29/08/2024 with no end date.
 * Annexure A records no additional places of business.
 *
 * WHY THIS IS IN CODE AT ALL. Every field here is copied verbatim onto a tax invoice, and an
 * issued invoice is immutable — it has consumed a number in the statutory series. Leaving them to
 * be typed into a settings form on a fresh deployment means the first invoice is either blocked
 * (InvoicesService refuses to issue with any of them blank) or, worse, issued against a typo.
 *
 * WHY IT IS IN THIS PACKAGE. Two apps need it and they must not disagree: the backend seeds the
 * CompanySettings row from it, and the marketing footer displays the registered name and GSTIN.
 * A second hand-typed copy in the frontend is exactly how the site ends up advertising a GSTIN
 * that no longer matches the one on the invoices.
 *
 * It is a STARTING VALUE for the backend, not a lock — every field stays editable in the admin UI
 * (Pricing → Rate Cards → "Rate Card Settings"), because a registration can change and
 * re-deploying must not be the way to record that. Once an admin edits a field, nothing here
 * overwrites it. So if the registration changes, update this file AND the live row; editing only
 * this file changes nothing for a database that already holds values.
 */
export const REGISTERED_COMPANY = {
  /** Trade name on the certificate. Title-cased for documents; GSTN stores every field in caps. */
  companyName: "NationWide Courier Delivery Service",
  /** Shared document identity — used by new invoice and rate-card PDFs. */
  tagline: "Delivering trust worldwide",
  primaryColor: "#7F1020",
  /** Legal name — the proprietor, which is not the same as the trade name above. */
  legalName: "Rohit Reddy",
  gstin: "36CZWPR1095K1ZE",
  stateName: "Telangana",
  /** Must equal the GSTIN's first two digits — asserted in registered-company.spec.ts. */
  stateCode: "36",
  /**
   * SAC 996812, "Courier services other than by air". The alternative the schema notes is 996819
   * ("other delivery services"); 996812 is chosen because the registered trade name is a courier
   * delivery service. This is a tax classification, so confirm it with your accountant before the
   * first invoice goes out — it is one edit in the admin dialog if they disagree.
   */
  sacCode: "996812",
  /** Principal place of business, as registered. */
  address: "80/SRT, Prakash Nagar, Begumpet, Secunderabad, Hyderabad, Telangana 500016",
} as const;
