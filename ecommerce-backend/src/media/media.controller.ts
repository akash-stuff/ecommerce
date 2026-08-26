import {
  Controller, Post, Query, UploadedFile as UploadedFileParam, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaService, type UploadedFile } from './media.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { MAX_UPLOAD_BYTES } from './upload-limits';
import { UploadQueryDto } from './dto/media.dto';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @RequirePermissions(PERMISSIONS.MEDIA_UPLOAD)
  // No `storage` option, so multer keeps the file in memory and never writes a
  // temp file. Uploads are capped at a few megabytes and go straight to the
  // provider, so there is nothing to gain from touching the disk twice.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Store an image and return the URL to reference it by' })
  upload(
    @UploadedFileParam() file: UploadedFile,
    @Query() query: UploadQueryDto,
  ) {
    return this.media.upload(file, query.purpose ?? 'product');
  }
}
