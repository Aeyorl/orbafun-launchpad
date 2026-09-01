import { migratePermanentReferralCodes } from './referral-code-migration';

describe('migratePermanentReferralCodes', () => {
  it('upgrades an existing plain link once and preserves it as a legacy alias', async () => {
    const users = [{
      id: 1,
      wallet: '0x0000000000000000000000000000000000000011',
      username: 'Mason',
      referral_slug: 'mason',
      referral_code: null as string | null,
    }];
    const aliases = new Map<string, string>();
    const registry = new Map<string, { wallet: string; kind: string }>();
    const client = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('WITH code_sources')) return { rows: [] };
        if (sql.includes('SELECT code, wallet FROM referral_partners')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT slug AS code')) {
          return {
            rows: [...aliases].map(([code, wallet]) => ({ code, wallet })),
          };
        }
        if (sql.includes('SELECT referral_code AS code')) {
          return {
            rows: users
              .filter((user) => user.referral_code)
              .map((user) => ({ code: user.referral_code, wallet: user.wallet })),
          };
        }
        if (sql.includes('SELECT wallet, username, referral_slug')) {
          return { rows: users.filter((user) => !user.referral_code) };
        }
        if (sql.includes('INSERT INTO referral_code_registry')) {
          const [code, wallet, suppliedKind] = params;
          const kind = suppliedKind || 'profile';
          if (registry.has(code)) return { rows: [] };
          registry.set(code, { wallet, kind });
          return { rows: [{ code, wallet, kind }] };
        }
        if (sql.includes('SELECT wallet, kind FROM referral_code_registry')) {
          const existing = registry.get(params[0]);
          return { rows: existing ? [existing] : [] };
        }
        if (sql.includes('INSERT INTO user_referral_aliases')) {
          aliases.set(params[0], params[1]);
          return { rows: [] };
        }
        if (sql.includes('UPDATE users SET referral_code')) {
          const user = users.find((row) => row.wallet === params[0]);
          if (user && !user.referral_code) user.referral_code = params[1];
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };

    await expect(
      migratePermanentReferralCodes(client as any, () => 'mason-7k3p'),
    ).resolves.toBe(1);
    await expect(
      migratePermanentReferralCodes(client as any, () => 'unused-code'),
    ).resolves.toBe(0);

    expect(users[0].referral_code).toBe('mason-7k3p');
    expect(aliases.get('mason')).toBe(users[0].wallet);
    expect(registry.get('mason')).toEqual({
      wallet: users[0].wallet,
      kind: 'legacy',
    });
    expect(registry.get('mason-7k3p')).toEqual({
      wallet: users[0].wallet,
      kind: 'profile',
    });
  });

  it('aborts when existing wallets already claim the same code', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [{ code: 'mason' }] })),
    };

    await expect(
      migratePermanentReferralCodes(client as any, () => 'mason-7k3p'),
    ).rejects.toThrow('Existing referral code collision detected for "mason"');
  });
});
