import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_AVATAR = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_MIME_ATTACHMENT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_BYTES_AVATAR     = 5  * 1024 * 1024;  // 5 MB
const MAX_BYTES_ATTACHMENT = 10 * 1024 * 1024;  // 10 MB

@Injectable()
export class FilesService {
  private readonly logger      = new Logger(FilesService.name);
  private readonly driver:     'local' | 's3';
  private readonly storagePath: string;
  private readonly backendUrl:  string;

  // S3 / R2 fields
  private readonly s3Client:    S3Client | null = null;
  private readonly bucket:      string = '';
  private readonly publicUrl:   string = '';

  constructor(private readonly config: ConfigService) {
    this.driver = (this.config.get<string>('STORAGE_DRIVER') ?? 'local') as 'local' | 's3';

    if (this.driver === 's3') {
      const accessKey  = this.config.get<string>('R2_ACCESS_KEY_ID') ?? '';
      const secretKey  = this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '';
      this.bucket      = this.config.get<string>('R2_BUCKET_NAME') ?? '';
      this.publicUrl   = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(/\/$/, '');

      // S3_ENDPOINT → GCS / cualquier provider S3-compatible
      // R2_ACCOUNT_ID → Cloudflare R2 (legacy, si S3_ENDPOINT no está seteado)
      const explicitEndpoint = this.config.get<string>('S3_ENDPOINT');
      const r2AccountId      = this.config.get<string>('R2_ACCOUNT_ID');
      const endpoint = explicitEndpoint
        ?? (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : undefined);

      const region = this.config.get<string>('S3_REGION') ?? 'auto';

      this.s3Client = new S3Client({
        region,
        ...(endpoint && { endpoint }),
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: !!explicitEndpoint, // GCS XML API requiere path-style
      });

      const provider = explicitEndpoint ? new URL(explicitEndpoint).hostname : (r2AccountId ? 'r2' : 's3');
      this.logger.log(`Storage driver: ${provider} → bucket "${this.bucket}"`);
    } else {
      this.storagePath = path.resolve(
        this.config.get<string>('STORAGE_PATH') ?? './uploads',
      );
      const rawBackendUrl = this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3001';
      this.backendUrl = rawBackendUrl.replace(/\/api(\/v\d+)?$/, '');
      fs.mkdirSync(this.storagePath, { recursive: true });
      this.logger.warn('Storage driver: local — files will be lost on container restart');
    }
  }

  /* ── Avatar upload (images only, 5 MB) ─────────────────────────── */

  async save(file: Express.Multer.File): Promise<{ url: string }> {
    this._validateMime(file, ALLOWED_MIME_AVATAR, 'JPEG, PNG, WebP o GIF');
    this._validateSize(file, MAX_BYTES_AVATAR, '5 MB');
    return this._upload(file);
  }

  /* ── Ticket attachment (images + docs, 10 MB) ───────────────────── */

  async saveAttachment(file: Express.Multer.File): Promise<{ url: string; storedName: string }> {
    this._validateMime(file, ALLOWED_MIME_ATTACHMENT, 'imágenes, PDF, Excel o Word');
    this._validateSize(file, MAX_BYTES_ATTACHMENT, '10 MB');
    const result = await this._upload(file);
    const storedName = result.url.split('/').pop() ?? '';
    return { ...result, storedName };
  }

  /* ── Delete ─────────────────────────────────────────────────────── */

  async delete(filenameOrUrl: string): Promise<void> {
    const filename = filenameOrUrl.split('/').pop() ?? '';
    if (!filename) return;

    if (this.driver === 's3' && this.s3Client) {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key:    filename,
      })).catch(err => this.logger.warn(`Storage delete failed for "${filename}": ${err.message}`));
    } else {
      const safe     = path.basename(filename);
      const filepath = path.join(this.storagePath, safe);
      await fs.promises.unlink(filepath).catch(() => { /* already gone */ });
    }
  }

  /* ── Private helpers ────────────────────────────────────────────── */

  private _validateMime(file: Express.Multer.File, allowed: string[], label: string): void {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!allowed.includes(file.mimetype))
      throw new BadRequestException(`Tipo no permitido. Usa ${label}`);
  }

  private _validateSize(file: Express.Multer.File, maxBytes: number, label: string): void {
    if (file.size > maxBytes)
      throw new BadRequestException(`El archivo supera el límite de ${label}`);
  }

  private async _upload(file: Express.Multer.File): Promise<{ url: string }> {
    const ext      = path.extname(file.originalname).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;

    if (this.driver === 's3' && this.s3Client) {
      return this._uploadToS3(file, filename);
    }
    return this._writeLocal(file, filename);
  }

  private async _uploadToS3(
    file: Express.Multer.File,
    filename: string,
  ): Promise<{ url: string }> {
    const upload = new Upload({
      client: this.s3Client!,
      params: {
        Bucket:      this.bucket,
        Key:         filename,
        Body:        Readable.from(file.buffer),
        ContentType: file.mimetype,
      },
    });

    await upload.done();
    return { url: `${this.publicUrl}/${filename}` };
  }

  private async _writeLocal(
    file: Express.Multer.File,
    filename: string,
  ): Promise<{ url: string }> {
    const filepath = path.join(this.storagePath, filename);
    await fs.promises.writeFile(filepath, file.buffer);
    return { url: `${this.backendUrl}/uploads/${filename}` };
  }
}
