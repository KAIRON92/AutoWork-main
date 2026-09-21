export const DEFAULT_ENCRYPTION_KEY = '';
export const DEFAULT_FALLBACK_JWT = '';

function requireSecret(name: string, value: string | undefined, minLength = 32): string {
  const secret = value?.trim();
  if (!secret || secret.length < minLength) {
    throw new Error(`[Config] ${name} is required and must be at least ${minLength} characters. Set it in the environment before starting AutoWork.`);
  }
  return secret;
}

function validateAesKey(name: string, value: string | undefined): string {
  const raw = requireSecret(name, value);
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(`[Config] ${name} must be a valid base64-encoded 32-byte key.`);
  }
  if (decoded.length !== 32) {
    throw new Error(`[Config] ${name} must decode to exactly 32 bytes (AES-256-GCM).`);
  }
  return raw;
}

export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  requireSecret('JWT_SECRET', process.env.JWT_SECRET);
  requireSecret('REFRESH_TOKEN_SECRET', process.env.REFRESH_TOKEN_SECRET);
  validateAesKey('PCLOUD_CREDENTIAL_ENCRYPTION_KEY', process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY);

  // Email credentials use their own key when supplied; keep the pCloud key as a
  // compatibility fallback for existing locally encrypted records.
  if (process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY?.trim()) {
    validateAesKey('EMAIL_CREDENTIAL_ENCRYPTION_KEY', process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY);
  } else if (isProduction) {
    throw new Error('[Config] EMAIL_CREDENTIAL_ENCRYPTION_KEY is required in production.');
  }

  if (isProduction && !process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in production. Please provide PostgreSQL connection string.');
  }

  const allowMock = process.env.PCLOUD_ALLOW_MOCK === 'true';
  if (isProduction && allowMock) {
    console.warn('⚠️ [Config] Notice: PCLOUD_ALLOW_MOCK is enabled in production. Disable it unless sandbox tests explicitly require it.');
  }

  if (isProduction && !process.env.PCLOUD_CLIENT_ID?.trim()) {
    console.warn('⚠️ [Config] PCLOUD_CLIENT_ID is not configured; pCloud OAuth features will be unavailable.');
  }
}
