import test from 'node:test';
import assert from 'node:assert/strict';

function extractEmailTransactionDate(msgData: { internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } }): string | undefined {
  let emailTxDate: string | undefined = undefined;
  if (msgData.internalDate) {
    const epochMs = Number(msgData.internalDate);
    if (!isNaN(epochMs) && epochMs > 0) {
      emailTxDate = new Date(epochMs).toISOString();
    }
  }
  if (!emailTxDate) {
    const headers = msgData.payload?.headers || [];
    const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date');
    if (dateHeader?.value) {
      const parsedHeaderDate = new Date(dateHeader.value);
      if (!isNaN(parsedHeaderDate.getTime())) {
        emailTxDate = parsedHeaderDate.toISOString();
      }
    }
  }
  return emailTxDate;
}

test('extractEmailTransactionDate extracts ISO string from internalDate epoch string', () => {
  // Epoch for 2026-09-22T03:15:00.000Z
  const epochMs = '1790046900000';
  const result = extractEmailTransactionDate({ internalDate: epochMs });
  assert.equal(result, '2026-09-22T03:15:00.000Z');
});

test('extractEmailTransactionDate falls back to RFC 2822 Date header if internalDate is missing', () => {
  const result = extractEmailTransactionDate({
    payload: {
      headers: [
        { name: 'Subject', value: 'Receipt HC Bravo' },
        { name: 'Date', value: 'Wed, 23 Sep 2026 10:30:00 +0700' },
      ],
    },
  });
  // 10:30:00 +0700 = 03:30:00 UTC
  assert.equal(result, '2026-09-23T03:30:00.000Z');
});

test('extractEmailTransactionDate returns undefined when neither internalDate nor Date header exists', () => {
  const result = extractEmailTransactionDate({
    payload: {
      headers: [{ name: 'Subject', value: 'No date receipt' }],
    },
  });
  assert.equal(result, undefined);
});
