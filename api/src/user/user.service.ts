import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, email: string) {
    // Check if email is already taken
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('Email already in use');
    }

    return await this.prisma.user.update({
      where: { id: userId },
      data: { email },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify password
    const isValidPassword = await argon2.verify(user.passwordHash, password);

    if (!isValidPassword) {
      throw new ForbiddenException('Invalid password');
    }

    // Delete user and all associated data (cascade)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'Account deleted successfully' };
  }

  async getPrivacyStatement() {
    return {
      title: 'GeoLens Data Privacy & Storage',
      sections: [
        {
          heading: 'What data we store',
          content: [
            '• Your email address and account information',
            '• Your uploaded images (for analysis)',
            '• GeoCLIP predictions (estimated locations)',
            '• Extracted evidence (detected landmarks, text, objects, labels)',
            '• Timestamps of when analyses were performed',
          ],
        },
        {
          heading: 'Why we store this data',
          content: [
            '• To enable you to view your analysis history',
            '• To improve model performance over time (with your permission)',
            '• To troubleshoot issues with predictions',
            '• To comply with legal requirements',
          ],
        },
        {
          heading: 'Data access & security',
          content: [
            '• Only you can access your own analyses',
            '• Images are stored securely with encryption at rest',
            '• Passwords are hashed with argon2 (never stored in plain text)',
            '• All API communications use HTTPS',
          ],
        },
        {
          heading: 'Data deletion',
          content: [
            '• You can delete your account and all associated data at any time',
            '• When you delete your account, all images and analyses are permanently removed',
            '• This action cannot be undone',
          ],
        },
        {
          heading: 'Important limitations',
          content: [
            '• GeoLens does NOT perform face recognition or identity matching',
            '• The model is designed for general geolocation estimation only',
            '• Predictions are probabilistic estimates, not ground truth',
            '• We cannot guarantee accuracy for all image types',
          ],
        },
      ],
    };
  }
}
