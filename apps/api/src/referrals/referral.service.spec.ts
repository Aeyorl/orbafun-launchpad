import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReferralService } from './referral.service';

describe('ReferralService partner attribution', () => {
  const partnerWallet = '0x0000000000000000000000000000000000000011';
  const referredWallet = '0x0000000000000000000000000000000000000022';

  function harness() {
    const client = {
      query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
      release: jest.fn(),
    };
    const db = {
      query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
      queryOne: jest.fn(),
      queryRows: jest.fn<Promise<any[]>, any[]>(async () => []),
      connect: jest.fn(async () => client),
    };
    return { client, db, service: new ReferralService(db as any) };
  }

  it('resolves a readable partner code and snapshots its reward rate', async () => {
    const { db, service } = harness();
    db.queryOne
      .mockResolvedValueOnce({
        wallet: partnerWallet,
        kind: 'partner',
        reward_bps: 20,
        active: true,
      })
      .mockResolvedValueOnce({ referrer_wallet: partnerWallet, referral_code: 'spyzer' });

    await expect(service.attributeReferral('Spyzer', referredWallet)).resolves.toEqual({
      attributed: true,
      referrer_wallet: partnerWallet,
      referral_code: 'spyzer',
      already: false,
    });

    expect(db.queryOne).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO referrals'),
      [partnerWallet, referredWallet, 'spyzer', 20],
    );
  });

  it('resolves a permanent profile referral code through the registry', async () => {
    const { db, service } = harness();
    db.queryOne
      .mockResolvedValueOnce({
        wallet: partnerWallet,
        kind: 'profile',
        reward_bps: null,
        active: null,
      })
      .mockResolvedValueOnce({
        referrer_wallet: partnerWallet,
        referral_code: 'regular-user-7k3p',
      });

    await expect(service.attributeReferral('Regular-User-7K3P', referredWallet)).resolves.toEqual({
      attributed: true,
      referrer_wallet: partnerWallet,
      referral_code: 'regular-user-7k3p',
      already: false,
    });

    expect(db.queryOne).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO referrals'),
      [partnerWallet, referredWallet, 'regular-user-7k3p', 10],
    );
  });

  it('keeps an old plain-name alias resolving to the same wallet', async () => {
    const { db, service } = harness();
    db.queryOne
      .mockResolvedValueOnce({
        wallet: partnerWallet,
        kind: 'legacy',
        reward_bps: null,
        active: null,
      })
      .mockResolvedValueOnce({
        referrer_wallet: partnerWallet,
        referral_code: 'mason',
      });

    await expect(service.attributeReferral('mason', referredWallet)).resolves.toMatchObject({
      referrer_wallet: partnerWallet,
      referral_code: 'mason',
    });
  });

  it('keeps first-click attribution when a competing referral races the insert', async () => {
    const { db, service } = harness();
    const competingWallet = '0x0000000000000000000000000000000000000033';
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ referrer_wallet: competingWallet, referral_code: null });

    await expect(service.attributeReferral(partnerWallet, referredWallet)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects partner rates above the full protocol trading fee', async () => {
    const { service } = harness();
    await expect(
      service.createPartner({
        code: 'spyzer',
        displayName: 'Spyzer',
        wallet: partnerWallet,
        rewardBps: 101,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a partner code already reserved by any referral source', async () => {
    const { client, service } = harness();

    await expect(
      service.createPartner({
        code: 'mason-7k3p',
        displayName: 'Mason Partner',
        wallet: partnerWallet,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('uses each attribution reward rate when computing referral totals', async () => {
    const { db, service } = harness();
    db.queryOne
      .mockResolvedValueOnce({
        total_referred: '1',
        active_referred: '1',
        total_volume_usdc: '1000000',
        reward_earned_usdc: '2000',
      })
      .mockResolvedValueOnce({ referral_code: 'spyzer-7k3p' });

    await service.getReferralStats(partnerWallet);

    expect(db.queryOne.mock.calls[0][0]).toContain(
      'SUM(a.volume_usdc * r.reward_bps / 10000)',
    );
    expect(db.queryOne.mock.calls[0][1]).toHaveLength(2);
  });

  it('uses each attribution reward rate in referred-wallet rows', async () => {
    const { db, service } = harness();
    db.queryOne.mockResolvedValueOnce({ count: '0' });

    await service.getReferredWallets(partnerWallet, 10, 5);

    expect(db.queryRows.mock.calls[0][0]).toContain(
      'SUM(a.volume_usdc * r.reward_bps / 10000)',
    );
    expect(db.queryRows.mock.calls[0][1]).toEqual([
      partnerWallet,
      expect.any(Array),
      10,
      5,
    ]);
  });

  it('uses each attribution reward rate on the referral leaderboard', async () => {
    const { db, service } = harness();

    await service.getTopReferrers(10);

    expect(db.queryRows.mock.calls[0][0]).toContain(
      'SUM(a.volume_usdc * r.reward_bps / 10000)',
    );
    expect(db.queryRows.mock.calls[0][1]).toEqual([expect.any(Array), 10]);
  });
});
