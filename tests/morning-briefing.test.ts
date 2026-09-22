import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMorningBriefingMessage } from '../src/services/morning-briefing.ts';

test('morning briefing module exports expected functions', () => {
  assert.equal(typeof formatMorningBriefingMessage, 'function');
});
