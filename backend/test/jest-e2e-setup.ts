// Each e2e spec file boots a full Nest app (including the notifications BullMQ queue/worker)
// and tears it down independently. When app.close() runs while a queue/worker connection has
// an operation in flight, BullMQ's internal RedisConnection wrapper can emit a bare 'error'
// event that Node's default EventEmitter behavior turns into a fatal crash — a known,
// documented BullMQ/ioredis shutdown race, not a bug in our own code (our own Worker/Queue
// 'error' listeners in NotificationsProcessor/NotificationsService already handle the ones we
// control; this is a lower-level emitter we don't have a handle on).
process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (
    error.code === 'ERR_UNHANDLED_ERROR' &&
    error.message.includes('Connection is closed')
  ) {
    return;
  }
  throw error;
});
