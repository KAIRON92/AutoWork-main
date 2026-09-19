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

export function encryptProviderCredentials(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptProviderCredentials(value: string): string {
  if (!value.startsWith(`${VERSION}.`)) throw new Error('Stored provider credentials are not encrypted with the current credential format');
  const [, ivB64, tagB64, dataB64] = value.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted provider credential format');
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
