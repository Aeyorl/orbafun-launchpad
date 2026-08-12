import { AgentsService } from '../agents.service';
import { BroadcastTransactionError } from '../deployer.service';

const AGENT = {
  id: 7,
  agentId: 'agent_test',
  name: 'Test Agent',
  dailyLimit: 100_000_000n,
  monthlyLimit: 1_000_000_000n,
};
const TOKEN = '0x1111111111111111111111111111111111111111';
const CURVE = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'a'.repeat(64)}`;

function makeService() {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const db = {
    query: jest.fn(),
    queryOne: jest.fn(),
    queryRows: jest.fn(),
    connect: jest.fn().mockResolvedValue(client),
    transaction: jest.fn(),
  };
  const deployer = {
    isConfigured: jest.fn().mockReturnValue(true),
    getBalance: jest.fn().mockResolvedValue(10n ** 21n),
    getTokenBalance: jest.fn().mockResolvedValue(10n ** 24n),
    launchToken: jest.fn(),
    buyTokens: jest.fn(),
    sellTokens: jest.fn(),
  };
  const finalizer = {
    finalizeSuccess: jest.fn().mockResolvedValue(true),
    send: jest.fn(),
  };
  const service = new AgentsService(
    db as any,
    deployer as any,
    {} as any,
    {} as any,
    finalizer as any,
  );
  return { service, db, deployer, client, finalizer };
}

describe('AgentsService durable funded-action intents', () => {
  beforeAll(() => {
    process.env.PLATFORM_DEPLOYER_DAILY_LIMIT_MICRO_USDC = '1000000000000';
    process.env.PLATFORM_DEPLOYER_MONTHLY_LIMIT_MICRO_USDC = '10000000000000';
  });

  it('creates a spend reservation and exactly one linked intent atomically', async () => {
    const { service, db, client } = makeService();
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1 }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ active: true, daily_limit: '100000000', monthly_limit: '1000000000' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ daily: '0', monthly: '0' }] })
      .mockResolvedValueOnce({ rowCount: 1 }) // reservation
      .mockResolvedValueOnce({ rowCount: 1 }) // intent
      .mockResolvedValueOnce(undefined); // COMMIT

    const payload = { tokenAddress: TOKEN, curveAddress: CURVE, usdcAmount: '5000000' };
    const intentId = await (service as any).reserveSpending(AGENT.id, 'buy', 5_000_000n, payload);

    expect(db.connect).toHaveBeenCalledTimes(1);
    const reservationInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO agent_spend_reservations'),
    );
    const intentInserts = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO agent_transaction_intents'),
    );
    expect(reservationInsert?.[1][0]).toBe(intentId);
    expect(intentInserts).toHaveLength(1);
    expect(intentInserts[0][1]).toEqual([
      intentId,
      intentId,
      AGENT.id,
      'buy',
      JSON.stringify(payload),
    ]);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('creates a position reservation and exactly one linked sell intent atomically', async () => {
    const { service, client } = makeService();
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ active: true }] })
      .mockResolvedValueOnce({ rows: [{ available_amount: '1000' }] })
      .mockResolvedValueOnce({ rowCount: 1 }) // reservation
      .mockResolvedValueOnce({ rowCount: 1 }) // intent
      .mockResolvedValueOnce(undefined); // COMMIT

    const payload = { tokenAddress: TOKEN, curveAddress: CURVE, tokenAmount: '100' };
    const intentId = await (service as any).reservePosition(AGENT.id, TOKEN, 100n, payload);

    const intentInserts = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO agent_transaction_intents'),
    );
    expect(intentInserts).toHaveLength(1);
    expect(intentInserts[0][1]).toEqual([
      intentId,
      intentId,
      AGENT.id,
      'sell',
      JSON.stringify(payload),
    ]);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('propagates the launch intent id to the signer', async () => {
    const { service, deployer } = makeService();
    jest.spyOn(service as any, 'reserveSpending').mockResolvedValue('launch-intent');
    jest.spyOn(service as any, 'markReservationBroadcast').mockResolvedValue(undefined);
    deployer.launchToken.mockRejectedValue(new BroadcastTransactionError('unresolved', TX_HASH));

    await expect(service.launchToken(AGENT, { name: 'Orbit', symbol: 'ORB' })).rejects.toThrow('unresolved');

    expect((service as any).reserveSpending).toHaveBeenCalledWith(
      AGENT.id,
      'launch',
      5_000_000n,
      expect.objectContaining({ name: 'Orbit', symbol: 'ORB', usdcAmount: '5000000' }),
    );
    expect(deployer.launchToken).toHaveBeenCalledWith('Orbit', 'ORB', '', '', 'launch-intent');
  });

  it('routes an immediate successful launch through the shared finalizer', async () => {
    const { service, db, deployer, finalizer } = makeService();
    jest.spyOn(service as any, 'reserveSpending').mockResolvedValue('launch-intent');
    deployer.launchToken.mockResolvedValue({
      txHash: TX_HASH,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      creationFee: 5_000_000n,
      gasUsed: 11n,
    });

    await service.launchToken(AGENT, { name: 'Orbit', symbol: 'ORB' });

    expect(finalizer.finalizeSuccess).toHaveBeenCalledWith('launch-intent', {
      status: 'success',
      txHash: TX_HASH,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      gasUsed: 11n,
    });
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('propagates the buy intent id to the signer', async () => {
    const { service, db, deployer } = makeService();
    db.queryOne.mockResolvedValue({ curve_address: CURVE });
    jest.spyOn(service as any, 'reserveSpending').mockResolvedValue('buy-intent');
    jest.spyOn(service as any, 'markReservationBroadcast').mockResolvedValue(undefined);
    deployer.buyTokens.mockRejectedValue(new BroadcastTransactionError('unresolved', TX_HASH));

    await expect(service.buyTokens(AGENT, TOKEN, 5_000_000n, 250n)).rejects.toThrow('unresolved');

    expect((service as any).reserveSpending).toHaveBeenCalledWith(
      AGENT.id,
      'buy',
      5_000_000n,
      { tokenAddress: TOKEN, curveAddress: CURVE, usdcAmount: '5000000' },
    );
    expect(deployer.buyTokens).toHaveBeenCalledWith(CURVE, 5_000_000n, 250n, 'buy-intent');
  });

  it('routes an immediate successful buy through the shared finalizer', async () => {
    const { service, db, deployer, finalizer } = makeService();
    db.queryOne.mockResolvedValue({ curve_address: CURVE });
    jest.spyOn(service as any, 'reserveSpending').mockResolvedValue('buy-intent');
    deployer.buyTokens.mockResolvedValue({
      txHash: TX_HASH,
      usdcAmount: 5_000_000n,
      tokenAmount: 250n,
      gasUsed: 9n,
    });

    await service.buyTokens(AGENT, TOKEN, 5_000_000n, 250n);

    expect(finalizer.finalizeSuccess).toHaveBeenCalledWith('buy-intent', {
      status: 'success',
      txHash: TX_HASH,
      usdcAmount: 5_000_000n,
      tokenAmount: 250n,
      gasUsed: 9n,
    });
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('routes an immediate successful sell through the shared finalizer', async () => {
    const { service, db, deployer, finalizer } = makeService();
    db.queryOne.mockResolvedValue({ curve_address: CURVE });
    jest.spyOn(service as any, 'reservePosition').mockResolvedValue('sell-intent');
    deployer.getTokenBalance.mockResolvedValue(1000n);
    deployer.sellTokens.mockResolvedValue({
      txHash: TX_HASH,
      usdcAmount: 175n,
      tokenAmount: 100n,
      gasUsed: 13n,
    });

    await service.sellTokens(AGENT, TOKEN, 100n, 250n);

    expect(finalizer.finalizeSuccess).toHaveBeenCalledWith('sell-intent', {
      status: 'success',
      txHash: TX_HASH,
      usdcAmount: 175n,
      gasUsed: 13n,
    });
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('propagates the sell intent id to the signer', async () => {
    const { service, db, deployer } = makeService();
    db.queryOne.mockResolvedValue({ curve_address: CURVE });
    jest.spyOn(service as any, 'reservePosition').mockResolvedValue('sell-intent');
    jest.spyOn(service as any, 'markPositionReservationBroadcast').mockResolvedValue(undefined);
    deployer.sellTokens.mockRejectedValue(new BroadcastTransactionError('unresolved', TX_HASH));

    await expect(service.sellTokens(AGENT, TOKEN, 100n, 250n)).rejects.toThrow('unresolved');

    expect((service as any).reservePosition).toHaveBeenCalledWith(
      AGENT.id,
      TOKEN,
      100n,
      { tokenAddress: TOKEN, curveAddress: CURVE, tokenAmount: '100' },
    );
    expect(deployer.sellTokens).toHaveBeenCalledWith(TOKEN, CURVE, 100n, 250n, 'sell-intent');
  });
});
