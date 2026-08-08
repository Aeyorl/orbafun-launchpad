import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const database = { query: jest.fn() };
  const redis = { ping: jest.fn() };
  const controller = new HealthController(database as any, redis as any);

  beforeEach(() => jest.clearAllMocks());

  it('reports liveness without touching dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(database.query).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('reports ready only when PostgreSQL and Redis respond', async () => {
    database.query.mockResolvedValue({ rows: [{ ready: 1 }] });
    redis.ping.mockResolvedValue(true);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { postgres: true, redis: true },
    });
  });

  it('returns 503 when a required dependency is unavailable', async () => {
    database.query.mockRejectedValue(new Error('down'));
    redis.ping.mockResolvedValue(true);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
