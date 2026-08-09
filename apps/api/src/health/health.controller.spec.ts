import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const originalFetch = global.fetch;
  const database = { query: jest.fn() };
  const redis = { ping: jest.fn() };
  const controller = new HealthController(database as any, redis as any);

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ARC_RPC_URLS;
    delete process.env.ARC_CHAIN_ID;
  });

  beforeEach(() => jest.clearAllMocks());

  it('reports liveness without touching dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(database.query).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('reports readiness only when database, Redis, and RPC are healthy', async () => {
    process.env.ARC_RPC_URLS = 'https://rpc.example';
    process.env.ARC_CHAIN_ID = '5042002';
    database.query.mockResolvedValue({ rows: [{ ready: 1 }] });
    redis.ping.mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x4cef52' }),
    }) as any;
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { postgres: true, redis: true, rpc: true },
    });
  });

  it('fails closed when a required dependency is unavailable', async () => {
    process.env.ARC_RPC_URLS = 'https://rpc.example';
    database.query.mockRejectedValue(new Error('down'));
    redis.ping.mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x4cef52' }),
    }) as any;

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
