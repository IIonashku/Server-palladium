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
      `mongodb+srv://${process.env.DATABASE_USERNAME_L}:${process.env.DATABASE_PASSWORD_L}${process.env.DATABASE_L}`,
    ),
    UserModule,
    AuthModule,
    CsvModule,
  ],
})
export class AppModule {}
