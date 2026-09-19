import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../config/config.service';
import { getRedisConnectionOptions } from '../config/redis.config';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly redis: Redis;
  private readonly windowSeconds = 15 * 60;
  private readonly loginLimit = 5;
  private readonly otherAuthLimit = 10;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      ...getRedisConnectionOptions(),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 800,
    });
    this.redis.on('error', () => {});
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = request.route?.path || request.url || 'auth';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : 'anonymous';
    const forwarded = request.headers?.['x-forwarded-for'];
    const ip = request.ip || (Array.isArray(forwarded) ? forwarded[0] : forwarded) || 'unknown';
    const bucket = path.includes('/login') ? this.loginLimit : this.otherAuthLimit;
    const key = `autowork:auth-rate:${path}:${ip}:${email}`;

    try {
      if (this.redis.status !== 'ready') {
        await Promise.race([
          this.redis.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timeout')), 600)),
        ]);
      }
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, this.windowSeconds);
      if (count > bucket) {
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many authentication attempts. Please try again later.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Fail-open: If Redis is unavailable or timing out, do not lock users out of registration or login
      return true;
    }
  }
}
