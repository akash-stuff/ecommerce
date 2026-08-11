import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { Public } from '../common/decorators';
import { StoreConfigDto } from './dto/store.dto';

@ApiTags('Storefront')
@Controller('store')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  /**
   * Public and deliberately unauthenticated: this is the first request a
   * visitor's browser makes. The tenant comes from the hostname, so there is
   * nothing for the caller to supply and nothing it can influence.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Branding and metadata for the store on this hostname' })
  @ApiOkResponse({ type: StoreConfigDto })
  getConfig() {
    return this.stores.getConfig();
  }
}
