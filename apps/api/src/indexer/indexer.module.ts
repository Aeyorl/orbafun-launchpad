import { Module } from '@nestjs/common';
import { IndexerController } from './indexer.controller';
import { IndexerService } from './indexer.service';
import { EnvioPollerService } from './envio-poller.service';
import { ArcEventPollerService } from './arc-event-poller.service';

@Module({
  controllers: [IndexerController],
  providers: [IndexerService, EnvioPollerService, ArcEventPollerService],
  exports: [IndexerService, EnvioPollerService, ArcEventPollerService],
})
export class IndexerModule {}
