/**
 * Read from the environment directly, not through ConfigService.
 *
 * `FileInterceptor`'s limits are fixed when the decorator is evaluated, which
 * happens before any injector exists. Keeping the single source here means the
 * interceptor's ceiling and the service's re-check cannot disagree —
 * `configuration.ts` reads this same value.
 */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024);
