import { IndexerService } from '../indexer.service';

describe('IndexerService idempotency and accounting', () => {
  const tokenRow = {
    id: 1,
    contract_address: '0x0000000000000000000000000000000000000001',
    real_usdc: '0',
    tokens_sold: '0',
  };

  function harness() {
    let tradeInserted = false;
    const clientQueries: Array<{ text: string; params?: any[] }> = [];
    const client = {
      query: jest.fn(async (text: string, params?: any[]) => {
        clientQueries.push({ text, params });
        if (text.includes('FROM tokens') && text.includes('WHERE curve_address')) {
          return { rows: [tokenRow], rowCount: 1 };
        }
        if (text.includes('INSERT INTO trades')) {
          if (tradeInserted) return { rows: [], rowCount: 0 };
          tradeInserted = true;
          return { rows: [{ id: 7 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const db = {
      connect: jest.fn(async () => client),
      queryOne: jest.fn(async (text: string) => {
        if (text.includes('FROM trades')) return { id: 7 };
        if (text.includes('FROM tokens')) return { contract_address: tokenRow.contract_address };
        return null;
      }),
    };
    const redis = {
      publishTokenEvent: jest.fn(async () => undefined),
      del: jest.fn(async () => undefined),
      delPattern: jest.fn(async () => undefined),
    };
    return {
      service: new IndexerService(db as any, redis as any),
      clientQueries,
      redis,
    };
  }

  it('does not repeat buy aggregates, referrals, snapshots, or publications on replay', async () => {
    const { service, clientQueries, redis } = harness();
    const event = {
      type: 'Buy',
      txHash: `0x${'1'.repeat(64)}`,
      blockNumber: 100,
      logIndex: 2,
      curveAddress: '0x0000000000000000000000000000000000000002',
      buyer: '0x0000000000000000000000000000000000000003',
      usdcIn: '1000000',
      fee: '10000',
      netUsdc: '990000',
      tokensOut: '1000000000000000000',
      price: '0.000001',
      accountingVersion: 2,
    };

    await service.processEvent(event as any);
    await service.processEvent(event as any);

    expect(clientQueries.filter(({ text }) => text.includes('UPDATE tokens SET'))).toHaveLength(1);
    expect(clientQueries.filter(({ text }) => text.includes('INSERT INTO users'))).toHaveLength(1);
    expect(clientQueries.filter(({ text }) => text.includes('UPDATE referrals'))).toHaveLength(1);
    expect(clientQueries.filter(({ text }) => text.includes('INSERT INTO price_snapshots'))).toHaveLength(1);
    expect(redis.publishTokenEvent).toHaveBeenCalledTimes(1);
  });

  it('uses authoritative V2 sell gross and fee values', async () => {
    const { service, clientQueries } = harness();
    await service.processEvent({
      type: 'Sell',
      txHash: `0x${'2'.repeat(64)}`,
      blockNumber: 101,
      logIndex: 3,
      curveAddress: '0x0000000000000000000000000000000000000002',
      seller: '0x0000000000000000000000000000000000000003',
      tokensIn: '1000000000000000000',
      usdcGross: '1000000',
      fee: '10000',
      usdcOut: '990000',
      price: '0.000001',
      accountingVersion: 2,
    } as any);

    const tradeInsert = clientQueries.find(({ text }) => text.includes('INSERT INTO trades'));
    expect(tradeInsert?.params?.[2]).toBe('1000000');
    const tokenUpdate = clientQueries.find(({ text }) => text.includes('UPDATE tokens SET'));
    expect(tokenUpdate?.params?.[3]).toBe('1000000');
    expect(tokenUpdate?.params?.[5]).toBe('5000');
    expect(tokenUpdate?.params?.[6]).toBe('5000');
  });
});
