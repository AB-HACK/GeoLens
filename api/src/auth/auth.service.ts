import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma.service';
import { AppLogger } from '../common/logger.service';

@Injectable()
export class AuthService {
  private logger = new AppLogger();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.logger.setContext('AuthService');
  }

  async register(email: string, password: string) {
    this.logger.log(`Registration attempt for email: ${email}`);
    
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      this.logger.warn(`Registration failed: User already exists for email: ${email}`);
      throw new ConflictException('User already exists');
    }

    // Hash password with argon2
    const passwordHash = await argon2.hash(password);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    this.logger.log(`User registered successfully: ${user.id}`);
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  async login(email: string, password: string) {
    this.logger.log(`Login attempt for email: ${email}`);
    
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      this.logger.warn(`Login failed: User not found for email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await argon2.verify(user.passwordHash, password);

    if (!isValidPassword) {
      this.logger.warn(`Login failed: Invalid password for email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    const access_token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
      },
      {
        secret: jwtSecret,
        expiresIn: process.env.JWT_EXPIRATION || '7d',
      },
    );

    this.logger.log(`User logged in successfully: ${user.id}`);
    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async validateToken(token: string) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET environment variable is not set');
      }
      const payload = this.jwtService.verify(token, {
        secret: jwtSecret,
      });
      return payload;
    } catch {
      this.logger.warn(`Token validation failed: Invalid token`);
      throw new UnauthorizedException('Invalid token');
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    this.logger.log(`Password change attempt for user: ${userId}`);
    
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.warn(`Password change failed: User not found: ${userId}`);
      throw new UnauthorizedException('User not found');
    }

    // Verify old password
    const isValidPassword = await argon2.verify(user.passwordHash, oldPassword);

    if (!isValidPassword) {
      this.logger.warn(`Password change failed: Invalid current password for user: ${userId}`);
      throw new UnauthorizedException('Invalid current password');
    }

    // Hash new password
    const newPasswordHash = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    this.logger.log(`Password changed successfully for user: ${userId}`);
    return { message: 'Password changed successfully' };
  }
}
