import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TokensModule } from '../tokens/tokens.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TokensModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
