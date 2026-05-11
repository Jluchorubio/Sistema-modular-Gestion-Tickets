import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // ── Security ────────────────────────────────────────────────────────────────
  app.use((helmet as any).default());
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
