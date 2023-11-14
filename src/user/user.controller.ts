import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.sevice';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { JwtService } from '@nestjs/jwt';

@ApiTags('User controller')
@UseGuards(AuthGuard)
@Controller('user')
export class UserController {
  constructor(
    private userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  @ApiOperation({ summary: 'Get all user' })
  @ApiBearerAuth('JWT-auth')
  @Get()
  async getAllUsers() {
    const token: any = await this.userService.getRequest();
    const payload: any = this.jwtService.decode(
      token.headers.authorization.split(' ')[1],
    );
    if (payload.role === 'ADMIN') return this.userService.getAll();
    else {
      throw new HttpException(
        'You must be an admin to do this',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @ApiOperation({ summary: 'Get user' })
  @ApiBearerAuth('JWT-auth')
  @Get('me/')
  async getUser() {
    const token: any = await this.userService.getRequest();
    const payload: any = this.jwtService.decode(
      token.headers.authorization.split(' ')[1],
    );
    return this.userService.findUserById(payload.sub);
  }

  @ApiOperation({ summary: 'Get user' })
  @ApiBearerAuth('JWT-auth')
  @Delete('delete/me/')
  async deleteUser() {
    const token: any = await this.userService.getRequest();
    const payload: any = this.jwtService.decode(
      token.headers.authorization.split(' ')[1],
    );
    return this.userService.deleteUserById(payload.sub);
  }
}
