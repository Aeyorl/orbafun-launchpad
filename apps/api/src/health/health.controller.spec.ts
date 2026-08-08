import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ARC_RPC_URLS;
    delete process.env.ARC_CHAIN_ID;
  });

  it('reports readiness only when database, Redis, and RPC are healthy', async () => {
    process.env.ARC_RPC_URLS = 'https://rpc.example';
    process.env.ARC_CHAIN_ID = '5042002';
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    const redis = { isAvailable: jest.fn().mockReturnValue(true) };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x4cef52' }),
    }) as any;
    const controller = new HealthController(db as any, redis as any);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      database: true,
      redis: true,
      chainId: 5_042_002,
    });
  });

  it('fails closed when a required dependency is unavailable', async () => {
    process.env.ARC_RPC_URLS = 'https://rpc.example';
    const db = { query: jest.fn().mockResolvedValue({}) };
    const redis = { isAvailable: jest.fn().mockReturnValue(false) };
    const controller = new HealthController(db as any, redis as any);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
