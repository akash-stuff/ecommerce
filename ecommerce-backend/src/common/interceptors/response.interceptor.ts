import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators';

/** Wraps every successful payload as `{ success: true, data }`. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    // Routes serving XML, plain text or a file opt out entirely.
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) return next.handle();

    return next.handle().pipe(
      map((data) => {
        // Paginated services return { items, meta } — hoist meta alongside data.
        // Anything else on the object (a rating histogram, a facet count) is
        // carried through too, rather than silently dropped for not being
        // one of the two names this interceptor happens to know.
        if (data && typeof data === 'object' && 'items' in (data as any) && 'meta' in (data as any)) {
          const { items, meta, ...extra } = data as any;
          return { success: true, data: items, meta, ...extra };
        }
        return { success: true, data: data ?? null };
      }),
    );
  }
}
