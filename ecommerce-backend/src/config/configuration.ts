export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),

  /**
   * Global request throttle, per client IP.
   *
   * Configurable because the right number depends on deployment: a storefront
   * page makes several API calls, so a low cap behind a shared NAT or CDN
   * throttles real shoppers, while a public API wants it tight. Also lets a
   * load test raise the ceiling instead of measuring the throttler.
   */
  throttle: {
    ttlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
    limit: Number(process.env.THROTTLE_LIMIT ?? 120),
  },

  platform: {
    /** Apex domain for tenant subdomains: {slug}.{domain} */
    domain: process.env.PLATFORM_DOMAIN ?? 'platform.com',
    /** Hostnames that must NOT resolve to a tenant (admin consoles, bare API). */
    adminHosts: (process.env.PLATFORM_ADMIN_HOSTS ?? 'localhost,admin.platform.com,api.platform.com')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    /** What a tenant points a CNAME at when connecting a custom domain. */
    ingressTarget: process.env.PLATFORM_INGRESS_TARGET,
    /** Public IP for apex domains, which cannot hold a CNAME. */
    ingressIp: process.env.PLATFORM_INGRESS_IP,
  },

  database: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },

  jwt: {
    accessSecret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '30', 10),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    /** Storefronts live on wildcard subdomains, so an exact list is not enough. */
    allowTenantSubdomains: process.env.CORS_ALLOW_TENANT_SUBDOMAINS !== 'false',
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? 'no-reply@platform.com',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  storage: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
