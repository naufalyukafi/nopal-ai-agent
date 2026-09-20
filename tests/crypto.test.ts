import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptText, decryptText } from '../src/utils/crypto.ts';

test('encryptText & decryptText roundtrip', () => {
  const originalToken = '1//04_GMAIL_REFRESH_TOKEN_EXAMPLE_SECRET_123456';
  
  const encrypted = encryptText(originalToken);
  assert.ok(encrypted.startsWith('enc:'), 'Encrypted token should start with enc: prefix');
  assert.notEqual(encrypted, originalToken, 'Encrypted token must not equal original plain text');

  const decrypted = decryptText(encrypted);
  assert.equal(decrypted, originalToken, 'Decrypted token must match original plain text exactly');
});

test('decryptText backward compatibility for legacy plain text', () => {
  const legacyToken = 'legacy_unencrypted_refresh_token_string';
  const result = decryptText(legacyToken);
  assert.equal(result, legacyToken, 'Legacy unencrypted tokens should pass through unchanged');
});

test('encryptText idempotency for encrypted strings', () => {
  const token = 'my_secret_token';
  const encryptedOnce = encryptText(token);
  const encryptedTwice = encryptText(encryptedOnce);
  assert.equal(encryptedOnce, encryptedTwice, 'Encrypting an already encrypted token should return as is');
});
