import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ReferralService } from './referral.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';

/**
 * ReferralController — referral attribution + stats endpoints.
 *
 * Attribution is wallet-authenticated (the referred wallet must sign in to
 * prove they own the wallet being attributed). Stats are public.
 */
@Controller('referrals')
export class ReferralController {
  constructor(private referralService: ReferralService) {}

  /**
   * POST /referrals/attribute
   * Body: { referrer: string } (wallet address or partner code)
   * Auth: wallet signature (AuthGuard) — the referred wallet is req.wallet.
   *
   * Records that the authenticated wallet was referred by referrerWallet.
   * First-click-wins: once attributed, cannot be changed.
   */
  @Post('attribute')
  @UseGuards(AuthGuard)
  async attribute(
    @Req() req: Request & { wallet?: string },
    @Body() body: { referrer?: string; referrerWallet?: string; referrerCode?: string },
    @Query('referrer') referrerQuery?: string,
  ) {
    const referredWallet = req.wallet!;
    const referrer = body?.referrer || body?.referrerWallet || body?.referrerCode || referrerQuery;
    if (!referrer) {
      throw new BadRequestException('referrer is required (body or ?referrer= query)');
    }
    return this.referralService.attributeReferral(referrer, referredWallet);
  }

  /** Create a human-readable affiliate code. Admin-only. */
  @Post('partners')
  @UseGuards(AdminGuard)
  async createPartner(
    @Req() req: Request & { wallet?: string },
    @Body() body: { code?: string; displayName?: string; wallet?: string; rewardBps?: number },
  ) {
    if (!body.code || !body.displayName || !body.wallet) {
      throw new BadRequestException('code, displayName, and wallet are required');
    }
    return this.referralService.createPartner({
      code: body.code,
      displayName: body.displayName,
      wallet: body.wallet,
      rewardBps: body.rewardBps,
      createdByWallet: req.wallet,
    });
  }

  /** Change affiliate display name, rate, or active status. Admin-only. */
  @Patch('partners/:code')
  @UseGuards(AdminGuard)
  async updatePartner(
    @Param('code') code: string,
    @Body() body: { displayName?: string; rewardBps?: number; active?: boolean },
  ) {
    return this.referralService.updatePartner(code, body);
  }

  /** Public partner-code lookup, useful for validating a shared link. */
  @Get('partners/:code')
  async getPartner(@Param('code') code: string) {
    return this.referralService.getPartner(code);
  }

  /**
   * GET /referrals/leaderboard/top — top referrers by attributed volume.
   * (Defined before /:wallet to avoid route shadowing.)
   */
  @Get('leaderboard/top')
  async getTopReferrers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    return this.referralService.getTopReferrers(limitNum);
  }

  /**
   * GET /referrals/:wallet — referral stats for a wallet (as referrer).
   */
  @Get(':wallet')
  async getStats(@Param('wallet') wallet: string) {
    return this.referralService.getReferralStats(wallet);
  }

  /**
   * GET /referrals/:wallet/referred — list wallets referred by this wallet.
   */
  @Get(':wallet/referred')
  async getReferred(
    @Param('wallet') wallet: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.referralService.getReferredWallets(wallet, limitNum, offsetNum);
  }

  /**
   * GET /referrals/:wallet/referrer — who referred this wallet (if anyone).
   */
  @Get(':wallet/referrer')
  async getReferrer(@Param('wallet') wallet: string) {
    return this.referralService.getReferrer(wallet);
  }
}
