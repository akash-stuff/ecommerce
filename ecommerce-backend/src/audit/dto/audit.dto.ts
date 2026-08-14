import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'tenant.suspended' })
  @IsOptional() @IsString() @MaxLength(80) action?: string;

  @ApiPropertyOptional({ example: 'Order' })
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) entityId?: string;

  /** Platform-only: narrow the whole-platform trail to one tenant. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() tenantId?: string;
}
