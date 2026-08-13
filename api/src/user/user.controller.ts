import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.userService.getProfile(req.user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req,
    @Body() body: { email: string },
  ) {
    return this.userService.updateProfile(req.user.id, body.email);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @Request() req,
    @Body() body: { password: string },
  ) {
    return this.userService.deleteAccount(req.user.id, body.password);
  }

  @Get('privacy')
  async getPrivacyStatement() {
    return this.userService.getPrivacyStatement();
  }
}
