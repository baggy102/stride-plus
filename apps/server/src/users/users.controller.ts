import { Controller, Delete, Get, HttpCode, Post, Req, Param, NotFoundException } from '@nestjs/common';
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
  async getUser(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('user_not_found');
    return {
      _id: user._id,
      username: user.username,
      profileImageUrl: user.profileImageUrl,
      blockedByMe: await this.usersService.isBlocking(req.user.sub, id),
      ...(await this.usersService.runStats(id)),
    };
  }

  @Post(':id/block')
  @HttpCode(204)
  block(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.usersService.block(req.user.sub, id);
  }

  @Delete(':id/block')
  @HttpCode(204)
  unblock(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.usersService.unblock(req.user.sub, id);
  }
}
