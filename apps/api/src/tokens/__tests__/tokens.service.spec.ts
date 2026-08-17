import { TokensService } from '../tokens.service';

describe('TokensService AMM volume aggregation', () => {
  const originalPublicFactories = process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES;

  beforeEach(() => {
    process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES = '0xf09fc443d4f0f217f1b65d112b5fb8928a4ff09e';
  });

  afterAll(() => {
    if (originalPublicFactories === undefined) delete process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES;
    else process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES = originalPublicFactories;
  });

  const make = () => {
    const db = { query: jest.fn() };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new TokensService(db as any, redis as any), db, redis };
  };

  it('refreshes rolling volume from bonding-curve trades and AMM swaps for graduated tokens', async () => {
    const { service, db } = make();
    db.query.mockResolvedValue({ rows: [] });

    await service.refreshVolume24h();

    const query = db.query.mock.calls[0][0] as string;
    expect(query).toContain('FROM amm_swaps swap');
    expect(query).toContain('CASE WHEN swap.is_buy THEN swap.usdc_in ELSE swap.usdc_out END');
    expect(query).not.toContain("t.status = 'active'");
  });

  it('includes AMM swap value in platform 24h volume', async () => {
    const { service, db } = make();
    db.query.mockResolvedValue({
      rows: [{ total_tokens: 1, active_tokens: 0, graduated_tokens: 1, volume_24h_micro: '2500000' }],
    });

    const stats = await service.getPlatformStats();

    const query = db.query.mock.calls[0][0] as string;
    expect(query).toContain('FROM amm_swaps swap');
    expect(stats.volume_24h).toBe('2.500000');
  });
});
