/**
 * Monotonic counters, the MongoDB stand-in for a Postgres sequence.
 *
 * One `counters` document per sequence name, bumped with a single atomic findAndModify + $inc,
 * so concurrent callers always get distinct values. Shared by ShipmentsService and by the
 * seed/import scripts, which insert shipments directly and still need real tracking numbers.
 */
export interface SequenceRunner {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
}

export async function nextSequenceNumber(
  db: SequenceRunner,
  name = 'shipment',
): Promise<number> {
  const result = (await db.$runCommandRaw({
    findAndModify: 'counters',
    query: { _id: name },
    update: { $inc: { value: 1 } },
    upsert: true,
    new: true,
  })) as { value?: { value?: number } };

  const next = result.value?.value;
  if (typeof next !== 'number') {
    throw new Error(`Could not allocate a ${name} sequence number`);
  }
  return next;
}
