import { Controller, Post, Body, Headers, Logger, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { IndexerService } from './indexer.service';

/**
 * Constant-time string comparison to prevent timing attacks on secrets.
 * Returns true if a and b are equal (same length + same bytes).
 */
function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * IndexerController — receives webhook callbacks from the Envio HyperIndex
 * indexer for each decoded event.
 *
 * Security: The endpoint is authenticated via a shared secret passed in the
 * `X-Indexer-Secret` header. This prevents unauthorized event injection.
 * The secret is set via the INDEXER_WEBHOOK_SECRET environment variable.
 *
 * Envio configuration: Set the webhook URL to
 *   http://your-api:4000/indexer/event
 * and include the shared secret in the request headers.
 *
 * Rate limiting: Skipped — this is an internal endpoint authenticated via
 * shared secret, not a public-facing route.
 */
@SkipThrottle()
@Controller('indexer')
export class IndexerController {
  private readonly logger = new Logger(IndexerController.name);

  constructor(private indexerService: IndexerService) {}

  /**
   * POST /indexer/event
   * Receives a single decoded event from the Envio indexer.
   * Body: the decoded event payload (see IndexerService for event types).
   *
   * Security: Requires INDEXER_WEBHOOK_SECRET to be set and the request to
   * include it in the x-indexer-secret header. If the secret is not configured,
   * the endpoint is disabled entirely (returns 503) — the direct Arc RPC
   * poller has replaced webhooks, so this endpoint should not accept events
   * from unauthenticated sources.
   */
  @Post('event')
  async handleEvent(
    @Body() event: any,
    @Headers('x-indexer-secret') secret?: string,
  ) {
    const expectedSecret = process.env.INDEXER_WEBHOOK_SECRET;
    if (!expectedSecret) {
      throw new HttpException(
        'Indexer webhook disabled — set INDEXER_WEBHOOK_SECRET to enable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!secret || !safeSecretEqual(secret, expectedSecret)) {
      throw new UnauthorizedException('Invalid indexer secret');
    }

    this.logger.log(`Received event: ${event.type} (block ${event.blockNumber})`);
    await this.indexerService.processEvent(event);
    return { ok: true };
  }

  /**
   * POST /indexer/batch
   * Receives a batch of decoded events (for higher throughput).
   * Body: { events: [...] }
   */
  @Post('batch')
  async handleBatch(
    @Body() body: { events: any[] },
    @Headers('x-indexer-secret') secret?: string,
  ) {
    const expectedSecret = process.env.INDEXER_WEBHOOK_SECRET;
    if (!expectedSecret) {
      throw new HttpException(
        'Indexer webhook disabled — set INDEXER_WEBHOOK_SECRET to enable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!secret || !safeSecretEqual(secret, expectedSecret)) {
      throw new UnauthorizedException('Invalid indexer secret');
    }

    this.logger.log(`Received batch of ${body.events.length} events`);
    for (const event of body.events) {
      await this.indexerService.processEvent(event);
    }
    return { ok: true, processed: body.events.length };
  }
}
