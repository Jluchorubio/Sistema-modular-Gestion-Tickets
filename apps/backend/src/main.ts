import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { RedisIoAdapter } from './gateway/adapters/redis-io.adapter';
import { Transport } from '@nestjs/microservices';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './gateway/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // ── Static uploads ──────────────────────────────────────────────────────────
  const uploadsDir = path.resolve(process.env.STORAGE_PATH ?? './uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  // Trust Railway/nginx reverse proxy so req.ip reflects the real client IP
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // WebSocket adapter — Redis when REDIS_URL set (multi-pod), else single-process IoAdapter
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const redisAdapter = new RedisIoAdapter(app);
      await redisAdapter.connectToRedis(redisUrl);
      app.useWebSocketAdapter(redisAdapter);
      console.log('  Redis Socket.IO adapter conectado.');
    } catch (err) {
      console.warn(`  Redis no disponible (${(err as Error).message}) — usando IoAdapter local.`);
      app.useWebSocketAdapter(new IoAdapter(app));
    }
  } else {
    app.useWebSocketAdapter(new IoAdapter(app));
  }

  // RabbitMQ hybrid microservice — active only when RABBITMQ_URL is set
  const rabbitmqUrl = process.env.RABBITMQ_URL;
  if (rabbitmqUrl) {
    app.connectMicroservice({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'notifications_queue',
        queueOptions: { durable: true },
        noAck: false,
        prefetchCount: 10,
      },
    });
    await app.startAllMicroservices();
    console.log('  RabbitMQ microservice conectado.');
  }

  // ── Security ────────────────────────────────────────────────────────────────
  app.use((helmet as any).default({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", 'data:', 'https:'],
        connectSrc:     ["'self'", 'wss:', 'ws:'],
        fontSrc:        ["'self'", 'https:'],
        objectSrc:      ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(compression());

  // CORS: en producción leer ALLOWED_ORIGINS del env
  const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
    .split(',')
    .map(o => o.trim());

  app.enableCors({
    origin: (origin, cb) => {
      // Permitir sin origin (mobile apps, curl, Swagger)
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} no permitido`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global pipes / filters ────────────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Routing ───────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    // Health sin prefijo → Render/Railway health checks usan /health
    exclude: ['health'],
  });

  // Redirigir / → /docs en dev, /health en prod
  app.use('/', (req: any, res: any, next: any) => {
    if (req.url === '/') {
      return res.redirect(process.env.NODE_ENV === 'production' ? '/health' : '/docs');
    }
    next();
  });

  // ── Swagger (solo en desarrollo) ──────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Tickets System API')
      .setDescription('Sistema modular de gestión de tickets')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = process.env.PORT ?? 3001;

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen(port, '0.0.0.0');

  console.log('\n');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log(`  │  🚀  Backend corriendo                   │`);
  console.log(`  │                                          │`);
  console.log(`  │  API:   http://localhost:${port}           │`);
  console.log(`  │  Docs:  http://localhost:${port}/docs      │`);
  console.log(`  │  Health: http://localhost:${port}/health   │`);
  console.log('  └─────────────────────────────────────────┘');
  console.log('\n');
}

bootstrap();
