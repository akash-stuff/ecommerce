import { z } from 'zod';

/**
 * Fail fast at boot rather than at 3am on the first request that needed a
 * missing secret.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  PLATFORM_DOMAIN: z.string().min(1),
});

export function validateEnv(config: Record<string, unknown>) {
  const result = schema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Environment is not configured correctly:\n${issues.join('\n')}`);
  }
  return { ...config, ...result.data };
}
