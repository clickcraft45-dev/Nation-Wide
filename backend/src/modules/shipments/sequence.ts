/**
 * Monotonic counters, one `counters` row per sequence name.
 *
 * A single atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so concurrent callers always
 * get distinct values: the UPDATE takes a row lock, and the RETURNING clause reports the value
 * this caller's increment produced rather than a value some other transaction may have moved on
 * from. Shared by ShipmentsService, InvoicesService and by the seed/import scripts, which insert
 * rows directly and still need real tracking/invoice numbers.
 *
 * Not a Postgres SEQUENCE: invoice numbering restarts each Indian financial year and the seed
 * scripts need to set a counter to a known value, neither of which a bare sequence gives us.
 */
export interface SequenceRunner {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export async function nextSequenceNumber(
  db: SequenceRunner,
  name = 'shipment',
): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ value: number }[]>(
    `INSERT INTO counters (id, value) VALUES ($1, 1)
     ON CONFLICT (id) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    name,
  );

  const next = rows[0]?.value;
  if (typeof next !== 'number') {
    throw new Error(`Could not allocate a ${name} sequence number`);
  }
  return next;
}
