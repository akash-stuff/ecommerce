import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

/** Wraps every successful payload as `{ success: true, data }`. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(_: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
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
