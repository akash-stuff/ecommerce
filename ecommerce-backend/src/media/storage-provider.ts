/**
 * What the platform needs from any object store.
 *
 * Product images and theme assets depend on this interface, never on a vendor
 * SDK, so moving from a disk to S3 to a CDN is a class here plus configuration
 * — not a change to the upload endpoint or to anything that renders a URL.
 */

export interface StoredObject {
  /** The path within the store. Stable, and what a later delete refers to. */
  key: string;
  /** Absolute URL a browser can fetch. */
  url: string;
  bytes: number;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;

  /**
   * True when the store can actually be written to. A provider that reports
   * false is never selected, so an upload fails with a clear reason instead of
   * appearing to succeed and returning a URL that 404s.
   */
  isConfigured(): boolean;

  put(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredObject>;

  /**
   * Best-effort. A failure here is logged, not thrown: an orphaned object costs
   * storage, while a failed delete that breaks a product edit costs a sale.
   */
  remove(key: string): Promise<void>;
}
