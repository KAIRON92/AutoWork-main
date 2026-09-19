import * as dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  environment: string;
  databaseUrl: string;
  redisUrl: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  jwtSecret: string;
  pcloudApiHost: string;
  pcloudClientId: string;
  pcloudClientSecret: string;
  pcloudAccessToken: string;
}

export const configuration = (): AppConfig => ({
  port: parseInt(process.env.PORT || '4000', 10),
  environment: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://autowork:autoworkpass@localhost:5432/autowork_db?schema=public',
  redisUrl: process.env.REDIS_URL || '',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  jwtSecret: process.env.JWT_SECRET || '',
  pcloudApiHost: process.env.PCLOUD_API_HOST || 'https://api.pcloud.com',
  pcloudClientId: process.env.PCLOUD_CLIENT_ID || '',
  pcloudClientSecret: process.env.PCLOUD_CLIENT_SECRET || '',
  pcloudAccessToken: process.env.PCLOUD_ACCESS_TOKEN || '',
});
