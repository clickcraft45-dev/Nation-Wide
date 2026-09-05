# Storage Policy — S3 vs PostgreSQL

**The rule: S3 holds bytes. PostgreSQL holds structured data, metadata, and the S3 object key.**

No file content is ever stored in PostgreSQL. The schema has no `Bytes` / `bytea` column, and
adding one is the thing this document exists to prevent.

## The single storage path

All file I/O goes through [`StorageService`](../backend/src/database/storage.service.ts). Do not
add a second storage system, an S3 client, or a filesystem write anywhere else.

- Credentials are never configured in code — on EC2 the SDK's default provider chain picks up the
  instance IAM role. There is deliberately no `AWS_ACCESS_KEY_ID` handling.
- The bucket is private. Nothing sets an ACL. Reads are handed out as short-lived presigned URLs
  (`presignGet`, default 300s) by callers that have **already authorised the user**.
- Files written to the container filesystem do not survive a redeploy. That was a real data-loss
  bug for invoice PDFs, which are a statutory record.

## Object key layout

| Prefix | Written by | Key format |
|---|---|---|
| `invoices/` | `InvoicesService.storePdf` | `invoices/YYYY/MM/<invoice-number>.pdf` |
| `rate-cards/` | `RateCardDocumentsService` | `rate-cards/<rateProviderId>/v<version>-<uuid>.pdf` |
| `uploads/company-logos/` | `CompanySettingsService` | `uploads/company-logos/<settingsId>/<uuid><ext>` |

Client-supplied filenames are never used as keys — the original filename is attacker-controlled.
Generate a UUID and keep the real name in a column if it needs displaying.

## Where the key lives in PostgreSQL

Exactly three columns point at S3 objects. Each is the **object key**, never a URL, never bytes:

| Model | Column | Nullable |
|---|---|---|
| `Invoice` | `pdfPath` → `pdf_path` | yes — an invoice exists before its PDF is rendered |
| `RateCardDocument` | `storageKey` → `storage_key` | no |
| `CompanySettings` | `logoPath` → `logo_path` | yes |

Store keys, not URLs: a presigned URL expires, so persisting one produces dead links. Build the
URL at read time from the key.

## What stays in PostgreSQL

Structured business data, in full — customers (contact, GST, addresses, auth fields), orders
(pricing, status, relationships), shipments (AWB, provider, tracking events), pickups (workflow,
status, provider), rate cards (providers, zones, weight slabs, pricing), and invoices.

Invoices keep every structured field in Postgres — number, sequence, financial year, customer and
order ids, date, status, supplier and recipient snapshots, all GST/tax amounts, taxable value,
non-taxable charges, total, breakdown source, sent/cancelled timestamps, cancellation reason,
`issued_by_admin_id`, timestamps. Only the rendered PDF goes to S3, addressed by `pdf_path`.

The supplier and recipient fields are a deliberate **snapshot**, not a join: a tax document must
keep showing the details as they were when issued, even after the customer edits their address.

## Adding a new file type

1. Write the bytes with `StorageService.put(key, buffer, contentType)` under a new prefix.
2. Add a nullable `String` column mapped to `..._path` or `..._key` on the owning model.
3. Serve it with `presignGet` after an authorisation check.
4. On replace, best-effort `StorageService.delete` the old key — an orphaned object costs pennies,
   a failed delete must not fail the request.
