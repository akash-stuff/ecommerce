import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { Public } from '../common/decorators';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "The signed-in customer's saved products" })
  list() {
    return this.wishlist.list();
  }

  /**
   * Public so a product page can render the heart correctly for guests too —
   * it answers `false` when nobody is signed in rather than 401ing, which would
   * make every product page log an error for anonymous visitors.
   */
  @Public()
  @Get(':productId')
  @ApiOperation({ summary: 'Whether this product is saved' })
  has(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.wishlist.has(productId);
  }

  @Post(':productId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save a product; idempotent' })
  add(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.wishlist.add(productId);
  }

  @Delete(':productId')
  @HttpCode(204)
  remove(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.wishlist.remove(productId);
  }
}
