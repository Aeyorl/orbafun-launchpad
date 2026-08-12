import { Controller, Get, Post, Param, Body, Req, NotFoundException, BadRequestException, UseGuards } from '@nestjs/common';
import { TokenMetadataService, TokenMetadataInput } from './token-metadata.service';
import { AuthGuard } from '../auth/auth.guard';
import { isValidEvmAddress } from '../common/utils';
import { Request } from 'express';

@Controller('tokens/:address/metadata')
export class TokenMetadataController {
  constructor(private metadataService: TokenMetadataService) {}

  /** GET /tokens/:address/metadata — public read. */
  @Get()
  async getMetadata(@Param('address') address: string) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    if (!(await this.metadataService.isVisibleToken(address))) {
      throw new NotFoundException('Token not found');
    }
    const meta = await this.metadataService.getMetadata(address);
    if (!meta) {
      return {
        token_address: address.toLowerCase(),
        website: null,
        twitter: null,
        telegram: null,
        discord: null,
        description: null,
        banner: null,
      };
    }
    return meta;
  }

  /** POST /tokens/:address/metadata — creator-only update (auth required). */
  @Post()
  @UseGuards(AuthGuard)
  async setMetadata(
    @Param('address') address: string,
    @Body() body: TokenMetadataInput,
    @Req() req: Request & { wallet?: string },
  ) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    const wallet = req.wallet!;
    try {
      return await this.metadataService.setMetadata(address, wallet, body);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }
}
