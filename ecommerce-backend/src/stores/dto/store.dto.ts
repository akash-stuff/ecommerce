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
  @ApiProperty({ description: "Header logo height: 'sm' | 'md' | 'lg'" })
  logoSize!: string;
  @ApiProperty({ description: 'Named background preset' }) background!: string;
  @ApiProperty({ nullable: true }) backgroundImageUrl!: string | null;
  @ApiProperty() backgroundFit!: string;
  @ApiProperty({ nullable: true }) loginImageUrl!: string | null;
  @ApiProperty({ nullable: true }) loginMessage!: string | null;
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

  /**
   * One block of the shopkeeper's own words that every product page shows under
   * the product's own description — delivery, returns, care. Plain text, and it
   * arrives here rather than on each product because it is the same sentence on
   * all of them.
   */
  @ApiProperty({ nullable: true }) productDescription!: string | null;

  @ApiProperty({ type: StoreTemplateDto, nullable: true })
  template!: StoreTemplateDto | null;
  @ApiProperty({ type: StoreThemeDto }) theme!: StoreThemeDto;
}
