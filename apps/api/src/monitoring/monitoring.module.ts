import { Global, Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { MonitoringService } from './monitoring.service';

@Global()
@Module({
  providers: [AlertService, MonitoringService],
  exports: [AlertService, MonitoringService],
})
export class MonitoringModule {}
