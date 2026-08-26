import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RequestContextStore } from '../common/context/request-context';
import { detectImageType, SUPPORTED_IMAGE_TYPES } from './image-type';
import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';
import type { StorageProvider, StoredObject } from './storage-provider';

/** The shape multer hands over, declared rather than pulling in @types/multer. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** What an upload is for. Decides the key prefix, nothing more. */
export type MediaPurpose = 'product' | 'theme' | 'banner';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly local: LocalStorageProvider,
    private readonly s3: S3StorageProvider,
  ) {}

  /**
   * S3 when it has credentials, disk otherwise.
   *
   * Chosen per call rather than once at boot so a deployment that gains
   * credentials starts using them on restart without a code path changing, and
   * so tests can exercise either.
   */
  provider(): StorageProvider {
    return this.s3.isConfigured() ? this.s3 : this.local;
  }

  get maxBytes(): number {
    return this.config.get<number>('storage.maxUploadBytes', 5 * 1024 * 1024);
  }

  async upload(file: UploadedFile, purpose: MediaPurpose): Promise<StoredObject> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        message: 'No file was received.',
        code: 'FILE_MISSING',
      });
    }

    // Multer's own limit should have caught this; checked again because the
    // limit is configuration and the two can drift.
    if (file.buffer.byteLength > this.maxBytes) {
      throw new PayloadTooLargeException({
        message: `That file is larger than ${Math.floor(this.maxBytes / 1024 / 1024)}MB.`,
        code: 'FILE_TOO_LARGE',
      });
    }

    // The declared mimetype is not consulted: the bytes decide.
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new BadRequestException({
        message: `That file is not an image we can serve. Use ${SUPPORTED_IMAGE_TYPES.join(', ')}.`,
        code: 'UNSUPPORTED_FILE_TYPE',
      });
    }

    const stored = await this.provider().put({
      key: this.buildKey(purpose, type.extension),
      body: file.buffer,
      contentType: type.contentType,
    });

    this.logger.log(`Stored ${stored.key} (${stored.bytes} bytes) via ${this.provider().name}`);

    return stored;
  }

  /**
   * Keys are generated, never derived from the uploaded filename.
   *
   * A filename is attacker-controlled: it can traverse (`../../etc/passwd`),
   * collide with another tenant's object, or leak whatever the customer called
   * the file. A UUID under a tenant prefix has none of those problems, and the
   * prefix means one tenant's objects can be listed, migrated or deleted
   * without touching another's.
   */
  private buildKey(purpose: MediaPurpose, extension: string): string {
    const tenantId = RequestContextStore.requireTenantId();
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    return `tenants/${tenantId}/${purpose}/${month}/${randomUUID()}.${extension}`;
  }
}
