import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';

/**
 * Everything that shapes how requests are routed and validated.
 *
 * Shared by `main.ts` and the e2e suite on purpose. When the test app configured
 * itself separately the two drifted, and a route that worked in production 404'd
 * in tests — which is the wrong way round for a bug to be discovered.
 */
export function configureApp(app: INestApplication): void {
  // Crawlers look for these two files at the domain root and nowhere else, so
  // they are the only routes exempt from the API prefix.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'sitemap.xml', method: RequestMethod.GET },
      { path: 'robots.txt', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // An unexpected key is a caller bug or an attempt to reach a field the
      // DTO deliberately omits. Both deserve a 400, not silent discarding.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
