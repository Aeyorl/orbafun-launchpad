import { config } from 'dotenv';
config({ path: '../../.env' });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers — helmet sets X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, Content-Security-Policy, etc.
  // We loosen CSP for the API since it serves JSON (not HTML), and allow
  // cross-origin reads from the frontend.
  app.use(helmet({
    contentSecurityPolicy: false, // API serves JSON, not HTML
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Global validation pipe — strips unknown properties and validates DTOs.
  // whitelist:   strips properties not in the DTO (prevents mass assignment).
  // forbidNonWhitelisted: throws if extra properties are present.
  // transform:   converts query/param strings to their declared types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter — ensures clean JSON errors without stack traces.
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = parseInt(process.env.API_PORT || '4000', 10);
  await app.listen(port);
  Logger.log(`Orba API running on port ${port}`, 'Bootstrap');

  // Warn if insecure auth fallback is enabled (testnet only — must be false for mainnet).
  if (process.env.AUTH_ALLOW_INSECURE === 'true') {
    Logger.warn(
      'AUTH_ALLOW_INSECURE=true — x-wallet header fallback is ACTIVE. ' +
        'Authentication can be bypassed by anyone. Set AUTH_ALLOW_INSECURE=false for production.',
      'Security',
    );
  }
}

bootstrap();
