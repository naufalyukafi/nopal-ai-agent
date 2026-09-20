import test from 'node:test';
import assert from 'node:assert/strict';

test('financial cent math aggregation accuracy', () => {
  const transactions = [
    { amount: '10.01' },
    { amount: '20.02' },
    { amount: '30.03' },
  ];

  const categoryCentsMap: Record<string, number> = {};
  for (const item of transactions) {
    const amtCents = Math.round((Number(item.amount) || 0) * 100);
    categoryCentsMap['Food'] = (categoryCentsMap['Food'] || 0) + amtCents;
  }

  const totalAmount = Math.round(categoryCentsMap['Food']) / 100;
  assert.equal(totalAmount, 60.06, 'Sum of amounts must equal 60.06 without floating point precision drift');
});
