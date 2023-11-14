import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { CsvModule } from './csv/csv.module';
import * as dotenv from 'dotenv';
import { MongooseModule } from '@nestjs/mongoose';
dotenv.config();

@Module({
  imports: [
    MongooseModule.forRoot(
      `mongodb+srv://palladium:${process.env.DATABASE_PASSWORD}@csvservice.xosm0mm.mongodb.net/`,
      { dbName: 'test' },
    ),
    UserModule,
    AuthModule,
    CsvModule,
  ],
})
export class AppModule {}
