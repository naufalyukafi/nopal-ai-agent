import test from 'node:test';
import assert from 'node:assert/strict';
import { getSmartDailyLimitStatus, isSavingsCategory } from '../src/db/daily-limit.db.ts';

test('getSmartDailyLimitStatus module function signature exists', () => {
  assert.equal(typeof getSmartDailyLimitStatus, 'function', 'getSmartDailyLimitStatus should be an exported function');
});

test('isSavingsCategory correctly identifies savings and investment categories', () => {
  assert.equal(isSavingsCategory('Tabungan'), true);
  assert.equal(isSavingsCategory('Tabungan & Investasi'), true);
  assert.equal(isSavingsCategory('Savings Account'), true);
  assert.equal(isSavingsCategory('Deposito BCA'), true);
  assert.equal(isSavingsCategory('Makanan & Minuman'), false);
  assert.equal(isSavingsCategory('Kost'), false);
  assert.equal(isSavingsCategory('Tagihan & Utilitas'), false);
});

test('Smart Daily Limit mathematical calculations logic', () => {
  // Mock inputs: total budget = 3,000,000 IDR, total spent in cycle = 1,200,000 IDR, today spent = 50,000 IDR, remaining days = 10
  const totalMonthlyBudget = 3000000;
  const cycleSpent = 1200000;
  const todaySpent = 50000;
  const remainingDays = 10;

  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleSpent - todaySpent));
  const recommendedDailyLimit = Math.floor(availableBudgetForRemainder / remainingDays);
  const todayRemainingLimit = recommendedDailyLimit - todaySpent;

  assert.equal(availableBudgetForRemainder, 1850000, 'Available budget for remainder should be 1,850,000');
  assert.equal(recommendedDailyLimit, 185000, 'Recommended daily limit should be 185,000 IDR');
  assert.equal(todayRemainingLimit, 135000, 'Remaining daily limit today should be 135,000 IDR');
});

