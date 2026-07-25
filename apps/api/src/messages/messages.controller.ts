import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Query,
  NotFoundException,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MessagesService } from './messages.service';
import { AuthGuard } from '../auth/auth.guard';
import { isValidEvmAddress } from '../common/utils';
import { Request } from 'express';

/**
 * MessagesController — per-token live chat.
 *
 * Routes:
 *   GET  /tokens/:address/messages       — recent messages (newest first)
 *   POST /tokens/:address/messages       — post a new message
 *
 * The POST endpoint reads the poster's wallet from the `x-wallet` header.
 * In production this should be verified with a wallet signature; for testnet
 * we trust the client. Rate-limited to 30 messages/min per IP to prevent spam.
 *
 * New messages are published to Redis (`token:events` channel) and relayed
 * to WebSocket clients in the `token:{address}` room.
 */
@Controller('tokens/:address/messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(private messagesService: MessagesService) {}

  @Get()
  async listMessages(
    @Param('address') address: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    const tokenId = await this.messagesService.resolveTokenId(address);
    if (!tokenId) throw new NotFoundException('Token not found');

    const limitNum = limit ? parseInt(limit, 10) : 50;
    const beforeNum = before ? parseInt(before, 10) : undefined;
    if (isNaN(limitNum) || limitNum < 1) {
      throw new BadRequestException('Invalid limit');
    }

    return this.messagesService.getMessages(tokenId, {
      limit: limitNum,
      before: beforeNum,
    });
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 30 } }) // 30 msgs/min per IP
  @UseGuards(AuthGuard)
  async postMessage(
    @Param('address') address: string,
    @Body() body: { content?: string; txHash?: string },
    @Req() req: Request & { wallet?: string },
  ) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    const wallet = req.wallet!;
    if (!body.content || !body.content.trim()) {
      throw new BadRequestException('Message content is required');
    }

    const tokenId = await this.messagesService.resolveTokenId(address);
    if (!tokenId) throw new NotFoundException('Token not found');

    try {
      return await this.messagesService.postMessage(
        tokenId,
        wallet,
        body.content,
        body.txHash,
      );
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }
}
