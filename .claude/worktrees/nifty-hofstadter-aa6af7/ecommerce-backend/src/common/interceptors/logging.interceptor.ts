import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { RequestContextStore } from '../context/request-context';

/**
 * Structured access log. Bodies are never logged — they carry passwords,
 * tokens and card metadata.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.write(req, res.statusCode, startedAt),
        error: (err) => this.write(req, err?.status ?? 500, startedAt, err?.message),
      }),
    );
  }

  private write(req: Request, statusCode: number, startedAt: number, error?: string): void {
    const ctx = RequestContextStore.get();
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId: ctx?.requestId,
        userId: ctx?.userId,
        tenantId: ctx?.tenantId,
        method: req.method,
        endpoint: req.route?.path ?? req.originalUrl,
        statusCode,
        responseTimeMs: Date.now() - startedAt,
        ...(error ? { error } : {}),
      }),
    );
  }
}
