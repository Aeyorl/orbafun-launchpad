import { TransactionFinalizerService } from '../transaction-finalizer.service';

describe('TransactionFinalizerService', () => {
  const buyIntent = {
    id: 'intent-1',
    reservation_id: 'intent-1',
    operation: 'buy' as const,
    agent_id: 7,
    status: 'reconciling',
    payload: {
      tokenAddress: '0xtoken',
      curveAddress: '0xcurve',
      usdcAmount: '100',
    },
  };

  it('returns false without accounting writes when another worker won the finalization race', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }) };
    const db = { transaction: jest.fn((work) => work(client)) };
    const service = new TransactionFinalizerService(db as any);

    await expect(service.finalizeSuccess('buy-intent', {
      status: 'success',
      txHash: '0xabc',
      tokenAmount: 250n,
      gasUsed: 9n,
    })).resolves.toBe(false);

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed buy output before accounting and lets the transaction roll back', async () => {
    const malformedIntent = {
      ...buyIntent,
      payload: { tokenAddress: '0xtoken', curveAddress: '0xcurve' },
    };
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [malformedIntent], rowCount: 1 }),
    };
    const db = { transaction: jest.fn((work) => work(client)) };
    const service = new TransactionFinalizerService(db as any);

    await expect(service.finalizeSuccess('buy-intent', {
      status: 'success',
      txHash: '0xabc',
      tokenAmount: 250n,
      gasUsed: 9n,
    })).rejects.toThrow('missing requested token or USDC amount');

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects the transaction when exactly one reservation cannot be confirmed', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [buyIntent], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });
    const db = { transaction: jest.fn((work) => work(client)) };
    const service = new TransactionFinalizerService(db as any);

    await expect(service.finalizeSuccess('buy-intent', {
      status: 'success',
      txHash: '0xabc',
      tokenAmount: 250n,
      gasUsed: 9n,
    })).rejects.toThrow('reservation intent-1 is not finalizable');

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('atomically finalizes a sell from the authoritative emitted USDC amount', async () => {
    const sellIntent = {
      ...buyIntent,
      id: 'sell-intent',
      reservation_id: 'position-reservation',
      operation: 'sell',
      payload: {
        tokenAddress: '0xtoken',
        curveAddress: '0xcurve',
        tokenAmount: '200',
      },
    };
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [sellIntent], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });
    const db = { transaction: jest.fn((work) => work(client)) };
    const service = new TransactionFinalizerService(db as any);

    const finalized = await service.finalizeSuccess('sell-intent', {
      status: 'success',
      txHash: '0xsell',
      usdcAmount: 175n,
      gasUsed: 13n,
    });

    expect(finalized).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ($1,$2,$3,$4,'sell',$5,$6,$7,'confirmed')"),
      [7, '0xtoken', '0xcurve', '0xsell', '175', '200', '13'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE agent_position_reservations'),
      ['position-reservation', '0xsell'],
    );
  });

  it('atomically finalizes a launch from authoritative emitted addresses', async () => {
    const launchIntent = {
      ...buyIntent,
      id: 'launch-intent',
      reservation_id: 'launch-reservation',
      operation: 'launch',
      payload: { name: 'Orbit', symbol: 'ORB', image: '', description: '', usdcAmount: '5000000' },
    };
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [launchIntent], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });
    const db = { transaction: jest.fn((work) => work(client)) };
    const service = new TransactionFinalizerService(db as any);

    const finalized = await service.finalizeSuccess('launch-intent', {
      status: 'success',
      txHash: '0xlaunch',
      tokenAddress: '0xemittedtoken',
      curveAddress: '0xemittedcurve',
      gasUsed: 11n,
    });

    expect(finalized).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_launches'),
      [
        7,
        '0xemittedtoken',
        '0xemittedcurve',
        '0xlaunch',
        'Orbit',
        'ORB',
        null,
        null,
        '5000000',
        '11',
      ],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE agent_spend_reservations'),
      ['launch-reservation', '0xlaunch'],
    );
  });

  it('atomically finalizes a delayed buy and owns every accounting write', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [buyIntent], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });
    const db = {
      transaction: jest.fn(async (work: any) => work(client)),
    };
    const service = new TransactionFinalizerService(db as any);

    const finalized = await service.finalizeSuccess('intent-1', {
      status: 'success',
      txHash: '0xabc',
      gasUsed: 9n,
      tokenAmount: 200n,
      usdcAmount: 100n,
    });

    expect(finalized).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain("status IN ('broadcast', 'reconciling')");
    expect(client.query.mock.calls[0][0]).toContain("status = 'succeeded'");
    const sql = client.query.mock.calls.map((call: any[]) => call[0]).join('\n');
    expect(sql).toContain('INSERT INTO agent_trades');
    expect(sql).toContain('ON CONFLICT (tx_hash) DO NOTHING');
    expect(sql).toContain('UPDATE agent_spend_reservations');
    expect(sql).toContain('INSERT INTO agent_position_reservations');
    expect(sql).toContain('ON CONFLICT (transaction_intent_id) DO NOTHING');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_trades'),
      [7, '0xtoken', '0xcurve', '0xabc', '100', '200', '9'],
    );
  });
});
