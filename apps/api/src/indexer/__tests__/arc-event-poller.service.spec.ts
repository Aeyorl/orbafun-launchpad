import { ArcEventPollerService } from '../arc-event-poller.service';

describe('ArcEventPollerService checkpoint safety', () => {
  const make = () => {
    const db = { query: jest.fn() };
    const indexer = {};
    const service = new ArcEventPollerService(db as any, indexer as any) as any;
    return { service, db };
  };

  afterEach(() => {
    delete process.env.ARC_POLLER_ENABLED;
    delete process.env.ARC_DEPLOYMENT_BLOCK;
  });

  it('does not advance the checkpoint when an event range fails', async () => {
    const { service } = make();
    service.lastBlock = 99n;
    service.loadCurveAddresses = jest.fn();
    service.rpcCall = jest.fn().mockResolvedValue('0x64');
    service.fetchAndProcessRange = jest.fn().mockRejectedValue(new Error('persist failed'));
    service.saveLastBlock = jest.fn();

    await service.poll();

    expect(service.lastBlock).toBe(99n);
    expect(service.saveLastBlock).not.toHaveBeenCalled();
  });

  it('replays the failed range on the next poll', async () => {
    const { service } = make();
    service.lastBlock = 99n;
    service.loadCurveAddresses = jest.fn();
    service.rpcCall = jest.fn().mockResolvedValue('0x64');
    service.fetchAndProcessRange = jest.fn()
      .mockRejectedValueOnce(new Error('persist failed'))
      .mockResolvedValueOnce(undefined);
    service.saveLastBlock = jest.fn();

    await service.poll();
    await service.poll();

    expect(service.fetchAndProcessRange).toHaveBeenNthCalledWith(1, 100n, 100n);
    expect(service.fetchAndProcessRange).toHaveBeenNthCalledWith(2, 100n, 100n);
    expect(service.saveLastBlock).toHaveBeenCalledWith(100n);
  });

  it('bootstraps a missing checkpoint at deploymentBlock - 1', async () => {
    process.env.ARC_POLLER_ENABLED = 'true';
    process.env.ARC_DEPLOYMENT_BLOCK = '12345';
    const { service } = make();
    service.loadCurveAddresses = jest.fn();
    service.loadLastBlock = jest.fn();
    service.saveLastBlock = jest.fn();
    service.poll = jest.fn().mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(service.lastBlock).toBe(12344n);
    expect(service.saveLastBlock).toHaveBeenCalledWith(12344n);
  });
});
