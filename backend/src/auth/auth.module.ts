import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_JWT_SECRET = 'supersecretjwtkeyforautoworkauditacceptance2026';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AuthRateLimitGuard, PrismaService],
  exports: [AuthService, JwtModule, JwtAuthGuard, AuthRateLimitGuard],
})
export class AuthModule {}

