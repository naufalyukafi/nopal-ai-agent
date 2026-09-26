import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtmlToPlainText, isLikelyFinancialEmail } from '../src/services/gmail-parser.ts';

test('stripHtmlToPlainText preserves table line breaks and labels for Bank Jago transfer', () => {
  const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <table>
        <tr><td>Ringkasan transaksi</td></tr>
        <tr><td>Dari</td><td>509819889839</td></tr>
        <tr><td>Ke</td><td>Resto Geprekin Jl Pemuda</td></tr>
        <tr><td>Jumlah</td><td>Rp 28.000</td></tr>
      </table>
    </body>
    </html>
  `;

  const plain = stripHtmlToPlainText(html);
  assert.match(plain, /Ringkasan transaksi/);
  assert.match(plain, /Resto Geprekin Jl Pemuda/);
  assert.match(plain, /Rp 28\.000/);
  assert.ok(plain.includes('\n'), 'HTML block tags must produce distinct line breaks');
});

test('stripHtmlToPlainText preserves Subtotal vs Total Pembayaran line breaks for Alfagift receipts', () => {
  const html = `
    <div>Alfagift produk Aqua Air Mineral dan lainnya</div>
    <div>Subtotal Produk: Rp 47.700</div>
    <div>Voucher Diskon: -Rp 6.300</div>
    <div>Total Pembayaran: Rp 41.400</div>
  `;

  const plain = stripHtmlToPlainText(html);
  assert.match(plain, /Subtotal Produk: Rp 47\.700/);
  assert.match(plain, /Total Pembayaran: Rp 41\.400/);
  assert.ok(plain.indexOf('Subtotal') < plain.indexOf('Total Pembayaran'));
});

test('isLikelyFinancialEmail identifies Bank Jago transfer details and Alfagift receipts', () => {
  const jagoPass = isLikelyFinancialEmail(
    'Ringkasan transaksi',
    'Dari 509819889839 Ke Resto Geprekin Jl Pemuda',
    'Jumlah Rp 28.000'
  );
  assert.equal(jagoPass, true, 'Bank transfer email must pass pre-filter');

  const alfagiftPass = isLikelyFinancialEmail(
    'Transaksi Terkonfirmasi',
    'Alfagift produk Aqua Air Mineral dan lainnya dengan total pembayaran Rp 41.400',
    'Nominal: Rp 41.400'
  );
  assert.equal(alfagiftPass, true, 'Alfagift receipt must pass pre-filter');
});
