import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type { StorageProvider, StoredObject } from '../storage-provider';

/**
 * S3, and anything that speaks its API — MinIO, Cloudflare R2, DigitalOcean
 * Spaces — via `S3_ENDPOINT`.
 *
 * Signed by hand with `node:crypto`, the same choice the Razorpay provider
 * makes. Signature Version 4 is a well-specified algorithm and two HTTP calls,
 * where `@aws-sdk/client-s3` is a large transitive tree for a PUT and a DELETE.
 *
 * Objects are uploaded without an ACL. Buckets increasingly have ACLs disabled
 * ("bucket owner enforced"), where sending `x-amz-acl: public-read` is a hard
 * failure rather than a no-op, so public read is left to the bucket policy or
 * the CDN in front of it. `S3_PUBLIC_BASE_URL` is what a stored URL is built
 * from, which is also how a CDN hostname gets in front of the origin.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly name = 'S3';
  private readonly logger = new Logger(S3StorageProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get bucket(): string {
    return this.config.get<string>('storage.bucket') ?? '';
  }

  private get region(): string {
    return this.config.get<string>('storage.region') ?? '';
  }

  private get accessKeyId(): string {
    return this.config.get<string>('storage.accessKeyId') ?? '';
  }

  private get secretAccessKey(): string {
    return this.config.get<string>('storage.secretAccessKey') ?? '';
  }

  private get sessionToken(): string {
    return this.config.get<string>('storage.sessionToken') ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.bucket && this.region && this.accessKeyId && this.secretAccessKey);
  }

  /** Where the object lives, for signing. Virtual-hosted style. */
  private origin(): string {
    const endpoint = this.config.get<string>('storage.endpoint');
    if (endpoint) {
      const url = new URL(endpoint);
      // Path style for S3-compatible stores, which is what they usually expose.
      return `${url.origin}/${this.bucket}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  /** Where a browser fetches it. Diverges from `origin()` when a CDN is in front. */
  private publicBase(): string {
    const configured = this.config.get<string>('storage.publicBaseUrl');
    return (configured || this.origin()).replace(/\/+$/, '');
  }

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredObject> {
    const response = await this.signedFetch('PUT', input.key, input.body, input.contentType);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`S3 PUT ${input.key} failed: ${response.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException({
        message: 'The file could not be stored. Try again in a moment.',
        code: 'STORAGE_WRITE_FAILED',
      });
    }

    return {
      key: input.key,
      url: `${this.publicBase()}/${input.key}`,
      bytes: input.body.byteLength,
      contentType: input.contentType,
    };
  }

  async remove(key: string): Promise<void> {
    try {
      const response = await this.signedFetch('DELETE', key, Buffer.alloc(0));
      // 404 means the desired end state already holds.
      if (!response.ok && response.status !== 404) {
        this.logger.warn(`S3 DELETE ${key} returned ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`S3 DELETE ${key} failed: ${(error as Error).message}`);
    }
  }

  // --- Signature Version 4 ---------------------------------------------------

  private async signedFetch(
    method: 'PUT' | 'DELETE',
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const url = new URL(`${this.origin()}/${encodeKey(key)}`);

    // Two formats of the same instant: the full stamp signs the request, the
    // date alone scopes the signing key.
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = sha256Hex(body);

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['content-type'] = contentType;
    if (this.sessionToken) headers['x-amz-security-token'] = this.sessionToken;

    const signedHeaders = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h].trim()}\n`).join('');
    const signedHeaderList = signedHeaders.join(';');

    const canonicalRequest = [
      method,
      url.pathname,
      '', // no query string
      canonicalHeaders,
      signedHeaderList,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');

    const signature = hmac(this.signingKey(dateStamp), stringToSign).toString('hex');

    return fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization:
          `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, ` +
          `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
      },
      body: method === 'PUT' ? new Uint8Array(body) : undefined,
    });
  }

  /** Derived per day and per region, which is what limits a leaked key's reach. */
  private signingKey(dateStamp: string): Buffer {
    const kDate = hmac(Buffer.from(`AWS4${this.secretAccessKey}`, 'utf8'), dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    return hmac(kService, 'aws4_request');
  }
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Percent-encodes each path segment as SigV4 requires, leaving `/` as the
 * separator. `encodeURIComponent` misses the sub-delimiters S3 expects encoded,
 * so those are fixed up — a mismatch between the signed path and the sent path
 * is a 403 that looks like a credentials problem.
 */
export function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}
