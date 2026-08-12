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
 *   1. User shares a referral link: https://orba.fun/?ref=<referrerWallet>
 *   2. Visitor's browser stores the referrer wallet in localStorage.
 *   3. When the visitor first authenticates (connects wallet + signs in),
 *      the frontend calls POST /referrals/attribute with the referrer wallet.
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

  /**
   * Attribute a referred wallet to a referrer.
   * Called once when a referred user first authenticates.
   * Idempotent: if the referred wallet is already attributed (to anyone),
   * returns ConflictException — attribution is permanent and first-click-wins.
   */
  async attributeReferral(referrerWallet: string, referredWallet: string) {
    if (!isValidEvmAddress(referrerWallet) || !isValidEvmAddress(referredWallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const referrer = referrerWallet.toLowerCase();
    const referred = referredWallet.toLowerCase();

    if (referrer === referred) {
      throw new BadRequestException('Cannot refer yourself');
    }

    // Check if already attributed (to anyone — first-click-wins).
    const existing = await this.db.queryOne<{ referrer_wallet: string }>(
      `SELECT referrer_wallet FROM referrals WHERE referred_wallet = $1`,
      [referred],
    );
    if (existing) {
      if (existing.referrer_wallet === referrer) {
        // Already attributed to the same referrer — idempotent success.
        return { attributed: true, referrer_wallet: referrer, already: true };
      }
      throw new ConflictException('Wallet already attributed to another referrer');
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

    await this.db.query(
      `INSERT INTO referrals (referrer_wallet, referred_wallet)
       VALUES ($1, $2)
       ON CONFLICT (referred_wallet) DO NOTHING`,
      [referrer, referred],
    );

    this.logger.log(`Attributed ${referred} to referrer ${referrer}`);
    return { attributed: true, referrer_wallet: referrer, already: false };
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
                COALESCE(SUM(a.volume_usdc), 0) AS volume_usdc
         FROM referrals r LEFT JOIN activity a ON a.wallet = r.referred_wallet
         WHERE r.referrer_wallet = $1
         GROUP BY r.referred_wallet
       )
       SELECT
         COUNT(*)::text AS total_referred,
         COUNT(*) FILTER (WHERE trade_count > 0)::text AS active_referred,
         COALESCE(SUM(volume_usdc), 0)::text AS total_volume_usdc,
         COALESCE(SUM(volume_usdc) * $3::numeric / 10000, 0)::text AS reward_earned_usdc
       FROM referred`,
      [w, getPublicFactoryAddresses(), this.rewardPctBps],
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
              (COALESCE(SUM(a.volume_usdc), 0) * $3::numeric / 10000)::text AS reward_earned_usdc,
              r.attributed_at,
              (array_agg(a.token_address ORDER BY a.timestamp ASC)
                FILTER (WHERE a.token_address IS NOT NULL))[1] AS first_token_address
       FROM referrals r LEFT JOIN activity a ON a.wallet = r.referred_wallet
       WHERE r.referrer_wallet = $1
       GROUP BY r.referred_wallet, r.attributed_at
       ORDER BY r.attributed_at DESC
       LIMIT $4 OFFSET $5`,
      [w, getPublicFactoryAddresses(), this.rewardPctBps, limit, offset],
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
    const reward = (volumeUsdc * BigInt(this.rewardPctBps)) / 10_000n;

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
           reward_earned_usdc = reward_earned_usdc + $3,
           first_token_address = COALESCE(first_token_address, $4)
       WHERE referred_wallet = $1`,
      [w, volumeUsdc.toString(), reward.toString(), tokenAddress || null],
    );

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
              (COALESCE(SUM(a.volume_usdc), 0) * $2::numeric / 10000)::text AS reward_earned_usdc
       FROM referrals r JOIN activity a ON a.wallet = r.referred_wallet
       GROUP BY r.referrer_wallet
       ORDER BY SUM(a.volume_usdc) DESC
       LIMIT $3`,
      [getPublicFactoryAddresses(), this.rewardPctBps, limit],
    );

    return rows.map((r) => ({
      referrer_wallet: r.referrer_wallet,
      total_referred: Number(r.total_referred),
      total_volume_usdc: r.total_volume_usdc,
      reward_earned_usdc: r.reward_earned_usdc,
    }));
  }
}
