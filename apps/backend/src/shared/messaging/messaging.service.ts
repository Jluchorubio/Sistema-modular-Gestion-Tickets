import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';

/**
 * Unified event bus. Uses RabbitMQ when RABBITMQ_URL is set, falls back to
 * in-process EventEmitter2 (dev / no-broker mode). Producers call emit() and
 * never need to know which transport is active.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly useRmq: boolean;

  constructor(
    private readonly events: EventEmitter2,
    @Optional() @Inject('RMQ_CLIENT') private readonly rmqClient?: ClientProxy,
  ) {
    this.useRmq = !!rmqClient;
    this.logger.log(
      this.useRmq
        ? 'MessagingService: usando RabbitMQ'
        : 'MessagingService: usando EventEmitter2 (in-process)',
    );
  }

  emit(event: string, payload: unknown): void {
    if (this.useRmq) {
      this.rmqClient!.emit(event, payload);
    } else {
      this.events.emit(event, payload);
    }
  }
}
