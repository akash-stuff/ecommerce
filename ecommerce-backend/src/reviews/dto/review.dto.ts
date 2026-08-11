import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateReviewDto {
  @IsUUID() productId!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;

  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus;
}

export class ModerateReviewDto {
  @IsEnum(ReviewStatus) status!: ReviewStatus;
}
