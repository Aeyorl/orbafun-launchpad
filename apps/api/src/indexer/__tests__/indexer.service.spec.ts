import { IndexerService } from '../indexer.service';

describe('IndexerService idempotency and accounting', () => {
  const tokenRow = {
    id: 1,
    contract_address: '0x0000000000000000000000000000000000000001',
    real_usdc: '0',
    tokens_sold: '0',
  };

  function harness() {
    const insertedTrades = new Set<string>();
    const clientQueries: Array<{ text: string; params?: any[] }> = [];
    const client = {
      query: jest.fn(async (text: string, params?: any[]) => {
        clientQueries.push({ text, params });
        if (text.includes('FROM tokens') && text.includes('WHERE curve_address')) {
          return { rows: [tokenRow], rowCount: 1 };
        }
        if (text.includes('INSERT INTO trades')) {
          const key = `${params?.[10]}:${params?.[12]}`;
          if (insertedTrades.has(key)) return { rows: [], rowCount: 0 };
          insertedTrades.add(key);
          return { rows: [{ id: insertedTrades.size, tx_hash: params?.[10], log_index: params?.[12] }], rowCount: 1 };
        }
        if (text.includes('FROM wallet_token_positions') && text.includes('FOR UPDATE')) {
          return {
            rows: [{
              quantity_base_units: '0',
              remaining_cost_usdc: '0',
              cost_of_tokens_sold_usdc: '0',
              net_sale_proceeds_usdc: '0',
              realized_pnl_usdc: '0',
              total_bought_usdc: '0',
              total_sold_usdc: '0',
              buy_count: 0,
              sell_count: 0,
              basis_status: 'complete',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const db = {
      connect: jest.fn(async () => client),
      queryOne: jest.fn(async (text: string) => {
        if (text.includes('WITH wallet_activity')) return null;
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
      db,
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

  it('publishes returned trades without a readback and coalesces burst cache invalidation', async () => {
    jest.useFakeTimers();
    const { service, db, redis } = harness();
    const baseEvent = {
      type: 'Buy',
      blockNumber: 102,
      curveAddress: '0x0000000000000000000000000000000000000002',
      buyer: '0x0000000000000000000000000000000000000003',
      usdcIn: '10000',
      fee: '100',
      netUsdc: '9900',
      tokensOut: '1000000000000000',
      price: '0.000001',
      accountingVersion: 2,
    };

    await service.processEvent({ ...baseEvent, txHash: `0x${'3'.repeat(64)}`, logIndex: 1 } as any);
    await service.processEvent({ ...baseEvent, txHash: `0x${'4'.repeat(64)}`, logIndex: 2 } as any);
    await jest.runAllTimersAsync();

    expect(redis.publishTokenEvent).toHaveBeenCalledTimes(2);
    expect(db.queryOne).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM trades'),
      expect.anything(),
    );
    expect(redis.delPattern).toHaveBeenCalledWith('tokens:list:*');
    expect(redis.delPattern).toHaveBeenCalledWith('leaderboard:*');
    expect(redis.delPattern).toHaveBeenCalledWith(expect.stringMatching(/^token:\*:/));
    expect(redis.delPattern).toHaveBeenCalledWith(expect.stringMatching(/^candles:\*:/));
    expect(redis.delPattern).toHaveBeenCalledWith('stats:platform:*');
    jest.useRealTimers();
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
    expect(tradeInsert?.params?.[3]).toBe('10000');
    expect(tradeInsert?.params?.[4]).toBe('990000');
    const tokenUpdate = clientQueries.find(({ text }) => text.includes('UPDATE tokens SET'));
    expect(tokenUpdate?.params?.[3]).toBe('1000000');
    expect(tokenUpdate?.params?.[5]).toBe('5000');
    expect(tokenUpdate?.params?.[6]).toBe('5000');
  });

  it('ignores TokenCreated events from factories outside the indexed scope', async () => {
    const { service, db, redis } = harness();

    await service.processEvent({
      type: 'TokenCreated',
      txHash: `0x${'5'.repeat(64)}`,
      blockNumber: 103,
      logIndex: 0,
      token: '0x0000000000000000000000000000000000000010',
      curve: '0x0000000000000000000000000000000000000011',
      creator: '0x0000000000000000000000000000000000000012',
      name: 'Legacy',
      symbol: 'OLD',
      image: '',
      factoryAddress: '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b',
    } as any);

    expect(db.connect).not.toHaveBeenCalled();
    expect(redis.publishTokenEvent).not.toHaveBeenCalled();
  });
});
