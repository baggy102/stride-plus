import { Controller, Delete, Get, HttpCode, Req, Param, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: { user: { sub: string } }) {
    // NOTE: 'me' must be declared before ':id' so NestJS routes it correctly
    const user = await this.usersService.findById(req.user.sub);
    if (!user) throw new NotFoundException('user_not_found');
    return {
      _id: user._id,
      email: user.email,
      username: user.username,
      profileImageUrl: user.profileImageUrl,
    };
  }

  @Delete('me')
  @HttpCode(204)
  deleteMe(@Req() req: { user: { sub: string } }) {
    return this.usersService.deleteAccount(req.user.sub);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('user_not_found');
    return {
      _id: user._id,
      username: user.username,
      profileImageUrl: user.profileImageUrl,
    };
  }
}
