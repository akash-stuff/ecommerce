import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
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

/** What a store's upload is for. Decides the key prefix, nothing more. */
export type TenantMediaPurpose = 'product' | 'theme' | 'banner' | 'category';

/**
 * What a platform-level upload is for. Kept as its own type so the compiler,
 * not a code review, is what stops a tenant asset being filed under the
 * platform prefix where every tenant can be shown it.
 */
export type PlatformMediaPurpose = 'template';

export type MediaPurpose = TenantMediaPurpose | PlatformMediaPurpose;

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly local: LocalStorageProvider,
    private readonly s3: S3StorageProvider,
  ) {}

  /**
   * Reports which store uploads go to, and catches the one misconfiguration
   * that produces no error at all.
   *
   * `STORAGE_PUBLIC_BASE_URL` is what a stored URL is built from. Left pointing
   * at this API — which is right for local disk and the value in
   * `.env.example` — every S3 upload succeeds and every returned URL is a 404,
   * with the wrong address written into the database permanently. Uploading
   * again later does not repair the rows already saved, which is why this is
   * worth shouting about at boot rather than diagnosing from broken images.
   */
  onModuleInit(): void {
    const provider = this.provider();
    const base = this.config.get<string>('storage.publicBaseUrl') ?? '';

    this.logger.log(`Uploads go to ${provider.name}`);

    if (provider.name !== 'S3') {
      // Partial S3 credentials mean someone intended S3 and it silently is not
      // being used, which is its own quiet failure.
      const partial = ['storage.bucket', 'storage.region', 'storage.accessKeyId', 'storage.secretAccessKey']
        .filter((key) => this.config.get<string>(key));
      if (partial.length > 0) {
        this.logger.warn(
          `S3 is partially configured (${partial.length}/4 values) so uploads are going to ` +
            'local disk instead. Set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID and ' +
            'AWS_SECRET_ACCESS_KEY together.',
        );
      }
      return;
    }

    if (/localhost|127\.0\.0\.1|\[::1\]/i.test(base)) {
      this.logger.error(
        `S3 is configured but STORAGE_PUBLIC_BASE_URL is "${base}". Stored image URLs ` +
          'will point at this API instead of the bucket or CDN, and will 404 for every ' +
          'visitor. Set it to your bucket or CDN address, or leave it blank to use the ' +
          'bucket URL directly.',
      );
    }
  }

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

  /** A store's own asset, filed under that store's prefix. */
  upload(file: UploadedFile, purpose: TenantMediaPurpose): Promise<StoredObject> {
    return this.store(file, `tenants/${RequestContextStore.requireTenantId()}/${purpose}`);
  }

  /**
   * A platform asset — today, a template's gallery thumbnail.
   *
   * Separate from `upload` because the platform console runs with no tenant at
   * all, so the tenant prefix cannot be built. Routing it through the same
   * method with a nullable tenant would mean one missing guard away from a
   * store's product photo landing in the shared namespace.
   */
  uploadPlatform(file: UploadedFile, purpose: PlatformMediaPurpose): Promise<StoredObject> {
    return this.store(file, `platform/${purpose}`);
  }

  private async store(file: UploadedFile, prefix: string): Promise<StoredObject> {
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
      key: this.buildKey(prefix, type.extension),
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
   * the file. A UUID under a caller-chosen prefix has none of those problems,
   * and the prefix means one tenant's objects can be listed, migrated or
   * deleted without touching another's.
   */
  private buildKey(prefix: string, extension: string): string {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    return `${prefix}/${month}/${randomUUID()}.${extension}`;
  }
}
