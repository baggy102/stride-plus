import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';
import { StorageService } from './storage/storage.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({
    origin: app.get(ConfigService).get('CORS_ALLOW_ALL') === 'true'
      ? true
      : ['http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083'],
    credentials: true,
  });
  app.use(cookieParser());
  // 사진 주소는 '/uploads/<파일명>'. S3를 쓰면 1시간짜리 서명 URL로 넘기고, 아니면 로컬 폴더에서 바로 준다
  const storage = app.get(StorageService);
  app.use('/uploads/:name', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!storage.usesS3) return next();
    try {
      const url = await storage.signedUrl(String(req.params.name));
      res.set('Cache-Control', 'private, max-age=3000').redirect(302, url);
    } catch (e) {
      next(e);
    }
  });
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Stride+')
    .setDescription('Running tracking + map-based SNS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, swaggerConfig));

  const config = app.get(ConfigService);
  await app.listen(config.get('PORT') ?? 3000);
}
bootstrap();
