import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RedisService — wraps ioredis for caching and pub/sub.
 *
 * Two Redis connections are used:
 *  - `client`: for regular commands (get/set/incr) and subscriptions.
 *  - `publisher`: for publishing events to channels (separate connection
 *    because a subscribed client can't publish).
 *
 * Channels:
 *  - `token:events` — global token events (NEW_TOKEN, NEW_BUY, NEW_SELL, etc.)
 *  - `token:{address}:events` — per-token events for the coin page.
 *
 * Cache keys:
 *  - `token:{address}` — cached token JSON (TTL 5s).
 *  - `tokens:hot` — cached hot tokens list (TTL 10s).
 *  - `tokens:new` — cached newest tokens list (TTL 10s).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;      // for regular commands (get/set/del)
  private subscriber: Redis | null = null;  // for subscriptions (pub/sub)
  private publisher: Redis | null = null;   // for publishing events
  private connected = false;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    // Enable TLS for rediss:// URLs (Upstash and other cloud Redis providers)
    const isTls = url.startsWith('rediss://');
    const opts: any = {
      maxRetriesPerRequest: 1,
      connectTimeout: parseInt(
        process.env.REDIS_CONNECT_TIMEOUT_MS || '30000',
        10,
      ),
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    };
    if (isTls) {
      const ca = process.env.REDIS_SSL_CA_BASE64
        ? Buffer.from(process.env.REDIS_SSL_CA_BASE64, 'base64').toString('utf8')
        : undefined;
      opts.tls = { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
    }
    this.client = new Redis(url, opts);
    this.subscriber = new Redis(url, opts);
    this.publisher = new Redis(url, opts);
  }

  async onModuleInit() {
    try {
      // Wait for the client to connect (ping forces connection if lazy)
      await this.client.ping();
      this.connected = true;
      this.logger.log('Connected to Redis');
    } catch (err) {
      this.logger.warn(`Redis unavailable — running without cache/pub-sub. Set REDIS_URL to enable. (${err.message})`);
      this.connected = false;
      // Disconnect the idle clients to stop background reconnect attempts
      this.client.disconnect();
      this.subscriber.disconnect();
      this.publisher.disconnect();
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      this.client.disconnect();
      this.subscriber.disconnect();
      this.publisher.disconnect();
      this.logger.log('Redis connections closed');
    }
  }

  // ─── Cache operations ────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    if (!this.connected) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.connected) return;
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  isAvailable(): boolean {
    return this.connected;
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.connected) return false;
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async getDel(key: string): Promise<string | null> {
    if (!this.connected) return null;
    return this.client.getdel(key);
  }

  async del(key: string): Promise<void> {
    if (!this.connected) return;
    await this.client.del(key);
  }

  async acquireConnectionSlot(
    key: string,
    member: string,
    limit: number,
    ttlSeconds: number,
  ): Promise<boolean | null> {
    if (!this.connected) return null;
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const result = await this.client.eval(
      `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
       if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
       redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
       redis.call('EXPIRE', KEYS[1], ARGV[5])
       return 1`,
      1,
      key,
      now,
      expiresAt,
      limit,
      member,
      ttlSeconds,
    );
    return Number(result) === 1;
  }

  async refreshConnectionSlot(
    key: string,
    member: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.connected) return;
    await this.client.zadd(key, 'XX', Date.now() + ttlSeconds * 1000, member);
    await this.client.expire(key, ttlSeconds);
  }

  async releaseConnectionSlot(key: string, member: string): Promise<void> {
    if (!this.connected) return;
    await this.client.zrem(key, member);
  }

  /** Delete all keys matching a glob pattern (e.g. "tokens:list:*"). */
  async delPattern(pattern: string): Promise<void> {
    if (!this.connected) return;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(
        cursor, 'MATCH', pattern, 'COUNT', 100,
      );
      cursor = next;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    const raw = await this.client.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.connected) return;
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // ─── Pub/Sub operations ──────────────────────────────────────────────────

  /** Publish an event to a channel. */
  async publish(channel: string, event: any): Promise<void> {
    if (!this.connected) return;
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  /** Publish a token event to both global and per-token channels. */
  async publishTokenEvent(tokenAddress: string, eventType: string, data: any): Promise<void> {
    if (!this.connected) return;
    const payload = { type: eventType, tokenAddress, data, timestamp: Date.now() };
    // Global channel (for the live feed on the landing page)
    await this.publish('token:events', payload);
    // Per-token channel (for the coin page)
    await this.publish(`token:${tokenAddress.toLowerCase()}:events`, payload);
  }

  /** Subscribe to a channel. Uses the dedicated subscriber connection. */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.connected) return;
    // ioredis emits 'message' events for all subscribed channels. The caller
    // is responsible for filtering by channel if multiple subscriptions exist.
    this.subscriber.on('message', (chan, message) => {
      if (chan === channel) callback(message);
    });
    await this.subscriber.subscribe(channel);
  }
}
