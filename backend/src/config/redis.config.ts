import Redis, { RedisOptions } from 'ioredis';

export function getRedisConnectionOptions(): RedisOptions {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const isTls = parsed.protocol === 'rediss:';
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch {
      // Fallback if URL parsing fails
      return {
        path: redisUrl,
        maxRetriesPerRequest: null,
      };
    }
  }

  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD?.trim() || undefined;

  return {
    host,
    port,
    password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function createRedisClient(): Redis {
  const options = getRedisConnectionOptions();
  const client = new Redis(options);
  client.on('error', (err) => {
    // Prevent unhandled Redis error crashes
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Redis] Connection notice: ${err?.message || err}`);
    }
  });
  return client;
}
