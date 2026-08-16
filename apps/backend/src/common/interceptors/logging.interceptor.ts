import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

// The one place every request/response is logged with a correlation id — without this, tracing
// "what did the client send that caused this 500?" across a handful of ad-hoc Logger calls
// scattered through services is nearly impossible. The id itself is assigned earlier, by
// requestIdMiddleware (registered via app.use in main.ts) rather than here — middleware runs
// before guards, so even a 401/403 rejected by a guard (which never reaches this interceptor)
// still gets a correlation id on its response.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { id?: string }>();
    const response = context.switchToHttp().getResponse<Response>();

    const requestId = request.id ?? 'no-request-id';
    const { method, originalUrl } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            `${method} ${originalUrl} ${response.statusCode} ${duration}ms [${requestId}]`,
          );
        },
        error: () => {
          // Failure detail itself is logged by GlobalExceptionFilter (it has the actual
          // exception); this just records that the request ended in error and how long it took.
          const duration = Date.now() - start;
          this.logger.warn(
            `${method} ${originalUrl} FAILED ${duration}ms [${requestId}]`,
          );
        },
      }),
    );
  }
}
