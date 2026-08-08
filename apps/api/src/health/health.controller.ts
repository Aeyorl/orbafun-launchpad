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
    const checks = { postgres: false, redis: false };
    try {
      const result = await this.database.query('SELECT 1 AS ready');
      checks.postgres = result.rows[0]?.ready === 1;
    } catch {
      checks.postgres = false;
    }
    checks.redis = await this.redis.ping();

    if (!checks.postgres || !checks.redis) {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ready', checks };
  }
}
