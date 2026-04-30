import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Abstraction over EventEmitter2 so that in microservices mode
 * this class is replaced by a Redis-backed publisher without touching call sites.
 */
@Injectable()
export class EventBusService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: string, payload: unknown): void {
    this.emitter.emit(event, payload);
  }

  async emitAsync(event: string, payload: unknown): Promise<void> {
    await this.emitter.emitAsync(event, payload);
  }
}
