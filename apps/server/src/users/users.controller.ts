import { Controller, Get, Req, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: { user: { sub: string } }) {
    const user = await this.usersService.findById(req.user.sub);
    if (!user) throw new NotFoundException('user_not_found');
    return {
      _id: user._id,
      email: user.email,
      username: user.username,
      profileImageUrl: user.profileImageUrl,
    };
  }
}
