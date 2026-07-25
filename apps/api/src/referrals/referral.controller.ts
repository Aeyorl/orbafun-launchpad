import {
  Controller,
  Get,
  Post,
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
   * Body: { referrerWallet: string }
   * Auth: wallet signature (AuthGuard) — the referred wallet is req.wallet.
   *
   * Records that the authenticated wallet was referred by referrerWallet.
   * First-click-wins: once attributed, cannot be changed.
   */
  @Post('attribute')
  @UseGuards(AuthGuard)
  async attribute(
    @Req() req: Request & { wallet?: string },
    @Body() body: { referrerWallet?: string },
    @Query('referrer') referrerQuery?: string,
  ) {
    const referredWallet = req.wallet!;
    const referrerWallet = body?.referrerWallet || referrerQuery;
    if (!referrerWallet) {
      throw new BadRequestException('referrerWallet is required (body or ?referrer= query)');
    }
    return this.referralService.attributeReferral(referrerWallet, referredWallet);
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
