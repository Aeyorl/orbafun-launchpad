import { ArcEventPollerService } from '../arc-event-poller.service';
import { keccak256, toBytes } from 'viem';

describe('ArcEventPollerService checkpoint safety', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const make = () => {
    const db = { query: jest.fn() };
    const indexer = {};
    const service = new ArcEventPollerService(db as any, indexer as any) as any;
    return { service, db };
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.ARC_POLLER_ENABLED;
    delete process.env.ARC_DEPLOYMENT_BLOCK;
    delete process.env.ARC_MIGRATOR_ADDRESS;
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
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

  it('accepts TokenMigrated only from the configured migrator and forwards LP burn state', async () => {
    const migrator = '0x1000000000000000000000000000000000000001';
    const token = '0x2000000000000000000000000000000000000002';
    const pair = '0x3000000000000000000000000000000000000003';
    process.env.ARC_MIGRATOR_ADDRESS = migrator;
    const { service } = make();
    const processEvent = jest.fn().mockResolvedValue(undefined);
    service.indexerService = { processEvent };

    const topicAddress = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;
    await service.processLog({
      address: migrator,
      topics: [
        keccak256(toBytes('TokenMigrated(address,address,uint256)')),
        topicAddress(token),
        topicAddress(pair),
      ],
      data: `0x${(123n).toString(16).padStart(64, '0')}`,
      blockNumber: '0x2a',
      transactionHash: '0xabc',
      logIndex: '0x4',
    });

    expect(processEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TokenMigrated', token, ammPair: pair, lpBurned: '123', blockNumber: 42, logIndex: 4,
    }));
  });

  it('ignores TokenMigrated events from an unconfigured emitter', async () => {
    process.env.ARC_MIGRATOR_ADDRESS = '0x1000000000000000000000000000000000000001';
    const { service } = make();
    const processEvent = jest.fn();
    service.indexerService = { processEvent };

    await service.processLog({
      address: '0x4000000000000000000000000000000000000004',
      topics: [keccak256(toBytes('TokenMigrated(address,address,uint256)'))],
      data: '0x', blockNumber: '0x2a', transactionHash: '0xdef', logIndex: '0x0',
    });

    expect(processEvent).not.toHaveBeenCalled();
  });
});
