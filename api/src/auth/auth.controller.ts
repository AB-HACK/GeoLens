import {
  Controller,
  Post,
  Body,
  Response,
  UseGuards,
  Get,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { email: string; password: string },
    @Response({ passthrough: true }) res,
  ) {
    const user = await this.authService.register(body.email, body.password);
    return { success: true, user };
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Response({ passthrough: true }) res,
  ) {
    const { access_token, user } = await this.authService.login(
      body.email,
      body.password,
    );

    // Set HTTP-only cookie
    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { success: true, user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Response({ passthrough: true }) res) {
    res.clearCookie('access_token');
    return { success: true, message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req) {
    return { user: req.user };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      req.user.id,
      body.oldPassword,
      body.newPassword,
    );
  }
}
