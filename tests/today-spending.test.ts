import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayTransactionsSummary } from '../src/db/transactions.db.ts';

test('getTodayTransactionsSummary module function signature exists', () => {
  assert.equal(typeof getTodayTransactionsSummary, 'function', 'getTodayTransactionsSummary should be an exported function');
});
