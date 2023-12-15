import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Scope,
} from '@nestjs/common';
import { User } from './user.schema';
import { UserCreateDto, UserLoginDto, UserUpdateTokenDto } from './user.dto';
import * as bcrypt from 'bcryptjs';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable({ scope: Scope.REQUEST })
export class UserService {
  constructor(
    @InjectModel(User.name)
    private readonly userRepository: Model<User>,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async getRequest(): Promise<Request> {
    return await this.request;
  }

  async getAll(): Promise<User[]> {
    return await this.userRepository
      .find({})
      .select(['_id', 'username', 'role']);
  }

  async createUser(
    userCreateDto: UserCreateDto,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository
      .findOne({
        username: userCreateDto.username,
      })
      .select(['_id', 'username', 'role']);
    if (user) {
      throw new HttpException(
        'User with this username is already exist',
        HttpStatus.BAD_REQUEST,
      );
    }
    const hash = await bcrypt.hash(userCreateDto.password, 10);
    userCreateDto.password = hash;
    const newUser = new this.userRepository(userCreateDto);
    await newUser.save();
    const responseUser = {
      _id: newUser._id,
      user: newUser.user,
      username: newUser.username,
      role: newUser.role,
      jwt: null,
      refresh: null,
    };
    return responseUser;
  }

  async loginUser(user: UserLoginDto): Promise<User> {
    const loginedUser = await this.userRepository.findOne({
      username: user.username,
    });
    if (loginedUser) {
      const isMatch = await bcrypt.compare(user.password, loginedUser.password);
      if (isMatch) {
        loginedUser.password = user.password;
        return loginedUser;
      } else {
        throw new HttpException('Unauthrized', HttpStatus.UNAUTHORIZED);
      }
    } else {
      throw new HttpException('Unauthrized', HttpStatus.UNAUTHORIZED);
    }
  }

  async findUserByUsername(username: string) {
    return await this.userRepository
      .findOne({
        username: username,
      })
      .select(['_id', 'username', 'password', 'role']);
  }

  async findUserById(id: string) {
    return await this.userRepository
      .findById(id)
      .select(['_id', 'username', 'role']);
  }

  async findUserAndUpdatePassword(
    id: string,
    newPassword: string[],
    oldPassword: string,
  ) {
    const oldPasswordInBase = await this.userRepository.findById(id);
    if (oldPasswordInBase) {
      const isMatch = await bcrypt.compare(
        oldPassword,
        oldPasswordInBase.password,
      );
      if (newPassword[0] === newPassword[1]) {
        if (isMatch) {
          const hash = await bcrypt.hash(newPassword[1], 10);

          return await this.userRepository
            .findOneAndUpdate({ _id: id }, { password: hash })
            .select(['_id', 'username', 'role']);
        } else
          throw new HttpException(
            'Password not correct',
            HttpStatus.BAD_REQUEST,
          );
      } else
        throw new HttpException(
          'new password and confirm password not the same',
          HttpStatus.BAD_REQUEST,
        );
    } else throw new HttpException('User not exist', HttpStatus.BAD_REQUEST);
  }

  async findUserAndUpdateUsername(
    id: string,
    password: string,
    newUsername: string,
  ) {
    const oldUserInBase = await this.userRepository.findById(id);
    if (oldUserInBase) {
      const isMatch = await bcrypt.compare(password, oldUserInBase.password);
      if (isMatch) {
        return await this.userRepository
          .findOneAndUpdate({ _id: id }, { username: newUsername })
          .select(['_id', 'username', 'role']);
      } else
        throw new HttpException('Password not correct', HttpStatus.BAD_REQUEST);
    } else throw new HttpException('User not exist', HttpStatus.BAD_REQUEST);
  }

  async deleteUserById(id: string) {
    return await this.userRepository.findByIdAndDelete(id);
  }

  async findUsersTokensById(id: string) {
    return await this.userRepository.findById({ _id: id });
  }

  async findByRefreshToken(token: string) {
    return await this.userRepository.findOne({ refresh: token });
  }

  async findByAccessToken(token: string) {
    return await this.userRepository.findOne({ jwt: token });
  }

  async updateTokens(userToken: UserUpdateTokenDto, id: string) {
    return await this.userRepository.findByIdAndUpdate({ _id: id }, userToken);
  }
}
