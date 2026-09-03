import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Runs before guards/interceptors (registered via app.use in main.ts, not as a Nest
// interceptor) specifically so even a 401/403 rejected by a guard still gets a correlation id —
// an interceptor-based approach would only ever see requests that pass every guard first.
export function requestIdMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  const id = randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
