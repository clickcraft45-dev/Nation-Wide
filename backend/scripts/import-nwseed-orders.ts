// One-off recovery script: restores Order/Shipment/ExternalTrackingNumber rows lost from the
// dev database from the source-of-truth spreadsheet (NWSeed.xlsx). Not part of the normal seed
// flow — run manually, once, via `npx ts-node --transpile-only scripts/import-nwseed-orders.ts
// <path-to-parsed-json>`. Idempotent: skips any row whose TRK NUMBER already exists as an
// ExternalTrackingNumber, so re-running after a partial failure is safe.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { formatInternalTrackingNumber } from '../src/modules/shipments/tracking-number';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';

const prisma = new PrismaClient();

interface SeedRow {
  date: string;
  awb: string;
  trk_number: string;
  vendor: string;
  service: string;
  pickup_person: string;
  consignor: string;
  consignor_mobile: string;
  consignor_address: string;
  consignee: string;
  consignee_mobile: string;
  consignee_address: string;
  pieces: number;
  weight: number;
  content: string;
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Usage: ts-node import-nwseed-orders.ts <path-to-parsed-json>');
    process.exitCode = 1;
    return;
  }
  const rows: SeedRow[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));

  const provider = await prisma.shippingProvider.findUnique({ where: { code: 'ICL' } });
  if (!provider) {
    throw new Error('ICL shipping provider not found — run the base seed first');
  }

  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });
  const customerByName = new Map(customers.map((c) => [c.name.trim().toUpperCase(), c.id]));

  let imported = 0;
  let skippedExisting = 0;
  const unmatchedConsignors = new Set<string>();

  for (const row of rows) {
    const existing = await prisma.externalTrackingNumber.findFirst({
      where: { externalTrackingNumber: row.trk_number, providerId: provider.id },
    });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const consignorKey = row.consignor.trim().toUpperCase();
    const customerId = customerByName.get(consignorKey);
    if (!customerId) {
      unmatchedConsignors.add(row.consignor);
      continue;
    }

    const createdAt = new Date(`${row.date}T00:00:00.000Z`);

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId,
          status: 'CONFIRMED',
          createdAt,
          updatedAt: createdAt,
        },
      });

      // Mirrors ShipmentsService.createForOrder's placeholder-then-format pattern.
      const shipment = await tx.shipment.create({
        data: {
          orderId: order.id,
          providerId: provider.id,
          sequenceNumber: await nextSequenceNumber(tx),
          internalTrackingNumber: `PENDING-${randomUUID()}`,
          createdAt,
          updatedAt: createdAt,
        },
      });
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          internalTrackingNumber: formatInternalTrackingNumber(
            shipment.sequenceNumber,
            shipment.createdAt,
          ),
        },
      });

      // No dedicated columns exist yet for AWB/consignee/pieces/weight/content — preserved here
      // rather than silently discarded, in ExternalTrackingNumber.rawMetadata (built for exactly
      // this: "raw" provider-side data alongside the normalized fields).
      await tx.externalTrackingNumber.create({
        data: {
          shipmentId: shipment.id,
          providerId: provider.id,
          externalTrackingNumber: row.trk_number,
          rawMetadata: {
            source: 'NWSeed.xlsx recovery import',
            awb: row.awb,
            service: row.service,
            pickupPerson: row.pickup_person,
            consignor: row.consignor,
            consignorMobile: row.consignor_mobile,
            consignorAddress: row.consignor_address,
            consignee: row.consignee,
            consigneeMobile: row.consignee_mobile,
            consigneeAddress: row.consignee_address,
            pieces: row.pieces,
            weightKg: row.weight,
            content: row.content,
          },
        },
      });
    });

    imported += 1;
  }

  console.log(`Imported ${imported} orders/shipments.`);
  console.log(`Skipped ${skippedExisting} rows already present (by TRK NUMBER).`);
  if (unmatchedConsignors.size > 0) {
    console.log(
      `Skipped rows for unmatched consignor names (no existing customer): ${[...unmatchedConsignors].join(', ')}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
