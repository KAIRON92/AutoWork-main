export const DEFAULT_ENCRYPTION_KEY = 'X1LEAIg6nJyed26Ze3kI62oh0+M/cP3cSGJON0yzVnk=';
export const DEFAULT_FALLBACK_JWT = 'supersecretjwtkeyforautoworkauditacceptance2026';

export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  let jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    process.env.JWT_SECRET = DEFAULT_FALLBACK_JWT;
    jwtSecret = DEFAULT_FALLBACK_JWT;
    console.warn('⚠️ [Config] Notice: JWT_SECRET was not provided or shorter than 32 chars. Fallback secret assigned.');
  }

  if (isProduction && !process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in production. Please provide PostgreSQL connection string.');
  }

  const allowMock = process.env.PCLOUD_ALLOW_MOCK === 'true';
  if (isProduction && allowMock) {
    console.warn('⚠️ [Config] Notice: PCLOUD_ALLOW_MOCK is enabled in production. Mock provider will be available for sandbox tests.');
  }

  const encryptionKey = process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY = DEFAULT_ENCRYPTION_KEY;
    console.warn('⚠️ [Config] Notice: PCLOUD_CREDENTIAL_ENCRYPTION_KEY was not set. Using default AES-256 fallback key.');
  } else {
    try {
      const decodedLength = Buffer.from(encryptionKey, 'base64').length;
      if (decodedLength !== 32) {
        console.warn('⚠️ [Config] Notice: Provided PCLOUD_CREDENTIAL_ENCRYPTION_KEY is not 32 bytes; using fallback key.');
        process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY = DEFAULT_ENCRYPTION_KEY;
      }
    } catch {
      console.warn('⚠️ [Config] Notice: PCLOUD_CREDENTIAL_ENCRYPTION_KEY is not valid base64; using fallback key.');
      process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY = DEFAULT_ENCRYPTION_KEY;
    }
  }
}
