import { ReservationReconcilerService } from '../reservation-reconciler.service';

describe('ReservationReconcilerService durable intent lifecycle', () => {
  const intent = {
    id: 'i1', reservation_id: 'i1', operation: 'buy', agent_id: 7,
    tx_hash: '0xabc', signed_tx: '0xraw', payload: {
      tokenAddress: '0xtoken', curveAddress: '0xcurve', usdcAmount: '100', tokenAmount: '200',
    },
  };

  function build(chainState: any, claimed = [intent]) {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      release: jest.fn(),
    };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: claimed })
        .mockResolvedValue({ rows: [], rowCount: 1 }),
      transaction: jest.fn(async (work: any) => work(client)),
    };
    const deployer = {
      rebroadcastSignedTransaction: jest.fn().mockResolvedValue(undefined),
      inspectTransaction: jest.fn().mockResolvedValue(chainState),
    };
    const finalizer = {
      finalizeSuccess: jest.fn().mockResolvedValue(true),
    };
    return {
      db,
      client,
      deployer,
      finalizer,
      service: new ReservationReconcilerService(db as any, deployer as any, finalizer as any),
    };
  }

  it('atomically expires only unsigned, unbroadcast stale created intents and releases reservations', async () => {
    const { db, service } = build({ status: 'unknown' }, []);

    await (service as any).expireStaleCreated();

    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain("SET status = 'expired'");
    expect(sql).toContain("status = 'created'");
    expect(sql).toContain('signed_tx IS NULL');
    expect(sql).toContain('tx_hash IS NULL');
    expect(sql).toContain("created_at < NOW() - INTERVAL '5 minutes'");
    expect(sql).toContain('UPDATE agent_spend_reservations');
    expect(sql).toContain('UPDATE agent_position_reservations');
    expect(sql).toContain("SET status = 'released'");
    expect(sql).toContain("status = 'pending'");
  });

  it('claims intents using a PostgreSQL lease and SKIP LOCKED', async () => {
    const { db, service } = build({ status: 'unknown' });
    await service.reconcile();
    expect(db.query.mock.calls[1][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(db.query.mock.calls[1][0]).toContain('lease_expires_at');
  });

  it('rebroadcasts durable signed bytes after a crash immediately after signer return', async () => {
    const { deployer, service } = build({ status: 'unknown' });
    await service.reconcile();
    expect(deployer.rebroadcastSignedTransaction).toHaveBeenCalledWith('0xraw');
  });

  it('keeps timeout, dropped-looking, and provider errors reserved', async () => {
    const { client, service } = build({ status: 'unknown' });
    await service.reconcile();
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("status = 'released'"), expect.anything());
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'broadcast'"), ['i1']);
  });

  it('delegates successful reconciliation to the shared transaction finalizer', async () => {
    const state = { status: 'success', txHash: '0xabc', gasUsed: 9n, tokenAmount: 200n };
    const { client, db, finalizer, service } = build(state);
    await service.reconcile();
    expect(finalizer.finalizeSuccess).toHaveBeenCalledWith('i1', state);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('releases a definitive revert exactly once using conditional transitions', async () => {
    const { client, service } = build({ status: 'reverted', txHash: '0xabc' });
    await service.reconcile();
    const sql = client.query.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(sql).toContain("status = 'released'");
    expect(sql).toContain("status = 'reconciling'");
    expect(sql).toContain("status = 'reverted'");
  });

  it('persists a replacement hash and leaves the intent reserved for another receipt check', async () => {
    const { client, service } = build({ status: 'replaced', txHash: '0xdef' });
    await service.reconcile();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('tx_hash = $2'), ['i1', '0xdef']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'broadcast'"), ['i1', '0xdef']);
  });

  it('two reconcilers and duplicate ticks are safe because only leased reconciling rows can transition', async () => {
    const first = build({ status: 'success', txHash: '0xabc', gasUsed: 9n });
    const second = build({ status: 'success', txHash: '0xabc', gasUsed: 9n }, []);
    await Promise.all([first.service.reconcile(), second.service.reconcile()]);
    expect(first.finalizer.finalizeSuccess).toHaveBeenCalledTimes(1);
    expect(second.db.transaction).not.toHaveBeenCalled();
    expect(second.finalizer.finalizeSuccess).not.toHaveBeenCalled();
  });
});
