import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  UserCreateDto,
  UserLoginDto,
  UserUpdateTokenDto,
} from 'src/user/user.dto';
import { User } from 'src/user/user.schema';
import { UserService } from 'src/user/user.sevice';
import * as bcrypt from 'bcryptjs';

@Injectable({ scope: Scope.REQUEST })
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  /// CREATE ////////////////////////////////////

  async createUser(user: UserCreateDto): Promise<Omit<User, 'password'>> {
    const newUser = await this.userService.createUser(user);
    const tokens: UserUpdateTokenDto = {
      jwt: this.jwtService.sign({
        sub: newUser.user,
        username: newUser.username,
        role: newUser.role,
      }),
      refresh: this.jwtService.sign({
        sub: newUser.user,
        username: newUser.username,
        role: newUser.role,
      }),
    };
    await this.userService.updateTokens(tokens, newUser._id);
    return newUser;
  }

  /// LOGIN ////////////////////////////////////

  async login(user: UserLoginDto) {
    const loginedUser = await this.userService.findUserByUsername(
      user.username,
    );
    if (!loginedUser) {
      throw new UnauthorizedException();
    }
    const payload = {
      sub: loginedUser._id,
      username: loginedUser.username,
      role: loginedUser.role,
      iat: new Date().getTime(),
    };
    const isMatch = await bcrypt.compare(user.password, loginedUser.password);
    if (isMatch) {
      const tokens: UserUpdateTokenDto = {
        jwt: await this.jwtService.sign(payload),
        refresh: await this.jwtService.sign(payload, {
          secret: process.env.JWT_REFRESH_SECRET,
        }),
      };
      await this.userService.updateTokens(tokens, loginedUser._id.toString());
      return {
        user: {
          _id: loginedUser._id,
          username: loginedUser.username,
          role: loginedUser.role,
        },
        access_token: tokens.jwt,
        refresh_token: tokens.refresh,
      };
    } else {
      throw new UnauthorizedException();
    }
  }

  // LOGOUT //////////////////////////////////

  async logout(userId: string) {
    return this.userService.updateTokens({ refresh: null, jwt: null }, userId);
  }

  // REFRESH ////////////////////////////////

  async refreshToken(token: string) {
    const info: any = await this.jwtService.decode(token);
    const payload = {
      sub: info.sub,
      username: info.username,
      role: info.role,
      iat: new Date().getTime(),
    };

    const userToken: UserUpdateTokenDto = {
      jwt: await this.jwtService.sign(payload),
      refresh: await this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
      }),
    };
    await this.userService.updateTokens(userToken, info.sub);
    return { access_token: userToken.jwt, refresh_token: userToken.refresh };
  }

  async findRefreshToken(token: string) {
    return this.userService.findByRefreshToken(token);
  }

  async findAccessToken(token: string) {
    return this.userService.findByAccessToken(token);
  }
}
