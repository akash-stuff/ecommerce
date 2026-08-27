import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { NotificationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Filters for the platform-wide message list.
 *
 * Extends the shared pagination DTO so paging behaves identically to every
 * other list on the platform, and adds only what an operator scanning every
 * store actually narrows by.
 */
export class PlatformNotificationQueryDto extends PaginationQueryDto {
  /** One store. Omitted means every store, which is the point of this list. */
  @ApiPropertyOptional({ description: 'Limit to a single store' })
  @IsOptional() @IsUUID() tenantId?: string;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsIn(Object.values(NotificationStatus))
  status?: string;

  /**
   * The event name, e.g. `order.placed`. Free text rather than an enum: the
   * list of events is owned by whatever calls the notification service, and an
   * enum here would have to be edited every time one is added.
   */
  @ApiPropertyOptional({ example: 'order.placed' })
  @IsOptional() @IsString() @MaxLength(60) event?: string;
}
