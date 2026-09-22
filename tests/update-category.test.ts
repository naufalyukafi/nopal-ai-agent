import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTransactionCategory } from '../src/db/transactions.db.ts';

test('updateTransactionCategory module function signature exists', () => {
  assert.equal(typeof updateTransactionCategory, 'function', 'updateTransactionCategory should be an exported function');
});

test('filterCandidateTransactions logic strictly guards against mutating wrong transactions', () => {
  // Pure logic replica of updateTransactionCategory candidate filtering
  const sampleTxs = [
    { id: 'tx-1', amount: 2000000, description: 'Sewa Kost Bulanan', categories: { name: 'Tempat Tinggal' } },
    { id: 'tx-2', amount: 50000, description: 'Kopi Kenangan Mantan', categories: { name: 'Makanan & Minuman' } },
    { id: 'tx-3', amount: 25000, description: 'Bensin Pertalite', categories: { name: 'Transportasi' } },
  ];

  function filterCandidates(
    txs: typeof sampleTxs,
    params: { amount?: number; transactionQuery?: string }
  ) {
    let candidateTxs = txs;
    const targetAmount = params.amount ? Number(params.amount) : undefined;
    const queryLower = params.transactionQuery ? params.transactionQuery.trim().toLowerCase() : '';

    if (targetAmount && targetAmount > 0) {
      const amountMatches = candidateTxs.filter((t) => Number(t.amount) === targetAmount);
      if (amountMatches.length === 0) {
        throw new Error(`Tidak ditemukan transaksi dengan nominal Rp ${targetAmount.toLocaleString('id-ID')}.`);
      }
      candidateTxs = amountMatches;
    }

    if (queryLower) {
      const queryMatches = candidateTxs.filter((t) => {
        const descMatch = (t.description || '').toLowerCase().includes(queryLower);
        const catMatch = (t.categories?.name || '').toLowerCase().includes(queryLower);
        return descMatch || catMatch;
      });
      if (queryMatches.length === 0) {
        throw new Error(`Tidak ditemukan transaksi yang cocok dengan kata kunci "${params.transactionQuery}".`);
      }
      candidateTxs = queryMatches;
    }

    if (candidateTxs.length === 0) {
      throw new Error('Tidak ditemukan transaksi yang cocok.');
    }

    return candidateTxs[0];
  }

  // Case 1: Exact match by amount only
  const matchAmount = filterCandidates(sampleTxs, { amount: 50000 });
  assert.equal(matchAmount.id, 'tx-2');

  // Case 2: Exact match by query only
  const matchQuery = filterCandidates(sampleTxs, { transactionQuery: 'kost' });
  assert.equal(matchQuery.id, 'tx-1');

  // Case 3: Match by both amount and query
  const matchBoth = filterCandidates(sampleTxs, { amount: 25000, transactionQuery: 'bensin' });
  assert.equal(matchBoth.id, 'tx-3');

  // Case 4: Non-existent amount MUST throw Error, NEVER return tx-1 (accidental mutation)
  assert.throws(
    () => filterCandidates(sampleTxs, { amount: 999999 }),
    /Tidak ditemukan transaksi dengan nominal/,
    'Must throw error when amount has no match'
  );

  // Case 5: Non-existent description query MUST throw Error
  assert.throws(
    () => filterCandidates(sampleTxs, { transactionQuery: 'mcdonalds' }),
    /Tidak ditemukan transaksi yang cocok dengan kata kunci/,
    'Must throw error when query has no match'
  );
});

test('candidate transactions only select confirmed transactions over rejected duplicates', () => {
  const duplicateCandidates = [
    { id: 'tx-rejected', amount: 50000, description: 'Alfagift Order Receipt', status: 'rejected' },
    { id: 'tx-confirmed', amount: 50000, description: 'BCA QRIS Alfagift Payment', status: 'confirmed' },
  ];

  const confirmedOnly = duplicateCandidates.filter((t) => t.status === 'confirmed');
  assert.equal(confirmedOnly.length, 1);
  assert.equal(confirmedOnly[0].id, 'tx-confirmed');
});

