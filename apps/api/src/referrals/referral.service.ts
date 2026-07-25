import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { isValidEvmAddress } from '../common/utils';

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
      `SELECT
         COUNT(*)::text as total_referred,
         COUNT(*) FILTER (WHERE trade_count > 0)::text as active_referred,
         COALESCE(SUM(total_volume_usdc), 0)::text as total_volume_usdc,
         COALESCE(SUM(reward_earned_usdc), 0)::text as reward_earned_usdc
       FROM referrals
       WHERE referrer_wallet = $1`,
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
      `SELECT
         referred_wallet,
         trade_count,
         total_volume_usdc::text,
         reward_earned_usdc::text,
         attributed_at,
         first_token_address
       FROM referrals
       WHERE referrer_wallet = $1
       ORDER BY attributed_at DESC
       LIMIT $2 OFFSET $3`,
      [w, limit, offset],
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
      `SELECT
         referrer_wallet,
         COUNT(*)::text as total_referred,
         SUM(total_volume_usdc)::text as total_volume_usdc,
         SUM(reward_earned_usdc)::text as reward_earned_usdc
       FROM referrals
       GROUP BY referrer_wallet
       ORDER BY SUM(total_volume_usdc) DESC
       LIMIT $1`,
      [limit],
    );

    return rows.map((r) => ({
      referrer_wallet: r.referrer_wallet,
      total_referred: Number(r.total_referred),
      total_volume_usdc: r.total_volume_usdc,
      reward_earned_usdc: r.reward_earned_usdc,
    }));
  }
}
