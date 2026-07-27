import { Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { CandlesService } from './candles.service';

@Module({
  controllers: [TokensController],
  providers: [TokensService, CandlesService],
  exports: [TokensService, CandlesService],
})
export class TokensModule {}
