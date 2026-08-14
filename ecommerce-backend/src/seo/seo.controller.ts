import { Controller, Get, Header, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { SeoService } from './seo.service';
import { Public, SkipResponseWrap } from '../common/decorators';

/**
 * `sitemap.xml` and `robots.txt` are per tenant, because each store is a
 * separate site on its own hostname. They are served from the API rather than
 * the static frontend for exactly that reason: the frontend is one bundle with
 * no idea which store it is, while these files must list that store's products.
 *
 * Excluded from Swagger — they are for crawlers, not API consumers.
 */
@ApiExcludeController()
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Public()
  @SkipResponseWrap()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemap(@Req() req: Request) {
    return this.seo.sitemap(origin(req));
  }

  @Public()
  @SkipResponseWrap()
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  robots(@Req() req: Request) {
    return this.seo.robots(origin(req));
  }
}

/**
 * Built from the hostname the request actually arrived on, so a store reachable
 * at both its platform subdomain and its own domain advertises whichever one the
 * crawler used — rather than a canonical guess that might contradict it.
 *
 * `x-forwarded-proto` is set by Caddy; the fallback matters only in local
 * development, where there is no proxy and no TLS.
 */
function origin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]
    ?? req.protocol
    ?? 'https';
  return `${proto}://${req.headers.host}`;
}
