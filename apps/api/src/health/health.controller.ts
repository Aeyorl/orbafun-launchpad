import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const expectedChainId = Number(process.env.ARC_CHAIN_ID || 5_042_002);
    const checks = { postgres: false, redis: false, rpc: false };
    try {
      const result = await this.database.query('SELECT 1 AS ready');
      checks.postgres = result.rows[0]?.ready === 1;
    } catch {
      checks.postgres = false;
    }
    checks.redis = await this.redis.ping();

    try {
      const urls = (process.env.ARC_RPC_URLS || process.env.ARC_RPC_URL || '')
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean);
      if (urls.length === 0) throw new Error('RPC unavailable');

      let chainId: number | undefined;
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_chainId',
              params: [],
            }),
            signal: AbortSignal.timeout(3_000),
          });
          if (!response.ok) continue;
          const body = await response.json();
          if (body.result) {
            chainId = Number.parseInt(body.result, 16);
            break;
          }
        } catch {
          // Try the next independent provider.
        }
      }
      checks.rpc = chainId === expectedChainId;
    } catch {
      checks.rpc = false;
    }

    if (!checks.postgres || !checks.redis || !checks.rpc) {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ready', checks };
  }
}
