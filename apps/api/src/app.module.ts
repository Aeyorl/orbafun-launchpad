import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { TokensModule } from './tokens/tokens.module';
import { UsersModule } from './users/users.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { WebsocketModule } from './websocket/websocket.module';
import { IndexerModule } from './indexer/indexer.module';
import { UploadModule } from './upload/upload.module';
import { MessagesModule } from './messages/messages.module';
import { FavoritesModule } from './favorites/favorites.module';
import { TokenMetadataModule } from './token-metadata/token-metadata.module';
import { AuthModule } from './auth/auth.module';
import { AgentsModule } from './agents/agents.module';
import { ReferralModule } from './referrals/referral.module';
import { RpcController } from './rpc/rpc.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Global rate limiting — protects all public endpoints from abuse.
    // Default: 120 req / 60s per IP (2 req/s average, plenty for UI polling).
    // Stricter limits applied per-controller via @Throttle() where needed.
    // Tunable via env: THROTTLE_TTL_MS, THROTTLE_LIMIT.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    DatabaseModule,
    RedisModule,
    TokensModule,
    UsersModule,
    LeaderboardModule,
    WebsocketModule,
    IndexerModule,
    UploadModule,
    MessagesModule,
    FavoritesModule,
    TokenMetadataModule,
    AuthModule,
    AgentsModule,
    ReferralModule,
  ],
  controllers: [RpcController],
  providers: [
    // Apply ThrottlerGuard globally — every HTTP route is rate-limited.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
