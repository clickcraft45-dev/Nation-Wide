/* One-off import: NationWide's first real orders, from SeedNationWide.xlsx.
 * Run once with: npx ts-node scripts/import-seed-orders.ts
 *
 * Data-modeling decisions (see conversation for full reasoning):
 *  - CONSIGNOR/PICKUP PERSON is the paying customer (confirmed with the user) — one Customer
 *    row per distinct name. Most rows have no consignor phone; those customers get a clearly
 *    fake placeholder (+9190000000NN) that must be corrected with the real number later.
 *  - The sheet lacks required Quote fields (city/state/postal code for both ends), so this
 *    imports at the Order + Shipment + ExternalTrackingNumber level only — no Quote row is
 *    fabricated. Recipient name/phone/pieces/weight/content/destination country are preserved
 *    in ExternalTrackingNumber.rawMetadata (flexible JSON) rather than invented into required
 *    relational fields.
 *  - Real current status/tracking history is fetched live from ICL's production Tracking API
 *    for each AWB (calling ICLShippingProviderAdapter directly — NOT via the ShippingProvider
 *    row's configured adapterClass, which is still the stub; this script never touches that
 *    global setting). Order.status becomes COMPLETED where ICL reports DELIVERED, else
 *    CONFIRMED (already picked up/in transit) — never fabricated.
 *  - No payment data exists in the sheet, so Order.paymentStatus is left at its PENDING default;
 *    flagged in the summary for staff to reconcile via the existing Mark Paid workflow.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { ICLShippingProviderAdapter } from '../src/modules/provider-integration/adapters/icl/icl-shipping-provider.adapter';
import { nextSequenceNumber } from '../src/modules/shipments/sequence';

const prisma = new PrismaClient();

interface SeedRow {
  date: string;
  awb: string;
  trkNumber: string | null;
  vendor: string;
  service: string;
  pickupPerson: string | null;
  consignor: string;
  consignorMobile: string | null;
  consignorAddress: string | null;
  consignee: string;
  consigneeMobile: string | null;
  destCountry: string;
  pieces: number | null;
  weight: number | null;
  content: string | null;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function toE164India(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10);
  return `+91${digits}`;
}

async function main() {
  const rows: SeedRow[] = require(path.join(__dirname, 'data/seed-orders.json'));

  const shippingProvider = await prisma.shippingProvider.findFirst({ where: { code: 'ICL' } });
  if (!shippingProvider) throw new Error('ICL ShippingProvider row not found — seed it first.');

  // --- 1. Build and upsert one Customer per distinct consignor ---
  const byConsignor = new Map<string, SeedRow[]>();
  for (const row of rows) {
    const key = row.consignor;
    if (!byConsignor.has(key)) byConsignor.set(key, []);
    byConsignor.get(key)!.push(row);
  }

  const customerIdByConsignor = new Map<string, string>();
  let placeholderIndex = 0;
  const placeholderPhones: string[] = [];

  for (const [consignor, consignorRows] of byConsignor) {
    const withMobile = consignorRows.find((r) => r.consignorMobile);
    let phone: string;
    if (withMobile?.consignorMobile) {
      phone = toE164India(withMobile.consignorMobile);
    } else {
      placeholderIndex += 1;
      phone = `+9190000000${String(placeholderIndex).padStart(2, '0')}`;
      placeholderPhones.push(`${titleCase(consignor)} -> ${phone}`);
    }

    const earliestDate = consignorRows
      .map((r) => new Date(r.date))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const address = consignorRows.find((r) => r.consignorAddress)?.consignorAddress ?? null;

    const customer = await prisma.customer.upsert({
      where: { phone },
      update: {},
      create: {
        name: titleCase(consignor),
        phone,
        address,
        consentSource: 'legacy_import',
        consentGivenAt: earliestDate,
        createdAt: earliestDate,
      },
    });
    customerIdByConsignor.set(consignor, customer.id);
  }
  console.log(`Upserted ${customerIdByConsignor.size} customers.`);
  if (placeholderPhones.length > 0) {
    console.log('Customers with placeholder phone numbers (correct these later):');
    placeholderPhones.forEach((p) => console.log('  ' + p));
  }

  // --- 2. Create Order + Shipment + ExternalTrackingNumber per row ---
  const createdShipments: {
    internalTrackingNumber: string;
    shipmentId: string;
    externalTrackingNumberId: string;
    awb: string;
  }[] = [];

  for (const row of rows) {
    const customerId = customerIdByConsignor.get(row.consignor)!;
    const orderDate = new Date(row.date);

    const order = await prisma.order.create({
      data: {
        customerId,
        status: 'CONFIRMED',
        createdAt: orderDate,
        updatedAt: orderDate,
      },
    });

    const created = await prisma.shipment.create({
      data: {
        orderId: order.id,
        providerId: shippingProvider.id,
        sequenceNumber: await nextSequenceNumber(prisma),
        internalTrackingNumber: `PENDING-${randomUUID()}`,
        createdAt: orderDate,
        updatedAt: orderDate,
      },
    });

    const year = orderDate.getUTCFullYear().toString().slice(-2);
    const internalTrackingNumber = `NW-${year}-${String(created.sequenceNumber).padStart(8, '0')}`;
    const shipment = await prisma.shipment.update({
      where: { id: created.id },
      data: { internalTrackingNumber },
    });

    const externalTrackingNumber = await prisma.externalTrackingNumber.create({
      data: {
        shipmentId: shipment.id,
        providerId: shippingProvider.id,
        externalTrackingNumber: row.awb,
        rawMetadata: {
          trkNumber: row.trkNumber,
          vendor: row.vendor,
          service: row.service,
          pickupPerson: row.pickupPerson,
          consignorAddress: row.consignorAddress,
          consignee: row.consignee,
          consigneeMobile: row.consigneeMobile,
          destCountry: row.destCountry,
          pieces: row.pieces,
          weight: row.weight,
          content: row.content,
        } as Prisma.InputJsonValue,
      },
    });

    createdShipments.push({
      internalTrackingNumber,
      shipmentId: shipment.id,
      externalTrackingNumberId: externalTrackingNumber.id,
      awb: row.awb,
    });
  }
  console.log(`Created ${createdShipments.length} orders/shipments.`);

  // --- 3. Fetch real live status per AWB from ICL and persist real events ---
  const icl = new ICLShippingProviderAdapter({
    // Real ConfigService coerces numeric env values per env.validation.ts; this stub replicates
    // that for the one numeric key the adapter reads (TRACKING_PROVIDER_TIMEOUT_MS).
    get: (key: string) => {
      const value = process.env[key];
      if (key === 'TRACKING_PROVIDER_TIMEOUT_MS' && value !== undefined) {
        return Number(value);
      }
      return value;
    },
  } as any);

  const statuses = await prisma.trackingStatus.findMany();
  const statusIdByCode = new Map(statuses.map((s) => [s.code, s.id]));

  let synced = 0;
  let failed = 0;
  let delivered = 0;

  for (const {
    internalTrackingNumber,
    shipmentId,
    externalTrackingNumberId,
    awb,
  } of createdShipments) {
    try {
      const result = await icl.trackShipment(awb);
      if (result.events.length > 0) {
        await prisma.$transaction([
          prisma.trackingEvent.createMany({
            data: result.events.map((event) => {
              const canonicalStatusId = statusIdByCode.get(event.status);
              if (!canonicalStatusId) {
                throw new Error(`Unknown canonical tracking status code: ${event.status}`);
              }
              return {
                shipmentId,
                providerId: shippingProvider.id,
                externalTrackingNumberId,
                rawStatus: event.rawStatus,
                canonicalStatusId,
                eventTime: event.eventTime,
                location: event.location,
              };
            }),
          }),
          prisma.shipment.update({
            where: { id: shipmentId },
            data: {
              currentStatus: result.events[result.events.length - 1].status,
              lastSyncedAt: new Date(),
            },
          }),
          prisma.order.updateMany({
            where: { shipments: { some: { id: shipmentId } } },
            data: {
              status:
                result.events[result.events.length - 1].status === 'DELIVERED'
                  ? 'COMPLETED'
                  : 'CONFIRMED',
            },
          }),
        ]);
        if (result.events[result.events.length - 1].status === 'DELIVERED') delivered += 1;
        synced += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(`  Live ICL sync failed for ${internalTrackingNumber} (AWB ${awb}): ${(err as Error).message}`);
    }
    // Be polite to ICL's production API — brief pause between calls.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`Live ICL sync: ${synced} succeeded (${delivered} delivered), ${failed} failed.`);
  console.log('Import complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
