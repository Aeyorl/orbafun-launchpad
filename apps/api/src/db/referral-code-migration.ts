import type { PoolClient } from 'pg';
import { generateReferralCode } from '../referrals/referral-code';

type CodeKind = 'profile' | 'legacy' | 'partner';

const MAX_ALLOCATION_ATTEMPTS = 20;

async function reserveExistingCode(
  client: PoolClient,
  code: string,
  wallet: string,
  kind: CodeKind,
) {
  const result = await client.query<{ wallet: string; kind: CodeKind }>(
    `INSERT INTO referral_code_registry (code, wallet, kind)
     VALUES ($1, $2, $3)
     ON CONFLICT (code) DO NOTHING
     RETURNING wallet, kind`,
    [code, wallet, kind],
  );
  if (result.rows[0]) return;

  const existing = await client.query<{ wallet: string; kind: CodeKind }>(
    `SELECT wallet, kind FROM referral_code_registry WHERE code = $1`,
    [code],
  );
  if (existing.rows[0]?.wallet !== wallet) {
    throw new Error(`Referral code collision detected for "${code}"`);
  }
}

async function allocateProfileCode(
  client: PoolClient,
  username: string,
  wallet: string,
  generateCandidate: (username: string) => string,
) {
  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const candidate = generateCandidate(username);
    const reserved = await client.query<{ code: string }>(
      `INSERT INTO referral_code_registry (code, wallet, kind)
       VALUES ($1, $2, 'profile')
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [candidate, wallet],
    );
    if (reserved.rows[0]) return candidate;
  }
  throw new Error(`Unable to allocate a unique referral code for ${wallet}`);
}

export async function migratePermanentReferralCodes(
  client: PoolClient,
  generateCandidate: (username: string) => string = generateReferralCode,
) {
  const conflicts = await client.query<{ code: string }>(
    `WITH code_sources AS (
       SELECT code, wallet FROM referral_partners
       UNION ALL
       SELECT slug AS code, wallet FROM user_referral_aliases
       UNION ALL
       SELECT referral_code AS code, wallet
       FROM users WHERE referral_code IS NOT NULL
       UNION ALL
       SELECT referral_slug AS code, wallet
       FROM users
       WHERE referral_code IS NULL AND referral_slug IS NOT NULL
     )
     SELECT code
     FROM code_sources
     GROUP BY code
     HAVING COUNT(DISTINCT wallet) > 1
     LIMIT 1`,
  );
  if (conflicts.rows[0]) {
    throw new Error(
      `Existing referral code collision detected for "${conflicts.rows[0].code}"`,
    );
  }

  const partners = await client.query<{ code: string; wallet: string }>(
    `SELECT code, wallet FROM referral_partners ORDER BY code`,
  );
  for (const partner of partners.rows) {
    await reserveExistingCode(client, partner.code, partner.wallet, 'partner');
  }

  const aliases = await client.query<{ code: string; wallet: string }>(
    `SELECT slug AS code, wallet FROM user_referral_aliases ORDER BY slug`,
  );
  for (const alias of aliases.rows) {
    await reserveExistingCode(client, alias.code, alias.wallet, 'legacy');
  }

  const currentCodes = await client.query<{ code: string; wallet: string }>(
    `SELECT referral_code AS code, wallet
     FROM users
     WHERE referral_code IS NOT NULL
     ORDER BY wallet`,
  );
  for (const current of currentCodes.rows) {
    await reserveExistingCode(client, current.code, current.wallet, 'profile');
  }

  const pending = await client.query<{
    wallet: string;
    username: string;
    referral_slug: string | null;
  }>(
    `SELECT wallet, username, referral_slug
     FROM users
     WHERE username IS NOT NULL AND referral_code IS NULL
     ORDER BY id
     FOR UPDATE`,
  );

  for (const user of pending.rows) {
    if (user.referral_slug) {
      await reserveExistingCode(client, user.referral_slug, user.wallet, 'legacy');
      await client.query(
        `INSERT INTO user_referral_aliases (slug, wallet)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO NOTHING`,
        [user.referral_slug, user.wallet],
      );
    }

    const referralCode = await allocateProfileCode(
      client,
      user.username,
      user.wallet,
      generateCandidate,
    );
    await client.query(
      `UPDATE users SET referral_code = $2
       WHERE wallet = $1 AND referral_code IS NULL`,
      [user.wallet, referralCode],
    );
  }

  return pending.rows.length;
}
