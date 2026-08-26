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

  /**
   * Not a JWT secret: this one is reversible, and it protects credentials that
   * belong to tenants rather than to us. Checked for decoded length, because a
   * 32-character base64 string is only 24 bytes and AES-256 needs 32 — a check
   * on string length would pass and then fail at the first save.
   */
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .refine((v) => decodedLength(v) === 32, {
      message:
        'CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes. ' +
        'Generate one with: openssl rand -base64 32',
    }),
});

/** Bytes a base64 or hex key decodes to, or -1 if it decodes to neither. */
function decodedLength(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return -1;
  // Hex is checked first: 64 hex characters are also valid base64 and would
  // decode to 48 bytes of nonsense.
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return 32;
  try {
    return Buffer.from(trimmed, 'base64').length;
  } catch {
    return -1;
  }
}

export function validateEnv(config: Record<string, unknown>) {
  const result = schema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Environment is not configured correctly:\n${issues.join('\n')}`);
  }
  return { ...config, ...result.data };
}
