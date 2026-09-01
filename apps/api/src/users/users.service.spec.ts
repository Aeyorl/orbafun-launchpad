import { BadRequestException } from '@nestjs/common';
import * as referralCodes from '../referrals/referral-code';
import { UsersService } from './users.service';

describe('UsersService permanent referral codes', () => {
  const wallet = '0x0000000000000000000000000000000000000011';

  function harness(options?: {
    existingCode?: string | null;
    reservationResults?: boolean[];
  }) {
    const reservations = [...(options?.reservationResults ?? [true])];
    let allocatedCode = options?.existingCode ?? null;
    const client = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('SELECT referral_code') && sql.includes('FOR UPDATE')) {
          return { rows: [{ referral_code: options?.existingCode ?? null }] };
        }
        if (sql.includes('INSERT INTO referral_code_registry')) {
          const accepted = reservations.shift() ?? true;
          if (accepted) allocatedCode = params[0];
          return { rows: accepted ? [{ code: params[0] }] : [] };
        }
        if (sql.includes('SELECT wallet, username, referral_code')) {
          return {
            rows: [{
              wallet: params[0],
              username: 'Mason',
              referral_code: allocatedCode,
              referral_slug: allocatedCode,
              avatar: null,
            }],
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const db = {
      query: jest.fn(async () => ({ rowCount: 1, rows: [] })),
      queryOne: jest.fn(),
      connect: jest.fn(async () => client),
    };
    const redis = { del: jest.fn(async () => undefined) };
    const service = new UsersService(db as any, redis as any, {} as any);
    return { client, db, redis, service };
  }

  afterEach(() => jest.restoreAllMocks());

  it('allocates a permanent suffixed code when the first username is set', async () => {
    jest.spyOn(referralCodes, 'generateReferralCode').mockReturnValue('alice-arc-7k3p');
    const { client, redis, service } = harness();

    await expect(
      service.updateProfile(wallet, { username: '@Alice_Arc' }),
    ).resolves.toMatchObject({
      wallet,
      referral_code: 'alice-arc-7k3p',
      referral_slug: 'alice-arc-7k3p',
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO referral_code_registry'),
      ['alice-arc-7k3p', wallet],
    );
    expect(redis.del).toHaveBeenCalledWith(expect.stringContaining(wallet));
  });

  it('lets display names repeat because permanent codes remain unique', async () => {
    jest
      .spyOn(referralCodes, 'generateReferralCode')
      .mockReturnValueOnce('mason-7k3p')
      .mockReturnValueOnce('mason-r8w2');
    const first = harness();
    const second = harness();

    const firstProfile = await first.service.updateProfile(wallet, {
      username: 'Mason',
    });
    const secondProfile = await second.service.updateProfile(
      '0x0000000000000000000000000000000000000022',
      { username: 'Mason' },
    );

    expect(firstProfile?.referral_code).toBe('mason-7k3p');
    expect(secondProfile?.referral_code).toBe('mason-r8w2');
  });

  it('keeps the permanent code unchanged when the profile is renamed', async () => {
    const { client, service } = harness({ existingCode: 'mason-7k3p' });

    await expect(
      service.updateProfile(wallet, { username: 'MasonNew' }),
    ).resolves.toMatchObject({ referral_code: 'mason-7k3p' });
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO referral_code_registry'),
      ),
    ).toBe(false);
  });

  it('retries allocation when another profile reserved a candidate', async () => {
    jest
      .spyOn(referralCodes, 'generateReferralCode')
      .mockReturnValueOnce('mason-aaaa')
      .mockReturnValueOnce('mason-bbbb');
    const { client, service } = harness({ reservationResults: [false, true] });

    await expect(
      service.updateProfile(wallet, { username: 'Mason' }),
    ).resolves.toMatchObject({ referral_code: 'mason-bbbb' });
    const reservations = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO referral_code_registry'),
    );
    expect(reservations).toHaveLength(2);
  });

  it('stores an uploaded avatar without changing the permanent code', async () => {
    const { db, redis, service } = harness();
    db.queryOne.mockResolvedValueOnce({
      wallet,
      username: 'Alice_Arc',
      referral_code: 'alice-arc-7k3p',
      referral_slug: 'alice-arc-7k3p',
      avatar: 'ipfs://bafybeiprofilephoto',
    });

    await expect(
      service.updateProfile(wallet, { avatar: ' ipfs://bafybeiprofilephoto ' }),
    ).resolves.toMatchObject({
      referral_code: 'alice-arc-7k3p',
      avatar: 'ipfs://bafybeiprofilephoto',
    });
    expect(redis.del).toHaveBeenCalledWith(expect.stringContaining(wallet));
  });

  it('rejects unsafe avatar URLs', async () => {
    const { service } = harness();

    await expect(
      service.updateProfile(wallet, { avatar: 'javascript:alert(1)' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
