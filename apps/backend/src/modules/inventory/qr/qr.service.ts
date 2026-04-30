import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  async generate(assetId: string): Promise<string> {
    return QRCode.toDataURL(`asset:${assetId}`);
  }

  async generateBatch(assetIds: string[]): Promise<Record<string, string>> {
    const entries = await Promise.all(
      assetIds.map(async (id) => [id, await this.generate(id)] as const),
    );
    return Object.fromEntries(entries);
  }
}
