import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService profile referral names', () => {
  const wallet = '0x0000000000000000000000000000000000000011';

  function harness() {
    const db = {
      query: jest.fn(async () => ({ rowCount: 1, rows: [] })),
      queryOne: jest.fn(),
    };
    const redis = {
      del: jest.fn(async () => undefined),
    };
    const service = new UsersService(db as any, redis as any, {} as any);
    return { db, redis, service };
  }

  it('stores a display username and a normalized unique referral slug', async () => {
    const { db, redis, service } = harness();
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ referral_slug: null })
      .mockResolvedValueOnce({ wallet, username: 'Alice_Arc', referral_slug: 'alice-arc' });

    await expect(service.updateProfile(wallet, { username: '@Alice_Arc' })).resolves.toEqual({
      wallet,
      username: 'Alice_Arc',
      referral_slug: 'alice-arc',
    });
    expect(db.queryOne).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE users'),
      [wallet, 'Alice_Arc', 'alice-arc'],
    );
    expect(redis.del).toHaveBeenCalledWith(`user:${wallet}`);
  });

  it('keeps the previous name as an alias when a profile is renamed', async () => {
    const { db, service } = harness();
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ referral_slug: 'alice-arc' })
      .mockResolvedValueOnce({ wallet, username: 'AliceNew', referral_slug: 'alicenew' });

    await service.updateProfile(wallet, { username: 'AliceNew' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_referral_aliases'),
      ['alice-arc', wallet],
    );
  });

  it('does not let a profile claim another affiliate code', async () => {
    const { db, service } = harness();
    db.queryOne.mockResolvedValueOnce({
      wallet: '0x0000000000000000000000000000000000000022',
    });

    await expect(service.updateProfile(wallet, { username: 'Spyzer' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
