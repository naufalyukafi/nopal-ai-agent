import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTransactionCategory } from '../src/db/transactions.db.ts';

test('updateTransactionCategory module function signature exists', () => {
  assert.equal(typeof updateTransactionCategory, 'function', 'updateTransactionCategory should be an exported function');
});
