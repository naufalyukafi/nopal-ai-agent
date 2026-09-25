import test from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyFinancialEmail } from '../src/services/gmail-parser.ts';

test('isLikelyFinancialEmail detects Indonesian bank & QRIS payment notifications', () => {
  const subject = 'ALFAGIFT TANGERANG IDAN/A1HJ2857 BCA Pembayaran QRIS';
  const snippet = 'Pembayaran Ke ALFAGIFT Lokasi Merchant TANGERANG, Sumber Dana TAHAPAN Total Bayar IDR 50,000.00';
  const body = 'Nomor Referensi 9527120260922183641630QRS1199973875 Mohon simpan email ini sebagai referensi transaksi Anda.';

  assert.equal(isLikelyFinancialEmail(subject, snippet, body), true, 'BCA QRIS payment must be detected as financial');
});

test('isLikelyFinancialEmail detects Bank Jago payment notifications', () => {
  const subject = "Kamu telah membayar ke PT INDOSAT Tbk💸 - Jago Assalamu'alaikum NAUFAL YUKAFI RIDLO";
  const snippet = "Terima kasih telah menggunakan Jago. Detail pembayaran sebesar Rp. 85.000 ke PT INDOSAT Tbk";
  const body = "Assalamu'alaikum NAUFAL YUKAFI RIDLO, Kamu telah membayar ke PT INDOSAT Tbk sebesar Rp. 85.000. Syarat & ketentuan promo berlaku.";

  assert.equal(isLikelyFinancialEmail(subject, snippet, body), true, 'Bank Jago payment to Indosat must be detected as financial');
});

test('isLikelyFinancialEmail detects merchant grocery and food orders', () => {
  const subject = 'Pesanan Online Alfagift O-260922-AGHHPZT Berhasil';
  const snippet = 'Terima kasih atas pesanan Anda di Alfagift dengan produk makanan dan minuman';
  const body = 'Total pembayaran: Rp 50.000 dengan metode QRIS BCA.';

  assert.equal(isLikelyFinancialEmail(subject, snippet, body), true, 'Alfagift order confirmation must be detected as financial');
});

test('isLikelyFinancialEmail detects utility bills and subscriptions', () => {
  const subject = 'Tagihan Listrik PLN Pascabayar Bulan September 2026';
  const snippet = 'Jumlah tagihan Anda adalah Rp 350.000 jatuh tempo tanggal 20.';
  const body = 'Rincian pemakaian listrik pascabayar.';

  assert.equal(isLikelyFinancialEmail(subject, snippet, body), true, 'PLN utility bill must be detected as financial');
});

test('isLikelyFinancialEmail filters out newsletters, promotions, and OTP emails', () => {
  // Case 1: Job alert
  assert.equal(
    isLikelyFinancialEmail(
      'Lowongan Kerja Software Engineer Terbaru di Jakarta',
      'Lihat rekomendasi pekerjaan baru sesuai profil LinkedIn Anda',
      'Klik tombol berikut untuk melamar lowongan kerja terbaru ini.'
    ),
    false,
    'Job alerts must be ignored without calling Gemini'
  );

  // Case 2: Marketing newsletter
  assert.equal(
    isLikelyFinancialEmail(
      'Newsletter Mingguan: Tips Menjaga Kesehatan di Musim Hujan',
      'Dapatkan tips hidup sehat dan panduan olahraga ringan setiap minggu',
      'Jika Anda tidak ingin menerima email ini lagi, silakan klik unsubscribe.'
    ),
    false,
    'Newsletters must be ignored without calling Gemini'
  );

  // Case 3: Security OTP / Password reset
  assert.equal(
    isLikelyFinancialEmail(
      'Kode Verifikasi Akun (OTP) Anda',
      'Jangan berikan kode ini kepada siapapun termasuk petugas',
      'Kode OTP Anda adalah 839201 untuk login ke akun.'
    ),
    false,
    'Login OTPs must be ignored without calling Gemini'
  );
});
