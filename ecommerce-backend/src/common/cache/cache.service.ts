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

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.client.on('error', (e) => this.logger.error(`Redis: ${e.message}`));
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
    await this.client.quit();
  }
}
