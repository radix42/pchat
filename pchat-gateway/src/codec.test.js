import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, split, assemble, MAX_PAYLOAD } from './codec.js';

test('round trip', () => {
  const env = { v: 1, type: 'text', flags: 0, ts: 1, ref: null, body: 'hi' };
  assert.deepEqual(decode(encode(env)), env);
});

test('long messages chunk and reassemble', () => {
  const body = 'x'.repeat(MAX_PAYLOAD * 3);
  const env = { v: 1, type: 'text', flags: 0, ts: 1, ref: null, body };
  const parts = split(env, 'g1');
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= MAX_PAYLOAD));
  const items = parts.map((p, i) => ({ txid: 't' + i, senderPubkey: 'k', env: decode(p) }));
  const [msg] = assemble(items);
  assert.equal(msg.env.body, body);
  assert.equal(msg.txid, 't0');
});
