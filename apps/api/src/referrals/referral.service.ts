import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { isValidEvmAddress } from '../common/utils';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

/**
 * ReferralService — tracks wallet-to-wallet referral attribution.
 *
 * Flow:
 *   1. User shares a referral link: https://orba.fun/?ref=<permanentCode>
 *   2. Visitor's browser stores the code in localStorage.
 *   3. When the visitor first authenticates (connects wallet + signs in),
 *      the frontend calls POST /referrals/attribute with the code.
 *   4. The API records the attribution (one row per referred wallet — unique).
 *   5. The indexer updates trade_count, total_volume_usdc, and reward_earned_usdc
 *      on each trade by the referred wallet (see arc-event-poller.service.ts).
 *
 * Reward calculation (off-chain, for display/leaderboard only — actual USDC
 * payout is a v2 feature):
 *   reward = trade_volume * REFERRAL_REWARD_PCT (default 10% of the 1% trading
 *   fee = 0.1% of volume). This is configurable via REFERRAL_REWARD_PCT env.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  // 0.1% of volume (10% of the 1% trading fee). Configurable via env.
  private readonly rewardPctBps = Number(process.env.REFERRAL_REWARD_PCT_BPS ?? 10); // basis points

  constructor(private db: DatabaseService) {}

  private normalizePartnerCode(value: string) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Referral code is required');
    }
    const code = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(code)) {
      throw new BadRequestException(
        'Referral code must be 3-32 lowercase letters, numbers, or hyphens',
      );
    }
    return code;
  }

  private validateRewardBps(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new BadRequestException('rewardBps must be an integer from 0 to 100');
    }
    return value;
  }

  private async resolveReferrer(referrer: string) {
    if (isValidEvmAddress(referrer)) {
      return {
        wallet: referrer.toLowerCase(),
        referralCode: null,
        rewardBps: this.validateRewardBps(this.rewardPctBps),
      };
    }

    const code = this.normalizePartnerCode(referrer);
    const reserved = await this.db.queryOne<{
      wallet: string;
      kind: 'profile' | 'legacy' | 'partner';
      reward_bps: number | null;
      active: boolean | null;
    }>(
      `SELECT registry.wallet, registry.kind,
              partner.reward_bps, partner.active
       FROM referral_code_registry registry
       LEFT JOIN referral_partners partner
         ON partner.code = registry.code AND registry.kind = 'partner'
       WHERE registry.code = $1`,
      [code],
    );
    if (!reserved || (reserved.kind === 'partner' && !reserved.active)) {
      throw new NotFoundException('Referral code not found or inactive');
    }
    return {
      wallet: reserved.wallet,
      referralCode: code,
      rewardBps:
        reserved.kind === 'partner'
          ? this.validateRewardBps(reserved.reward_bps ?? this.rewardPctBps)
          : this.validateRewardBps(this.rewardPctBps),
    };
  }

  /**
   * Attribute a referred wallet to a referrer.
   * Called once when a referred user first authenticates.
   * Idempotent: if the referred wallet is already attributed (to anyone),
   * returns ConflictException — attribution is permanent and first-click-wins.
   */
  async attributeReferral(referrerValue: string, referredWallet: string) {
    if (!isValidEvmAddress(referredWallet)) {
      throw new BadRequestException('Invalid referred wallet address');
    }
    const resolved = await this.resolveReferrer(referrerValue);
    const referrer = resolved.wallet;
    const referred = referredWallet.toLowerCase();

    if (referrer === referred) {
      throw new BadRequestException('Cannot refer yourself');
    }

    // Ensure both wallets exist in the users table (the auth flow creates them,
    // but be defensive — upsert with zero stats).
    await this.db.query(
      `INSERT INTO users (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`,
      [referrer],
    );
    await this.db.query(
      `INSERT INTO users (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`,
      [referred],
    );

    const inserted = await this.db.queryOne<{
      referrer_wallet: string;
      referral_code: string | null;
    }>(
      `INSERT INTO referrals
         (referrer_wallet, referred_wallet, referral_code, reward_bps)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (referred_wallet) DO NOTHING
       RETURNING referrer_wallet, referral_code`,
      [referrer, referred, resolved.referralCode, resolved.rewardBps],
    );

    if (!inserted) {
      const existing = await this.db.queryOne<{
        referrer_wallet: string;
        referral_code: string | null;
      }>(
        `SELECT referrer_wallet, referral_code
         FROM referrals WHERE referred_wallet = $1`,
        [referred],
      );
      if (existing?.referrer_wallet === referrer) {
        return {
          attributed: true,
          referrer_wallet: referrer,
          referral_code: existing.referral_code,
          already: true,
        };
      }
      throw new ConflictException('Wallet already attributed to another referrer');
    }

    this.logger.log(`Attributed ${referred} to referrer ${referrer}`);
    return {
      attributed: true,
      referrer_wallet: referrer,
      referral_code: inserted.referral_code,
      already: false,
    };
  }

  async createPartner(input: {
    code: string;
    displayName: string;
    wallet: string;
    rewardBps?: number;
    createdByWallet?: string;
  }) {
    const code = this.normalizePartnerCode(input.code);
    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length > 80) {
      throw new BadRequestException('displayName is required and must be at most 80 characters');
    }
    if (!isValidEvmAddress(input.wallet)) {
      throw new BadRequestException('Invalid partner wallet address');
    }
    const wallet = input.wallet.toLowerCase();
    const rewardBps = this.validateRewardBps(input.rewardBps ?? this.rewardPctBps);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`,
        [wallet],
      );
      const reservation = await client.query(
        `INSERT INTO referral_code_registry (code, wallet, kind)
         VALUES ($1, $2, 'partner')
         ON CONFLICT (code) DO NOTHING
         RETURNING code`,
        [code, wallet],
      );
      if (!reservation.rows[0]) {
        throw new ConflictException('Referral code is already in use');
      }
      const created = await client.query(
        `INSERT INTO referral_partners
           (code, display_name, wallet, reward_bps, created_by_wallet)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING code, display_name, wallet, reward_bps, active, created_at, updated_at`,
        [code, displayName, wallet, rewardBps, input.createdByWallet || null],
      );
      await client.query('COMMIT');
      return created.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') {
        throw new ConflictException('Referral partner code already exists');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async updatePartner(
    codeValue: string,
    input: { displayName?: string; rewardBps?: number; active?: boolean },
  ) {
    const code = this.normalizePartnerCode(codeValue);
    if (input.displayName !== undefined) {
      if (typeof input.displayName !== 'string') {
        throw new BadRequestException('displayName must be a string');
      }
      const name = input.displayName.trim();
      if (!name || name.length > 80) {
        throw new BadRequestException('displayName must be 1-80 characters');
      }
    }
    const rewardBps = input.rewardBps === undefined
      ? null
      : this.validateRewardBps(input.rewardBps);
    if (input.active !== undefined && typeof input.active !== 'boolean') {
      throw new BadRequestException('active must be a boolean');
    }
    const updated = await this.db.queryOne(
      `UPDATE referral_partners
       SET display_name = COALESCE($2, display_name),
           reward_bps = COALESCE($3, reward_bps),
           active = COALESCE($4, active),
           updated_at = NOW()
       WHERE code = $1
       RETURNING code, display_name, wallet, reward_bps, active, created_at, updated_at`,
      [code, input.displayName?.trim() || null, rewardBps, input.active ?? null],
    );
    if (!updated) throw new NotFoundException('Referral partner not found');
    return updated;
  }

  async getPartner(codeValue: string) {
    const code = this.normalizePartnerCode(codeValue);
    const partner = await this.db.queryOne(
      `SELECT code, display_name, wallet, reward_bps, active, created_at, updated_at
       FROM referral_partners WHERE code = $1`,
      [code],
    );
    if (!partner) throw new NotFoundException('Referral partner not found');
    return partner;
  }

  /**
   * Get referral stats for a wallet (as referrer).
   */
  async getReferralStats(wallet: string) {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const w = wallet.toLowerCase();

    const stats = await this.db.queryOne<{
      total_referred: string;
      active_referred: string;
      total_volume_usdc: string;
      reward_earned_usdc: string;
    }>(
      `WITH activity AS (
         SELECT tr.wallet, tr.usdc_amount::numeric AS volume_usdc
         FROM trades tr JOIN tokens t ON t.id = tr.token_id
         WHERE ${publicFactoryClause('t', 2)}
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END::numeric
         FROM amm_swaps s JOIN tokens t ON t.id = s.token_id
         WHERE ${publicFactoryClause('t', 2)}
       ), referred AS (
         SELECT r.referred_wallet,
                COUNT(a.wallet) AS trade_count,
                COALESCE(SUM(a.volume_usdc), 0) AS volume_usdc,
                COALESCE(SUM(a.volume_usdc * r.reward_bps / 10000), 0) AS reward_usdc
         FROM referrals r LEFT JOIN activity a ON a.wallet = r.referred_wallet
         WHERE r.referrer_wallet = $1
         GROUP BY r.referred_wallet
       )
       SELECT
         COUNT(*)::text AS total_referred,
         COUNT(*) FILTER (WHERE trade_count > 0)::text AS active_referred,
         COALESCE(SUM(volume_usdc), 0)::text AS total_volume_usdc,
         COALESCE(SUM(reward_usdc), 0)::text AS reward_earned_usdc
       FROM referred`,
      [w, getPublicFactoryAddresses()],
    );

    const partnerCodes = await this.db.queryRows<{
      code: string;
      display_name: string;
      reward_bps: number;
    }>(
      `SELECT code, display_name, reward_bps
       FROM referral_partners
       WHERE wallet = $1 AND active = TRUE
       ORDER BY created_at`,
      [w],
    );
    const user = await this.db.queryOne<{ referral_code: string | null }>(
      `SELECT referral_code FROM users WHERE wallet = $1`,
      [w],
    );

    if (!stats) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      wallet: w,
      total_referred: Number(stats.total_referred),
      active_referred: Number(stats.active_referred),
      total_volume_usdc: stats.total_volume_usdc,
      reward_earned_usdc: stats.reward_earned_usdc,
      referral_code: user?.referral_code ?? null,
      referral_slug: user?.referral_code ?? null,
      partner_codes: partnerCodes,
    };
  }

  /**
   * List wallets referred by this wallet, with their stats.
   */
  async getReferredWallets(wallet: string, limit = 20, offset = 0) {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const w = wallet.toLowerCase();

    const rows = await this.db.queryRows<{
      referred_wallet: string;
      trade_count: number;
      total_volume_usdc: string;
      reward_earned_usdc: string;
      attributed_at: string;
      first_token_address: string | null;
    }>(
      `WITH activity AS (
         SELECT tr.wallet, tr.usdc_amount::numeric AS volume_usdc,
                t.contract_address AS token_address, tr.timestamp
         FROM trades tr JOIN tokens t ON t.id = tr.token_id
         WHERE ${publicFactoryClause('t', 2)}
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END::numeric,
                t.contract_address, s.timestamp
         FROM amm_swaps s JOIN tokens t ON t.id = s.token_id
         WHERE ${publicFactoryClause('t', 2)}
       )
       SELECT r.referred_wallet,
              COUNT(a.wallet)::int AS trade_count,
              COALESCE(SUM(a.volume_usdc), 0)::text AS total_volume_usdc,
              COALESCE(SUM(a.volume_usdc * r.reward_bps / 10000), 0)::text AS reward_earned_usdc,
              r.attributed_at,
              (array_agg(a.token_address ORDER BY a.timestamp ASC)
                FILTER (WHERE a.token_address IS NOT NULL))[1] AS first_token_address
       FROM referrals r LEFT JOIN activity a ON a.wallet = r.referred_wallet
       WHERE r.referrer_wallet = $1
       GROUP BY r.referred_wallet, r.attributed_at
       ORDER BY r.attributed_at DESC
       LIMIT $3 OFFSET $4`,
      [w, getPublicFactoryAddresses(), limit, offset],
    );

    const count = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM referrals WHERE referrer_wallet = $1`,
      [w],
    );

    return {
      referrals: rows.map((r) => ({
        ...r,
        total_volume_usdc: r.total_volume_usdc,
        reward_earned_usdc: r.reward_earned_usdc,
      })),
      total: count ? Number(count.count) : 0,
    };
  }

  /**
   * Get the referrer for a given wallet (if any).
   * Used by the frontend to show "Referred by 0x..." on a profile.
   */
  async getReferrer(wallet: string) {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const w = wallet.toLowerCase();

    const row = await this.db.queryOne<{ referrer_wallet: string; attributed_at: string }>(
      `SELECT referrer_wallet, attributed_at FROM referrals WHERE referred_wallet = $1`,
      [w],
    );

    if (!row) return { referrer_wallet: null, attributed_at: null };
    return row;
  }

  /**
   * Update referral stats when a referred wallet trades.
   * Called by the indexer (arc-event-poller) on each buy/sell by a referred wallet.
   * Computes the reward as rewardPctBps bps of the trade volume.
   */
  async recordTrade(referredWallet: string, volumeUsdc: bigint, tokenAddress?: string) {
    const w = referredWallet.toLowerCase();

    if (tokenAddress) {
      const visible = await this.db.queryOne<{ visible: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM tokens t
           WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
         ) AS visible`,
        [tokenAddress.toLowerCase(), getPublicFactoryAddresses()],
      );
      if (!visible?.visible) return { updated: 0, reward: 0n };
    }

    // Only update if this wallet is referred (no-op otherwise).
    const result = await this.db.query(
      `UPDATE referrals
       SET trade_count = trade_count + 1,
           total_volume_usdc = total_volume_usdc + $2,
           reward_earned_usdc = reward_earned_usdc + ($2 * reward_bps / 10000),
           first_token_address = COALESCE(first_token_address, $3)
       WHERE referred_wallet = $1
       RETURNING reward_bps`,
      [w, volumeUsdc.toString(), tokenAddress || null],
    );

    const appliedBps = Number((result as any)?.rows?.[0]?.reward_bps ?? 0);
    const reward = (volumeUsdc * BigInt(appliedBps)) / 10_000n;
    return { updated: (result as any)?.rowCount ?? 0, reward };
  }

  /**
   * Top referrers leaderboard (by total volume attributed).
   */
  async getTopReferrers(limit = 20) {
    const rows = await this.db.queryRows<{
      referrer_wallet: string;
      total_referred: string;
      total_volume_usdc: string;
      reward_earned_usdc: string;
    }>(
      `WITH activity AS (
         SELECT tr.wallet, tr.usdc_amount::numeric AS volume_usdc
         FROM trades tr JOIN tokens t ON t.id = tr.token_id
         WHERE ${publicFactoryClause('t', 1)}
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END::numeric
         FROM amm_swaps s JOIN tokens t ON t.id = s.token_id
         WHERE ${publicFactoryClause('t', 1)}
       )
       SELECT r.referrer_wallet,
              COUNT(DISTINCT r.referred_wallet)::text AS total_referred,
              COALESCE(SUM(a.volume_usdc), 0)::text AS total_volume_usdc,
              COALESCE(SUM(a.volume_usdc * r.reward_bps / 10000), 0)::text AS reward_earned_usdc
       FROM referrals r JOIN activity a ON a.wallet = r.referred_wallet
       GROUP BY r.referrer_wallet
       ORDER BY SUM(a.volume_usdc) DESC
       LIMIT $2`,
      [getPublicFactoryAddresses(), limit],
    );

    return rows.map((r) => ({
      referrer_wallet: r.referrer_wallet,
      total_referred: Number(r.total_referred),
      total_volume_usdc: r.total_volume_usdc,
      reward_earned_usdc: r.reward_earned_usdc,
    }));
  }
}
