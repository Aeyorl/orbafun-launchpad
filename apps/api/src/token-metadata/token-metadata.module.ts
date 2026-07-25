import { Module } from '@nestjs/common';
import { TokenMetadataController } from './token-metadata.controller';
import { TokenMetadataService } from './token-metadata.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TokenMetadataController],
  providers: [TokenMetadataService],
  exports: [TokenMetadataService],
})
export class TokenMetadataModule {}
