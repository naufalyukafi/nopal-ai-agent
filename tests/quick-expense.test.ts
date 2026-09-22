import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickExpenseInput, inferCategoryFromDescription } from '../src/utils/quick-expense.ts';

test('parseQuickExpenseInput parses various Indonesian shorthand amounts', () => {
  // 25k format
  const r1 = parseQuickExpenseInput('kopi 25k');
  assert.ok(r1);
  assert.equal(r1.amount, 25000);
  assert.equal(r1.description, 'Kopi');
  assert.equal(r1.categoryName, 'Makanan & Minuman');

  // 30rb format
  const r2 = parseQuickExpenseInput('bensin 30rb');
  assert.ok(r2);
  assert.equal(r2.amount, 30000);
  assert.equal(r2.description, 'Bensin');
  assert.equal(r2.categoryName, 'Transportasi');

  // Plain number format
  const r3 = parseQuickExpenseInput('parkir 5000');
  assert.ok(r3);
  assert.equal(r3.amount, 5000);
  assert.equal(r3.description, 'Parkir');
  assert.equal(r3.categoryName, 'Transportasi');

  // Decimal with k (18.5k)
  const r4 = parseQuickExpenseInput('makan siang 18.5k');
  assert.ok(r4);
  assert.equal(r4.amount, 18500);
  assert.equal(r4.description, 'Makan siang');
  assert.equal(r4.categoryName, 'Makanan & Minuman');

  // Decimal with comma (18,5k)
  const r5 = parseQuickExpenseInput('nasi uduk 18,5k');
  assert.ok(r5);
  assert.equal(r5.amount, 18500);
  assert.equal(r5.description, 'Nasi uduk');

  // Thousands separator dot (35.000)
  const r6 = parseQuickExpenseInput('martabak manis 35.000');
  assert.ok(r6);
  assert.equal(r6.amount, 35000);
  assert.equal(r6.description, 'Martabak manis');

  // Ribu full word
  const r7 = parseQuickExpenseInput('pulsa 50 ribu');
  assert.ok(r7);
  assert.equal(r7.amount, 50000);
  assert.equal(r7.description, 'Pulsa');
  assert.equal(r7.categoryName, 'Tagihan & Utilitas');
});

test('parseQuickExpenseInput accurately infers categories', () => {
  assert.equal(inferCategoryFromDescription('kopi kenangan'), 'Makanan & Minuman');
  assert.equal(inferCategoryFromDescription('pertalite'), 'Transportasi');
  assert.equal(inferCategoryFromDescription('tiket kereta'), 'Transportasi');
  assert.equal(inferCategoryFromDescription('tagihan pln'), 'Tagihan & Utilitas');
  assert.equal(inferCategoryFromDescription('obat pusing panadol'), 'Kesehatan');
  assert.equal(inferCategoryFromDescription('tiket bioskop XXI'), 'Hiburan & Rekreasi');
  assert.equal(inferCategoryFromDescription('buku tulis sinarmas'), 'Pendidikan');
  assert.equal(inferCategoryFromDescription('baju kemeja putih'), 'Belanja');
});

test('parseQuickExpenseInput ignores conversational text and commands', () => {
  assert.equal(parseQuickExpenseInput('/start'), null);
  assert.equal(parseQuickExpenseInput('/help'), null);
  assert.equal(parseQuickExpenseInput('halo apa kabar'), null);
  assert.equal(parseQuickExpenseInput('gaji saya 7.6 juta tolong atur budget'), null);
  assert.equal(parseQuickExpenseInput('berapa pengeluaran saya hari ini?'), null);
  assert.equal(parseQuickExpenseInput('tolong ubah kategori transaksi bravo jadi utilitas'), null);
  assert.equal(parseQuickExpenseInput('gajianku tanggal 25'), null);
  assert.equal(parseQuickExpenseInput('bagaimana cara berhemat bulan ini?'), null);
  assert.equal(parseQuickExpenseInput('cek budget'), null);
});
