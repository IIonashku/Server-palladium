import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpException, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
dotenv.config();

const whitelist = ['http://localhost:8080', 'http://16.170.172.90'];

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      origin: function (origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (whitelist.includes(origin)) {
          callback(null, true);
        } else {
          console.log('blocked cors for:', origin);
          callback(new HttpException('Not allowed by CORS', 500), false);
        }
      },
    },
  });
  app.useGlobalPipes(new ValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('Palladium Service')
    .setDescription('Service for palladium app')
    .addBearerAuth(
      {
        type: 'http',
        name: 'JWT',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addSecurity('refreshToken', {
      type: 'http',
      name: 'refreshToken',
      scheme: 'bearer',
      bearerFormat: 'Refresh',
      description: 'Enter refresh token',
      in: 'header',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/api/docs', app, document);
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
