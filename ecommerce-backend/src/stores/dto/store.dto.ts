import { ApiProperty } from '@nestjs/swagger';

/**
 * The storefront's bootstrap payload. Everything a tenant's branding needs and
 * nothing else — no internal ids, no tenant id, no unpublished fields.
 */
export class StoreThemeDto {
  @ApiProperty({ nullable: true }) logoUrl!: string | null;
  @ApiProperty({ nullable: true }) faviconUrl!: string | null;
  @ApiProperty() primaryColor!: string;
  @ApiProperty() secondaryColor!: string;
  @ApiProperty() bodyFont!: string;
  @ApiProperty() headingFont!: string;
  @ApiProperty({ type: Object }) socialLinks!: Record<string, string>;
  @ApiProperty({ type: [String] }) homepageLayout!: string[];

  /** Already sanitised; safe to place in a <style> block. */
  @ApiProperty({ nullable: true }) customCss!: string | null;
}

export class StoreTemplateDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class StoreConfigDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) metaTitle!: string | null;
  @ApiProperty({ nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: StoreTemplateDto, nullable: true })
  template!: StoreTemplateDto | null;
  @ApiProperty({ type: StoreThemeDto }) theme!: StoreThemeDto;
}
