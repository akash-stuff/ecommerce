import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin Redis wrapper. Deliberately fail-open on read: if Redis is down the app
 * should serve slower, not go dark.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;
  /** Deduplicates the retry log; see the error handler below. */
  private lastError: string | null = null;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      /**
       * Commands issued while disconnected fail immediately instead of queuing.
       * With the queue on, an unreachable Redis turns every cache read into a
       * pending promise and the retry timer keeps the event loop alive — the
       * process then refuses to exit, which is how a misconfigured port made
       * the e2e suite hang rather than fail.
       */
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });

    // Logged once per transition rather than per retry: a down cache should be
    // visible, not drown every other line in the log.
    this.client.on('error', (e) => {
      if (this.lastError !== e.message) {
        this.lastError = e.message;
        this.logger.error(`Redis: ${e.message || 'connection failed'}`);
      }
    });
    this.client.on('ready', () => {
      this.lastError = null;
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds) await this.client.setex(key, ttlSeconds, raw);
      else await this.client.set(key, raw);
    } catch (e) {
      this.logger.warn(`Cache write failed for ${key}`);
    }
  }

  async del(key: string): Promise<void> {
    try { await this.client.del(key); } catch { /* non-fatal */ }
  }

  /**
   * Coarse-grained mutex for work that must not run twice at once.
   *
   * Note that inventory does NOT use this: overselling is prevented by a
   * conditional UPDATE inside a transaction, which stays correct even when
   * Redis is unreachable. Reach for this only where a database constraint
   * cannot express the rule.
   */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const token = Math.random().toString(36).slice(2);
    const acquired = await this.client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      const current = await this.client.get(`lock:${key}`);
      if (current === token) await this.client.del(`lock:${key}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // `quit` waits for a graceful handshake that never arrives if the server
    // was never reachable, so a shutdown must not depend on it.
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
