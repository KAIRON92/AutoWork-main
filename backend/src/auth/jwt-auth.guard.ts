import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { DEFAULT_JWT_SECRET } from './auth.module';

function readCookie(request: any, name: string): string | undefined {
  const raw = request.headers?.cookie as string | undefined;
  if (!raw) return undefined;
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest();
    const path = request.originalUrl || request.url || '';

    if (
      path.startsWith('/api/v1/auth/login') ||
      path.startsWith('/api/v1/auth/register') ||
      path.startsWith('/api/v1/auth/demo-login') ||
      path.startsWith('/api/v1/auth/forgot-password') ||
      path.startsWith('/api/v1/auth/reset-password') ||
      path.startsWith('/api/v1/pcloud/accounts/oauth/callback') ||
      path.startsWith('/api/v1/email/accounts/gmail/callback') ||
      path.startsWith('/api/health') ||
      path.startsWith('/api/docs')
    ) {
      return true;
    }

    const authorization = request.headers?.authorization as string | undefined;
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : undefined;
    const token = bearerToken || readCookie(request, 'autowork_jwt_token');

    if (!token) throw new UnauthorizedException('Authentication required');

    const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

    try {
      const payload = this.jwtService.verify(token, { secret });
      if (!payload?.sub || !payload?.orgId) throw new UnauthorizedException('Invalid authentication token');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }
}
