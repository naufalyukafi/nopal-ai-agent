import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDescription } from '../src/utils/sanitize.ts';

test('sanitizeDescription removes long zero padding and system ref noise', () => {
  const dirty = 'Alfagift / PT Sumber Alfaria Trijaya, Tbk000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 5 Alfagift';
  const cleaned = sanitizeDescription(dirty);

  assert.ok(!cleaned.includes('000000000000'), 'Should remove 12+ zero padding');
  assert.ok(cleaned.length <= 65, 'Should limit length to <= 65 characters');
  assert.ok(cleaned.includes('Alfagift'), 'Should retain key merchant name');
});

test('sanitizeDescription handles bank notification boilerplate cleanly', () => {
  const dirty = 'BCA QRIS Alfagift silakan klik bantuan Cekdetil riwayattransaksi PTBankJago OtoritasJasaKeuangan OJK';
  const cleaned = sanitizeDescription(dirty);

  assert.equal(cleaned, 'BCA QRIS Alfagift');
});

test('sanitizeDescription falls back gracefully for empty or undefined input', () => {
  assert.equal(sanitizeDescription(undefined), 'Pengeluaran');
  assert.equal(sanitizeDescription(''), 'Pengeluaran');
});
