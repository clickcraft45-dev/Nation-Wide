import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * The one way application files reach permanent storage. Everything under storage/ used to be
 * written to the container filesystem, which does not survive a redeploy — invoice PDFs are a
 * statutory record, so losing them on a `docker compose up --build` was a real data-loss bug.
 *
 * CREDENTIALS ARE NEVER CONFIGURED HERE. On EC2 the SDK's default provider chain picks up the
 * instance IAM role automatically; there is deliberately no AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
 * handling, so a static key pair cannot be introduced by setting an env var.
 *
 * The bucket is private and stays private: nothing here sets an ACL, and reads are handed out as
 * short-lived presigned URLs by callers that have already authorised the user.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET_NAME') ?? '';
    this.client = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-south-1',
    });
  }

  /** False when S3 is unconfigured, so callers can fail with a clear message rather than a stack. */
  get isConfigured(): boolean {
    return this.bucket.length > 0;
  }

  get bucketName(): string {
    return this.bucket;
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string; size: number }> {
    this.assertConfigured();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // No ACL: the bucket has Block Public Access on, and an ACL here would be both ignored
        // and misleading about the object's reachability.
      }),
    );
    return { key, size: body.length };
  }

  async get(key: string): Promise<Buffer> {
    this.assertConfigured();
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = result.Body;
    if (!body) throw new Error(`S3 object ${key} has no body`);
    return Buffer.from(await body.transformToByteArray());
  }

  /** Best-effort: an orphaned object costs pennies, a failed delete must not fail the request. */
  async delete(key: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      // Key only — never the bucket policy or credential detail.
      this.logger.warn(
        `Could not delete S3 object ${key}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * A time-boxed read URL for one object. Callers MUST have authorised the user first — this
   * grants whoever holds the URL read access to that object until it expires.
   */
  presignGet(key: string, expiresInSeconds = 300, filename?: string) {
    this.assertConfigured();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(filename
          ? {
              ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
            }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new Error(
        'S3_BUCKET_NAME is not set — file storage is unavailable. See docs/ENV_VARS.md.',
      );
    }
  }
}
