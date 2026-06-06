import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { MessagingService } from './messaging.service';

@Module({
  providers: [
    {
      provide: 'RMQ_CLIENT',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('RABBITMQ_URL');
        if (!url) return null; // @Optional() in MessagingService handles null
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [url],
            queue: 'notifications_queue',
            queueOptions: { durable: true },
            noAck: false,
            prefetchCount: 10,
          },
        });
      },
    },
    MessagingService,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
