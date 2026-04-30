import { Injectable } from '@nestjs/common';
import { QrService } from './qr/qr.service';

// future microservice: inventory-service
@Injectable()
export class InventoryService {
  constructor(private readonly qr: QrService) {}

  findAll() {
    return [];
  }

  findOne(_id: string) {
    return null;
  }

  create(_dto: Record<string, unknown>) {
    return null;
  }

  getQr(id: string) {
    return this.qr.generate(id);
  }
}
