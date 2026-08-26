import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { PlatformMediaPurpose, TenantMediaPurpose } from '../media.service';

export const MEDIA_PURPOSES = ['product', 'theme', 'banner', 'category'] as const;

/**
 * Purposes reachable without a tenant. A platform asset belongs to the
 * catalogue every tenant is offered, not to any one store, so it is kept as a
 * separate list rather than as a flag on the tenant one — that way a tenant
 * upload can never land under the platform prefix by passing a query string.
 */
export const PLATFORM_MEDIA_PURPOSES = ['template'] as const;

/**
 * Sent as a query parameter rather than a multipart field: the global
 * validation pipe runs over the body, and mixing a validated DTO with a
 * streamed file upload makes the failure modes hard to read.
 */
export class UploadQueryDto {
  @ApiPropertyOptional({ enum: MEDIA_PURPOSES, default: 'product' })
  @IsOptional() @IsIn(MEDIA_PURPOSES as unknown as string[]) purpose?: TenantMediaPurpose;
}

/**
 * The platform console's equivalent. Separate DTO, not an extended enum on the
 * one above: the tenant route must refuse `template` and the platform route
 * must refuse `product`, and one enum covering both could not express that.
 */
export class PlatformUploadQueryDto {
  @ApiPropertyOptional({ enum: PLATFORM_MEDIA_PURPOSES, default: 'template' })
  @IsOptional() @IsIn(PLATFORM_MEDIA_PURPOSES as unknown as string[])
  purpose?: PlatformMediaPurpose;
}
