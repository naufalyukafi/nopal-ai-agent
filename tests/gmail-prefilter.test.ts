import test from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyFinancialEmail } from '../src/services/gmail-parser.ts';

test('isLikelyFinancialEmail passes Bank Jago email with 20KB HTML body to Gemini', () => {
  const subject = 'Kamu telah membayar ke Resto Geprekin Jl Pemuda💸';
  const snippet = "Jago Assalamu'alaikum NAUFAL YUKAFI RIDLO, Terima kasih sudah bertransaksi dengan Jago!";
  const htmlBody = `<!DOCTYPE html><html><head><style>body{color:#fff;}.btn{display:block;}</style></head><body><div>Ringkasan transaksi Ke Resto Geprekin Rp 28.000</div></body></html>`;

  assert.equal(isLikelyFinancialEmail(subject, snippet, htmlBody), true, 'Bank Jago email with HTML body must pass pre-filter');
});

test('isLikelyFinancialEmail passes merchant & bank payment notifications', () => {
  assert.equal(
    isLikelyFinancialEmail(
      'ALFAGIFT TANGERANG BCA Pembayaran QRIS',
      'Pembayaran Ke ALFAGIFT Total Bayar IDR 50,000.00',
      'Mohon simpan email ini'
    ),
    true,
    'BCA QRIS payment must pass'
  );
});

test('isLikelyFinancialEmail filters out non-financial noise (job alerts & OTPs) to save LLM tokens', () => {
  assert.equal(
    isLikelyFinancialEmail(
      'Backend Developer - Peringatan Pekerjaan dari Jobstreet.com',
      'Lihat rekomendasi pekerjaan baru sesuai profil Anda',
      'Klik untuk melamar lowongan kerja terbaru'
    ),
    false,
    'Job alerts must be filtered out without calling LLM'
  );

  assert.equal(
    isLikelyFinancialEmail(
      'Kode Verifikasi Akun (OTP) Anda',
      'Jangan berikan kode ini kepada siapapun',
      'Kode OTP Anda adalah 839201'
    ),
    false,
    'OTP emails must be filtered out without calling LLM'
  );
});

test('isLikelyFinancialEmail handles empty or whitespace-only content gracefully', () => {
  assert.equal(isLikelyFinancialEmail('', '', ''), false, 'Empty content must return false');
  assert.equal(isLikelyFinancialEmail('   ', '', '  '), false, 'Whitespace content must return false');
});


