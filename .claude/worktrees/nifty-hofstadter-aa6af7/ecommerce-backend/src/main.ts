import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Payment webhooks are signed over the exact bytes received, so the raw
    // body has to survive JSON parsing.
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Required for correct req.hostname / req.ip behind a load balancer, which
  // tenant resolution depends on.
  app.set('trust proxy', 1);

  // Routing and validation live in bootstrap.ts so the e2e suite runs against
  // exactly the same configuration rather than its own copy.
  configureApp(app);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  const allowed = config.get<string[]>('cors.origins', []);
  const platformDomain = config.get<string>('platform.domain', 'platform.com');
  const allowSubdomains = config.get<boolean>('cors.allowTenantSubdomains', true);

  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl, server-to-server
      if (allowed.includes(origin)) return callback(null, true);
      if (allowSubdomains) {
        try {
          const host = new URL(origin).hostname;
          // Any verified tenant hostname is accepted; unverified custom domains
          // never resolve to a tenant, so they get no data regardless.
          if (host === platformDomain || host.endsWith(`.${platformDomain}`)) {
            return callback(null, true);
          }
        } catch { /* malformed origin */ }
      }
      return callback(new Error('Origin not allowed'), false);
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Strips and rejects unknown keys — this is what stops a client from
      // smuggling `tenantId` into a create payload.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.get('env') !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('White-Label Commerce API')
      .setDescription('Multi-tenant storefront and administration API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = config.get<number>('port', 4000);
  await app.listen(port);
  logger.log(`API listening on :${port}`);
}

void bootstrap();
