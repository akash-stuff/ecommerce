import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Hostnames only — no scheme, port or path. Anything else would be stored and
 * later compared against a `Host` header that never contains those parts.
 */
const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export class AddDomainDto {
  @ApiProperty({ example: 'shop.acme.com' })
  @IsString()
  @MaxLength(253)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/^www\./, '') : value,
  )
  @Matches(HOSTNAME, {
    message: 'Enter a hostname such as shop.example.com, without http:// or a trailing path.',
  })
  hostname!: string;
}

export class DomainInstructionsDto {
  @ApiProperty() hostname!: string;
  @ApiProperty({ description: 'TXT record name proving you control the domain' })
  txtName!: string;
  @ApiProperty() txtValue!: string;
  @ApiProperty({ description: 'Where the hostname itself must point' })
  pointTo!: string;
  @ApiPropertyOptional() recordType!: 'CNAME' | 'A';
}
