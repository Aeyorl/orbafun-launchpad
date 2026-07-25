import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { ApiKeyGuard } from './api-key.guard';
import { DeployerService } from './deployer.service';
import { TemplateService } from './template.service';
import { TipService } from './tip.service';
import { MessagesModule } from '../messages/messages.module';
import { TokenMetadataModule } from '../token-metadata/token-metadata.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MessagesModule, TokenMetadataModule, AuthModule],
  controllers: [AgentsController],
  providers: [AgentsService, ApiKeyGuard, DeployerService, TemplateService, TipService],
  exports: [AgentsService, ApiKeyGuard, DeployerService, TemplateService, TipService],
})
export class AgentsModule {}
