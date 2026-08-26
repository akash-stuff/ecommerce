import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { MediaPurpose } from '../media.service';

export const MEDIA_PURPOSES = ['product', 'theme', 'banner'] as const;

/**
 * Sent as a query parameter rather than a multipart field: the global
 * validation pipe runs over the body, and mixing a validated DTO with a
 * streamed file upload makes the failure modes hard to read.
 */
export class UploadQueryDto {
  @ApiPropertyOptional({ enum: MEDIA_PURPOSES, default: 'product' })
  @IsOptional() @IsIn(MEDIA_PURPOSES as unknown as string[]) purpose?: MediaPurpose;
}
