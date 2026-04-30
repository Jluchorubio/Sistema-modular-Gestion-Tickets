import { Injectable } from '@nestjs/common';

// future microservice: files-service (Go) — I/O intensive
@Injectable()
export class FilesService {
  save(_file: Express.Multer.File): { url: string } {
    return { url: '' };
  }
}
