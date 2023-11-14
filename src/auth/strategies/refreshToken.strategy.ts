import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: process.env.JWT_REFRESH_SECRET,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const refreshToken: any = req.headers.refreshtoken;
    if (!refreshToken) {
      return false;
    }
    try {
      const founded = await this.authService.findRefreshToken(refreshToken);
      if (!founded) {
        return false;
      }
    } catch (e) {
      return false;
    }
    return { ...payload, token: refreshToken };
  }
}
