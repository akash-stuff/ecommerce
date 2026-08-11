import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreateReviewDto, ModerateReviewDto, ReviewQueryDto } from './dto/review.dto';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('product/:productId')
  @ApiOperation({ summary: 'Approved reviews for a product, with a rating histogram' })
  findForProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviews.findForProduct(productId, query);
  }

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Leave a review; held for moderation' })
  create(@Body() dto: CreateReviewDto) {
    return this.reviews.create(dto);
  }

  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: 'The signed-in customer\'s own reviews' })
  findMine(@Query() query: ReviewQueryDto) {
    return this.reviews.findMine(query);
  }

  @ApiBearerAuth()
  @Get()
  @RequirePermissions(PERMISSIONS.REVIEWS_MODERATE)
  @ApiOperation({ summary: 'All reviews, for moderation' })
  findAll(@Query() query: ReviewQueryDto) {
    return this.reviews.findAll(query);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.REVIEWS_MODERATE)
  @ApiOperation({ summary: 'Approve or reject; recomputes the product rating' })
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.moderate(id, dto.status);
  }
}
