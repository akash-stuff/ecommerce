import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';

@Module({
  controllers: [MediaController],
  providers: [MediaService, LocalStorageProvider, S3StorageProvider],
  exports: [MediaService, LocalStorageProvider],
})
export class MediaModule {}
