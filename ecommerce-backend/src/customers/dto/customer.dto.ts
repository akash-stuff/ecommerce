import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { BooleanQuery } from '../../common/decorators/boolean-query';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only customers who have ordered' })
  @BooleanQuery()
  hasOrdered?: boolean;
}

/**
 * Deliberately narrow. An admin may correct a phone number or deactivate an
 * account; changing someone's email would silently move their order history to
 * an address they never confirmed, so that stays with the customer.
 */
export class UpdateCustomerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
