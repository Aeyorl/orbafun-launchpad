import { AlertService, safeAlertError } from './alert.service';
import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ARC_RPC_URLS;
    delete process.env.DEPLOYER_MONITOR_ADDRESS;
    delete process.env.DEPLOYER_MIN_BALANCE_MICRO_USDC;
  });

  it('detects dependency, RPC, indexer, pool, and transaction failures', async () => {
    process.env.ARC_RPC_URLS = 'https://rpc-a.example,https://rpc-b.example';
    const database = {
      getPoolStats: jest.fn().mockReturnValue({ total: 9, idle: 0, waiting: 1, max: 10 }),
      queryOne: jest.fn(async (sql: string) => {
        if (sql.includes('indexer_sync_state')) return { last_block: '100', age_seconds: '180' };
        return { count: '2' };
      }),
    };
    const redis = {
      ping: jest.fn().mockResolvedValue(false),
      dbSize: jest.fn().mockResolvedValue(100),
    };
    const alerts = { setCondition: jest.fn().mockResolvedValue(undefined) };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '0xc8' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '0xbe' }) }) as any;
    const service = new MonitoringService(database as any, redis as any, alerts as any);

    await service.checkNow();

    const conditions = new Map(
      alerts.setCondition.mock.calls.map((call) => [call[0], call[1]]),
    );
    expect(conditions.get('redis')).toBe(true);
    expect(conditions.get('rpc-divergence')).toBe(true);
    expect(conditions.get('indexer-lag')).toBe(true);
    expect(conditions.get('postgres-pool')).toBe(true);
    expect(conditions.get('failed-transactions')).toBe(true);
  });
});

describe('AlertService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ALERT_WEBHOOK_URL;
  });

  it('deduplicates active alerts and emits one recovery', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://alerts.example/orba';
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
    const service = new AlertService();

    await service.setCondition('redis', true, 'Redis unavailable', {});
    await service.setCondition('redis', true, 'Redis unavailable', {});
    await service.setCondition('redis', false, 'Redis unavailable', {});

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const recovery = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(recovery.severity).toBe('recovery');
  });

  it('redacts credential-bearing URLs from alert errors', () => {
    expect(safeAlertError(new Error('failed https://user:secret@example.com/path')))
      .toBe('failed [redacted-url]');
  });
});
