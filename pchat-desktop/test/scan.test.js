import test from 'node:test';
import assert from 'node:assert/strict';
import { ChainScanner } from '../src/scan.js';
import { split } from '../src/pchat/codec.js';
import { fakeChain, msgTx, text, PUB, PUB2 } from './helpers.js';

test('reads messages in chain order with sender and height', async () => {
  const blocks = [[{ txid: 'cb', vin: [{ coinbase: '01' }], vout: [] }], [msgTx('t1', text('one')), msgTx('t2', text('two'), PUB2)], []];
  const s = new ChainScanner(fakeChain(blocks));
  assert.equal(await s.update(), true);
  const m = s.messages();
  assert.deepEqual(m.map((x) => [x.txid, x.height, x.env.body, x.senderPubkey]), [['t1', 2, 'one', PUB], ['t2', 2, 'two', PUB2]]);
  assert.equal(await s.update(), false);
});

test('long messages are joined and take the first chunk txid', async () => {
  const env = text('y'.repeat(1500));
  const parts = split(env, 'g1');
  assert.ok(parts.length > 2);
  const blocks = [parts.map((p, i) => msgTx('c' + i, p)), [msgTx('other', text('hi'))]];
  const s = new ChainScanner(fakeChain(blocks));
  await s.update();
  const m = s.messages();
  assert.equal(m.length, 2);
  assert.equal(m[0].txid, 'c0');
  assert.equal(m[0].env.body, 'y'.repeat(1500));
});

test('chunks from different senders with the same group id stay separate', async () => {
  const a = split(text('a'.repeat(900)), 'g'), b = split(text('b'.repeat(900)), 'g');
  const blocks = [[...a.map((p, i) => msgTx('a' + i, p, PUB)), ...b.map((p, i) => msgTx('b' + i, p, PUB2))]];
  const s = new ChainScanner(fakeChain(blocks));
  await s.update();
  assert.deepEqual(s.messages().map((x) => x.env.body[0]).sort(), ['a', 'b']);
});

test('later updates read only new blocks plus a short re-check window, and follow a fork', async () => {
  const blocks = Array.from({ length: 20 }, (_, i) => [msgTx('t' + (i + 1), text('m' + (i + 1)))]);
  const calls = [];
  const s = new ChainScanner(fakeChain(blocks, calls));
  await s.update();
  assert.equal(s.messages().length, 20);
  calls.length = 0;
  blocks[19] = [msgTx('fork', text('replaced'))]; // the last block is replaced by a competing one
  blocks.push([msgTx('t21', text('m21'))]);
  assert.equal(await s.update(), true);
  const fetched = calls.filter((c) => c.startsWith('getblock:')).length;
  assert.ok(fetched <= 8, `re-read ${fetched} blocks`);
  const ids = s.messages().map((x) => x.txid);
  assert.ok(ids.includes('fork') && !ids.includes('t20') && ids.includes('t21'));
  assert.equal(ids.length, 21); // t1..t19, the replacement for t20, and t21
});

test('overlapping update calls do not duplicate messages', async () => {
  const s = new ChainScanner(fakeChain([[msgTx('t1', text('x'))], [msgTx('t2', text('y'))]]));
  await Promise.all([s.update(), s.update(), s.update()]);
  assert.equal(s.messages().length, 2);
});
