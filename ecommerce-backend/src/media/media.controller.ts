import {
  Controller, Post, Query, UploadedFile as UploadedFileParam, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaService, type UploadedFile } from './media.service';
import { PlatformOnly, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { MAX_UPLOAD_BYTES } from './upload-limits';
import { PlatformUploadQueryDto, UploadQueryDto } from './dto/media.dto';

/** The multipart body, described once for both routes' generated docs. */
const FILE_BODY = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
  },
};

@ApiTags('Media')
@ApiBearerAuth()
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('media/upload')
  @RequirePermissions(PERMISSIONS.MEDIA_UPLOAD)
  // No `storage` option, so multer keeps the file in memory and never writes a
  // temp file. Uploads are capped at a few megabytes and go straight to the
  // provider, so there is nothing to gain from touching the disk twice.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({ summary: 'Store an image and return the URL to reference it by' })
  upload(
    @UploadedFileParam() file: UploadedFile,
    @Query() query: UploadQueryDto,
  ) {
    return this.media.upload(file, query.purpose ?? 'product');
  }

  /**
   * The platform console's upload, for assets that belong to no store.
   *
   * A second route rather than a `purpose` on the one above, because the
   * difference is not cosmetic: the tenant route runs behind TenantGuard and
   * files under `tenants/<id>/`, and there is no tenant here to file under.
   * `@PlatformOnly` is what makes that safe — only a super admin reaches it.
   */
  @Post('platform/media/upload')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TEMPLATES_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({ summary: 'Store a platform-level image, such as a template thumbnail' })
  uploadPlatform(
    @UploadedFileParam() file: UploadedFile,
    @Query() query: PlatformUploadQueryDto,
  ) {
    return this.media.uploadPlatform(file, query.purpose ?? 'template');
  }
}
