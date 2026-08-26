import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Every list endpoint takes these. No unbounded queries. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional() @IsString()
  sortBy = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * Turns a client-supplied sort field into one Prisma will accept.
 *
 * `sortBy` is free text on the wire, and passing it straight into
 * `orderBy: { [sortBy]: order }` hands the caller a choice of column — an
 * unknown name makes Prisma throw, so `/shop?sort=nonsense` becomes a 500 that
 * any visitor can trigger. Each list endpoint declares what it can sort by and
 * anything else falls back to the default.
 */
export function safeOrderBy<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
  order: 'asc' | 'desc' = 'desc',
): Record<string, 'asc' | 'desc'> {
  const field = (allowed as readonly string[]).includes(requested ?? '')
    ? (requested as T)
    : fallback;

  return { [field]: order };
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
  };
}

export function paginate<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / query.limit) || 1;
  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
    },
  };
}
