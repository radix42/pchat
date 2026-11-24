import test from 'node:test';
import assert from 'node:assert/strict';
import { Key } from '../src/keys.js';
import { seal, open, newRoomKey } from '../src/seal.js';
import { split, decode, MAX_PAYLOAD } from '../src/codec.js';
import { buildOpReturnTx } from '../src/tx.js';
import { PchatClient } from '../src/client.js';

test('recovery phrase restores the same key', () => {
  const k = Key.generate();
  assert.equal(Key.fromMnemonic(k.toMnemonic()).address, k.address);
  assert.match(k.address, /^R/);
});

test('private bodies round trip and reject tampering', () => {
  const key = newRoomKey();
  const env = seal(key, { v: 1, type: 'text', flags: 1, epoch: 1 }, 'hello');
  assert.equal(open(key, env), 'hello');
  assert.equal(open(key, { ...env, epoch: 2 }), null);
});

test('long messages split under the payload limit', () => {
  const env = { v: 1, type: 'text', flags: 0, ts: 1, ref: null, body: 'y'.repeat(MAX_PAYLOAD * 2) };
  const parts = split(env, 'g');
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= MAX_PAYLOAD && decode(p)));
});

test('transaction builder spends utxos and returns change', () => {
  const k = Key.generate();
  const t = buildOpReturnTx({
    priv: k.priv, payload: new TextEncoder().encode('hi'),
    utxos: [{ txid: 'aa'.repeat(32), outputIndex: 0, satoshis: 100000 }],
  });
  assert.equal(t.txid.length, 64);
  assert.equal(t.change.satoshis, 90000);
  assert.ok(t.hex.startsWith('040000' + '80'));
});

test('only the author can edit or hide', () => {
  const c = new PchatClient({ gateway: 'http://x', key: Key.generate() });
  const out = c.fold([
    { id: 'a', pubkey: 'p1', type: 'text', text: 'one' },
    { id: 'b', pubkey: 'p2', type: 'hide', ref: 'a' },
    { id: 'c', pubkey: 'p1', type: 'edit', ref: 'a', text: 'two' },
  ]);
  assert.equal(out[0].text, 'two');
  assert.equal(out[0].hidden, false);
});
