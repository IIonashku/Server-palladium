import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import * as dotenv from 'dotenv';
import { RefreshTokenStrategy } from './strategies/refreshToken.strategy';
dotenv.config();

@Global()
@Module({
  imports: [
    UserModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '360000s' },
    }),
  ],
  providers: [AuthService, AuthGuard, RefreshTokenStrategy],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
