import { MAX_UPLOAD_BYTES } from '../media/upload-limits';

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

  frontend: {
    /** Where the built SPA lives, for server-rendered <head> tags. */
    distPath: process.env.FRONTEND_DIST_PATH,
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

  /**
   * SMS and WhatsApp, via Twilio. Both are optional: with no credentials the
   * channels report themselves unconfigured and only email is sent.
   */
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    smsFrom: process.env.TWILIO_SMS_FROM,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    /**
     * Applied to phone numbers stored without one, e.g. "+91". Twilio needs
     * E.164 and customers rarely type it.
     */
    defaultCountryCode: process.env.SMS_DEFAULT_COUNTRY_CODE,
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
    /** Temporary credentials from an assumed IAM role, when in use. */
    sessionToken: process.env.AWS_SESSION_TOKEN,
    /** Set for an S3-compatible store (MinIO, R2, Spaces); blank means AWS. */
    endpoint: process.env.S3_ENDPOINT,
    /**
     * The base a stored URL is built from. For S3 it is where a CDN sits in
     * front of the bucket; for local storage it is this API's own public
     * address, because that is what serves /uploads.
     */
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
    /** Where the local provider writes when S3 is not configured. */
    localDir: process.env.STORAGE_LOCAL_DIR ?? './uploads',
    maxUploadBytes: MAX_UPLOAD_BYTES,
  },
});
