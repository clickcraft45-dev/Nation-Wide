import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message?: string | string[];
  error?: string;
  path: string;
  timestamp: string;
  requestId?: string;
  // Some services throw a structured HttpException body carrying extra domain fields the
  // frontend depends on (e.g. RatesService's 409 duplicate-rate conflict includes
  // rateProviderName/zoneName/existingRateId so the UI can render an "update instead?" prompt).
  // Those must pass through untouched, not just message/error.
  [key: string]: unknown;
}

// Every unhandled error in the app funnels through here — the single place that decides what
// the client sees. Known HttpExceptions (BadRequest/NotFound/Forbidden/etc, thrown deliberately
// by services) pass their real status/message through unchanged. Anything else (a bug, a raw
// Prisma error, a TypeError) is logged with full detail server-side but reduced to a generic
// 500 for the client — this is what "stack traces never leak to production" actually means in
// practice, since Nest's own default filter already avoids leaking stack traces in the JSON body
// but doesn't give us a single point to log/redact/attach a request id.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const { status, extra } = this.resolve(exception);

    const body: ErrorResponseBody = {
      ...extra,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${request.id ?? 'no-request-id'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    extra: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return {
          status: exception.getStatus(),
          extra: { message: res, error: exception.name },
        };
      }
      const resObj = res as Record<string, unknown>;
      return {
        status: exception.getStatus(),
        extra: {
          error: exception.name,
          ...resObj,
          message: resObj.message ?? exception.message,
        },
      };
    }

    // Prisma errors are never safe to forward verbatim (they can include column/table names and
    // raw constraint text) — reduce to the two client-actionable cases and generic-500 the rest.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          extra: {
            message: 'The requested resource was not found',
            error: 'NotFoundException',
          },
        };
      }
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          extra: {
            message: 'A record with this value already exists',
            error: 'ConflictException',
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      extra: {
        message: 'Something went wrong. Please try again.',
        error: 'InternalServerError',
      },
    };
  }
}
