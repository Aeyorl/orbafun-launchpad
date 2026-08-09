import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { AlertService, safeAlertError } from './alert.service';

type RpcState = { healthy: number; highest: bigint; lowest: bigint };

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly alerts: AlertService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledCheck(): Promise<void> {
    if (process.env.MONITORING_ENABLED !== 'true' || this.running) return;
    this.running = true;
    try {
      await this.checkNow();
    } catch (error) {
      this.logger.error(`Operational monitoring failed: ${(error as Error).message}`);
      await this.alerts.setCondition(
        'monitoring-loop',
        true,
        'Operational monitoring loop failed',
        { error: safeAlertError(error) },
      );
    } finally {
      this.running = false;
    }
  }

  async checkNow(): Promise<void> {
    const [redisReady, redisKeys, rpc, indexer, releasedFailures] = await Promise.all([
      this.redis.ping(),
      this.redis.dbSize(),
      this.getRpcState(),
      this.getIndexerState(),
      this.getReleasedFailureCount(),
    ]);
    const pool = this.database.getPoolStats();
    const minProviders = positiveNumber('RPC_MIN_HEALTHY_PROVIDERS', 2);
    const maxDivergence = BigInt(positiveNumber('RPC_MAX_DIVERGENCE_BLOCKS', 8));
    const maxIndexerLag = BigInt(positiveNumber('INDEXER_MAX_LAG_BLOCKS', 60));
    const poolWarnPercent = positiveNumber('POSTGRES_POOL_WARN_PERCENT', 80);
    const redisKeyWarnCount = process.env.REDIS_KEY_WARN_COUNT
      ? positiveNumber('REDIS_KEY_WARN_COUNT', Number.MAX_SAFE_INTEGER)
      : null;
    const indexerLag = rpc.highest >= indexer.lastBlock
      ? rpc.highest - indexer.lastBlock
      : 0n;

    await Promise.all([
      this.alerts.setCondition('redis', !redisReady, 'Redis is unavailable', { redisReady }),
      this.alerts.setCondition(
        'redis-key-capacity',
        redisKeyWarnCount !== null && redisKeys !== null && redisKeys >= redisKeyWarnCount,
        'Redis key count reached its configured capacity warning',
        { keys: redisKeys, warningCount: redisKeyWarnCount },
        'warning',
      ),
      this.alerts.setCondition(
        'rpc-provider-count',
        rpc.healthy < minProviders,
        'Too few healthy Arc RPC providers',
        { healthy: rpc.healthy, required: minProviders },
      ),
      this.alerts.setCondition(
        'rpc-divergence',
        rpc.highest - rpc.lowest > maxDivergence,
        'Arc RPC providers disagree on block height',
        { highest: rpc.highest.toString(), lowest: rpc.lowest.toString() },
        'warning',
      ),
      this.alerts.setCondition(
        'indexer-lag',
        indexerLag > maxIndexerLag || indexer.ageSeconds > 120,
        'Arc indexer is lagging',
        {
          chainHead: rpc.highest.toString(),
          indexedBlock: indexer.lastBlock.toString(),
          lagBlocks: indexerLag.toString(),
          ageSeconds: indexer.ageSeconds,
        },
      ),
      this.alerts.setCondition(
        'postgres-pool',
        pool.waiting > 0 || (pool.total / pool.max) * 100 >= poolWarnPercent,
        'PostgreSQL connection pool is saturated',
        pool,
        'warning',
      ),
      this.alerts.setCondition(
        'failed-transactions',
        releasedFailures > 0,
        'Platform-funded transaction failures detected',
        { releasedReservations: releasedFailures, windowMinutes: 5 },
      ),
    ]);
    await this.checkDeployerBalance(rpc.highest > 0n);
    await this.alerts.setCondition('monitoring-loop', false, 'Operational monitoring loop failed', {});
  }

  private async getRpcState(): Promise<RpcState> {
    const urls = (process.env.ARC_RPC_URLS || process.env.ARC_RPC_URL || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    const blocks = await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
            signal: AbortSignal.timeout(4_000),
          });
          if (!response.ok) return null;
          const body = await response.json();
          return body.result ? BigInt(body.result) : null;
        } catch {
          return null;
        }
      }),
    );
    const healthy = blocks.filter((block): block is bigint => block !== null);
    if (healthy.length === 0) return { healthy: 0, highest: 0n, lowest: 0n };
    return {
      healthy: healthy.length,
      highest: healthy.reduce((a, b) => (a > b ? a : b)),
      lowest: healthy.reduce((a, b) => (a < b ? a : b)),
    };
  }

  private async getIndexerState(): Promise<{ lastBlock: bigint; ageSeconds: number }> {
    const row = await this.database.queryOne<{ last_block: string; age_seconds: string }>(
      `SELECT last_block::text,
              EXTRACT(EPOCH FROM (NOW() - updated_at))::bigint::text AS age_seconds
       FROM indexer_sync_state WHERE entity = 'ArcEventPoller'`,
    );
    return {
      lastBlock: BigInt(row?.last_block || '0'),
      ageSeconds: Number(row?.age_seconds || Number.MAX_SAFE_INTEGER),
    };
  }

  private async getReleasedFailureCount(): Promise<number> {
    const row = await this.database.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM agent_spend_reservations
       WHERE status = 'released' AND resolved_at >= NOW() - INTERVAL '5 minutes'`,
    );
    return Number(row?.count || 0);
  }

  private async checkDeployerBalance(rpcAvailable: boolean): Promise<void> {
    const address = process.env.AWS_KMS_EXPECTED_ADDRESS || process.env.DEPLOYER_MONITOR_ADDRESS;
    const min = process.env.DEPLOYER_MIN_BALANCE_MICRO_USDC;
    if (!address || !min || !rpcAvailable) return;
    const url = (process.env.ARC_RPC_URLS || process.env.ARC_RPC_URL || '').split(',')[0]?.trim();
    if (!url) return;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
        signal: AbortSignal.timeout(4_000),
      });
      const body = await response.json();
      const balance18 = BigInt(body.result || '0');
      const minimum18 = BigInt(min) * 1_000_000_000_000n;
      await this.alerts.setCondition(
        'deployer-balance',
        balance18 < minimum18,
        'Agent deployer balance is below its operating floor',
        { address, balance18: balance18.toString(), minimum18: minimum18.toString() },
        'warning',
      );
    } catch (error) {
      await this.alerts.setCondition(
        'deployer-balance-read',
        true,
        'Agent deployer balance check failed',
        { error: safeAlertError(error) },
        'warning',
      );
    }
  }
}
