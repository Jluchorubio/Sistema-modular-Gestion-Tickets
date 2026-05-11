import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES     = 5 * 1024 * 1024; // 5 MB

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
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa JPEG, PNG, WebP o GIF');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('El archivo supera el límite de 5 MB');
    }

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
