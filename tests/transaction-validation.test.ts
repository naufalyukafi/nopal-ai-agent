import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualTransaction } from '../src/db/transactions.db.ts';

test('createManualTransaction rejects non-positive, zero, or NaN amounts', async () => {
  await assert.rejects(
    () => createManualTransaction({ userId: 'u1', amount: 0, description: 'free' }),
    { message: /Nominal transaksi harus berupa angka positif yang valid/ }
  );

  await assert.rejects(
    () => createManualTransaction({ userId: 'u1', amount: -50000, description: 'neg' }),
    { message: /Nominal transaksi harus berupa angka positif yang valid/ }
  );

  await assert.rejects(
    () => createManualTransaction({ userId: 'u1', amount: NaN, description: 'nan' }),
    { message: /Nominal transaksi harus berupa angka positif yang valid/ }
  );
});
