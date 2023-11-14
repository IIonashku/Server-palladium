import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiCreatedResponse,
  ApiBody,
  ApiTags,
  ApiBearerAuth,
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { validate } from 'class-validator';
import { UserCreateDto, UserLoginDto } from 'src/user/user.dto';
import { AuthService } from './auth.service';
import { Public } from './public.declaration';
import { AuthGuard } from './auth.guard';
import { JwtService } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
import { User } from 'src/user/user.entity';
import { RefreshTokenStrategy } from './strategies/refreshToken.strategy';
import { Request } from 'express';
dotenv.config();
@ApiTags('Auth controller')
@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly refreshService: RefreshTokenStrategy,
  ) {}

  // CREATE ////////////////////////

  @ApiOperation({ summary: 'Create new user' })
  @ApiCreatedResponse({ description: 'User created' })
  @ApiBody({ type: UserCreateDto })
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ type: User })
  @Post('create/')
  async createUser(@Body() user: UserCreateDto, @Req() req: Request) {
    const token: any = req.headers;
    const payload: any = this.jwtService.decode(
      token.authorization.split(' ')[1],
    );
    if (payload.role === 'ADMIN') {
      const errors = await validate(user);
      if (errors.length > 0) {
        throw new HttpException(errors, HttpStatus.BAD_REQUEST);
      }
      return this.authService.createUser(user);
    } else {
      throw new HttpException(
        'Only admin user can create new users',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // LOGIN //////////////////////////////

  @ApiOperation({ summary: 'Login user' })
  @ApiCreatedResponse({ description: 'User logined' })
  @ApiBody({ type: UserLoginDto })
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('login/')
  async loginUser(@Body() user: UserLoginDto) {
    const errors = await validate(user);
    if (errors.length > 0) {
      throw new HttpException(errors, HttpStatus.BAD_REQUEST);
    }
    return this.authService.login(user);
  }

  // REFRESH ////////////////////////////////

  @ApiOperation({
    summary: 'Refresh access token for user',
    description:
      'Router for change refresh token to new access token and refresh token',
  })
  @ApiCreatedResponse({ description: 'Token refreshed' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'refreshToken', description: 'refresh token' })
  @Public()
  @Get('refresh/')
  async refreshToken(@Req() req: Request) {
    const tokens: any = req.headers;
    if (await this.refreshService.validate(req, {}))
      return this.authService.refreshToken(tokens.refreshtoken);
    else throw new UnauthorizedException();
  }

  @ApiOperation({
    summary: 'Check route',
    description: 'Route for checking access token',
  })
  @ApiCreatedResponse({ description: 'Token refreshed' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @Post('/check')
  async checkToken() {
    return true;
  }
}
