import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

const FALLBACK_KEY = 'X1LEAIg6nJyed26Ze3kI62oh0+M/cP3cSGJON0yzVnk=';

function getKey(): Buffer {
  const raw = process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY?.trim() || FALLBACK_KEY;
  try {
    const key = Buffer.from(raw, 'base64');
    if (key.length === 32) return key;
  } catch {}
  return Buffer.from(FALLBACK_KEY, 'base64');
}

export function encryptPCloudCredential(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptPCloudCredential(value: string): string {
  if (!value || typeof value !== 'string') return '';
  if (!value.startsWith(`${VERSION}.`)) {
    return value;
  }

  try {
    const [, ivB64, tagB64, dataB64] = value.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      return value;
    }

    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}
