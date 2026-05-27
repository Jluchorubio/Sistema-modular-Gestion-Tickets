import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly mem = new Map<string, { val: string; exp: number }>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.log.log('REDIS_URL not set — using in-memory cache');
      return;
    }
    this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    try {
      await this.redis.connect();
      this.log.log('Redis cache connected');
    } catch (err) {
      this.log.warn(`Redis connect failed (${(err as Error).message}) — falling back to in-memory`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => {});
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      const raw = await this.redis.get(key).catch(() => null);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const entry = this.mem.get(key);
    if (!entry) return null;
    if (Date.now() > entry.exp) { this.mem.delete(key); return null; }
    return JSON.parse(entry.val) as T;
  }

  async set(key: string, val: unknown, ttlMs: number): Promise<void> {
    const raw = JSON.stringify(val);
    if (this.redis) {
      await this.redis.set(key, raw, 'PX', ttlMs).catch(() => {});
      return;
    }
    this.mem.set(key, { val: raw, exp: Date.now() + ttlMs });
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    if (this.redis) {
      await this.redis.del(...keys).catch(() => {});
      return;
    }
    keys.forEach(k => this.mem.delete(k));
  }

  /** Delete all keys matching a prefix (in-memory scans Map; Redis uses SCAN). */
  async delByPrefix(prefix: string): Promise<void> {
    if (this.redis) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100).catch(() => ['0', [] as string[]] as [string, string[]]);
        if (keys.length) await this.redis.del(...keys).catch(() => {});
        cursor = next;
      } while (cursor !== '0');
      return;
    }
    for (const k of [...this.mem.keys()]) {
      if (k.startsWith(prefix)) this.mem.delete(k);
    }
  }

  /** Wrap a factory with cache-aside (get → miss → set). */
  async wrap<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await factory();
    await this.set(key, fresh, ttlMs);
    return fresh;
  }
}
