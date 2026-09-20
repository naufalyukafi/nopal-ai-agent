import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { env } from '../config/env.ts';

// Polyfill globalThis.Buffer for Deno / Supabase Edge Runtime environments
if (typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

const ALGORITHM = 'aes-256-gcm';

function getDerivedKey(): Buffer {
  const secret = env.ENCRYPTION_SECRET || 'nopal-financial-default-secret-key-32bytes';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plain text using AES-256-GCM.
 * Returns formatted string: "enc:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 */
export function encryptText(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.startsWith('enc:')) return plaintext;

  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text encrypted using AES-256-GCM.
 * Handles backward compatibility gracefully if the string is legacy plaintext.
 */
export function decryptText(encryptedText: string): string {
  if (!encryptedText) return '';
  if (!encryptedText.startsWith('enc:')) {
    // Backward compatibility: return as-is if unencrypted legacy data
    return encryptedText;
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted token format');
  }

  const [, ivHex, tagHex, ciphertextHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
