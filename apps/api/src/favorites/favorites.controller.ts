import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Query,
  BadRequestException,
  NotFoundException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FavoritesService } from './favorites.service';
import { AuthGuard } from '../auth/auth.guard';
import { isValidEvmAddress } from '../common/utils';
import { Request } from 'express';

/**
 * FavoritesController — per-wallet watchlist.
 *
 * Routes:
 *   GET    /favorites                  — list current wallet's favorites
 *   POST   /favorites/:tokenAddress    — add a token to favorites
 *   DELETE /favorites/:tokenAddress    — remove a token from favorites
 *   GET    /favorites/:tokenAddress    — check if a token is favorited
 *
 * The wallet is read from the `x-wallet` header. In production this should
 * be verified with a signature; for testnet we trust the client.
 */
@Controller('favorites')
export class FavoritesController {
  private readonly logger = new Logger(FavoritesController.name);

  constructor(private favoritesService: FavoritesService) {}

  @Get()
  @UseGuards(AuthGuard)
  async listFavorites(
    @Req() req: Request & { wallet?: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const wallet = req.wallet!;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.favoritesService.listFavorites(wallet, {
      limit: limitNum,
      offset: offsetNum,
    });
  }

  @Post(':tokenAddress')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @UseGuards(AuthGuard)
  async addFavorite(
    @Param('tokenAddress') tokenAddress: string,
    @Req() req: Request & { wallet?: string },
  ) {
    const wallet = req.wallet!;
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    try {
      return await this.favoritesService.addFavorite(wallet, tokenAddress);
    } catch (err) {
      throw new NotFoundException(err.message);
    }
  }

  @Delete(':tokenAddress')
  @UseGuards(AuthGuard)
  async removeFavorite(
    @Param('tokenAddress') tokenAddress: string,
    @Req() req: Request & { wallet?: string },
  ) {
    const wallet = req.wallet!;
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    const removed = await this.favoritesService.removeFavorite(wallet, tokenAddress);
    return { removed };
  }

  @Get(':tokenAddress')
  @UseGuards(AuthGuard)
  async checkFavorite(
    @Param('tokenAddress') tokenAddress: string,
    @Req() req: Request & { wallet?: string },
  ) {
    const wallet = req.wallet!;
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    const favorited = await this.favoritesService.isFavorite(wallet, tokenAddress);
    return { favorited };
  }
}
