import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
const MAX_BYTES_AVATAR     = 5  * 1024 * 1024;
const MAX_BYTES_ATTACHMENT = 10 * 1024 * 1024;

@Injectable()
export class FilesService {
  private readonly storagePath: string;
  private readonly backendUrl:  string;

  constructor(private readonly config: ConfigService) {
    this.storagePath = path.resolve(
      this.config.get<string>('STORAGE_PATH') ?? './uploads',
    );
    this.backendUrl = this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3001';
    fs.mkdirSync(this.storagePath, { recursive: true });
  }

  async save(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_MIME_AVATAR.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa JPEG, PNG, WebP o GIF');
    }
    if (file.size > MAX_BYTES_AVATAR) {
      throw new BadRequestException('El archivo supera el límite de 5 MB');
    }
    return this._write(file);
  }

  async saveAttachment(file: Express.Multer.File): Promise<{ url: string; storedName: string }> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_MIME_ATTACHMENT.includes(file.mimetype)) {
      throw new BadRequestException('Tipo no permitido. Usa imágenes, PDF, Excel o Word.');
    }
    if (file.size > MAX_BYTES_ATTACHMENT) {
      throw new BadRequestException('El archivo supera el límite de 10 MB');
    }
    const result = await this._write(file);
    const storedName = path.basename(result.url);
    return { ...result, storedName };
  }

  private async _write(file: Express.Multer.File): Promise<{ url: string }> {
    const ext      = path.extname(file.originalname).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(this.storagePath, filename);
    await fs.promises.writeFile(filepath, file.buffer);
    return { url: `${this.backendUrl}/uploads/${filename}` };
  }

  async delete(filename: string): Promise<void> {
    const safe = path.basename(filename); // prevent path traversal
    const filepath = path.join(this.storagePath, safe);
    await fs.promises.unlink(filepath).catch(() => { /* ignore if already gone */ });
  }
}
