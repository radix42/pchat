import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGateway, validateChain, validateRoom, parseInvite } from '../src/validate.js';

test('gateway addresses are forced onto port 8080', () => {
  assert.equal(normalizeGateway('203.0.113.10'), 'http://203.0.113.10:8080');
  assert.equal(normalizeGateway('http://gw.example:8080/'), 'http://gw.example:8080');
  assert.equal(normalizeGateway('https://gw.example'), 'https://gw.example:8080');
  assert.throws(() => normalizeGateway('gw.example:9000'), /port 8080/);
  assert.throws(() => normalizeGateway(''), /Enter/);
});

const good = { name: 'pool_0001', flags: ['-ac_supply=1000000', '-ac_blocktime=10'], peers: ['203.0.113.10:19002', 'gw.example:19003'] };

test('chain details from a gateway are checked before use', () => {
  assert.deepEqual(validateChain(good), good);
  assert.throws(() => validateChain({ ...good, name: '../evil' }), /chain name/);
  assert.throws(() => validateChain({ ...good, flags: [...good.flags, '-datadir=C:\\x'] }), /Refused/);
  assert.throws(() => validateChain({ ...good, flags: [...good.flags, '-ac_name=other'] }), /Refused/);
  assert.throws(() => validateChain({ ...good, flags: ['-ac_blocktime=10'] }), /ac_supply/);
  assert.throws(() => validateChain({ ...good, peers: ['evil.example:99999'] }), /peer/);
  assert.throws(() => validateChain({ ...good, peers: ['x; calc:1'] }), /peer/);
  assert.throws(() => validateChain({ ...good, peers: [] }), /peers/);
});

test('room views need a real id and type', () => {
  const r = validateRoom({ id: 'a1b2c3d4e5f6', name: 'General', type: 'public', created: 5, chain: good });
  assert.equal(r.name, 'General');
  assert.throws(() => validateRoom({ id: '../x', name: 'x', type: 'public', chain: good }), /room id/);
  assert.throws(() => validateRoom({ id: 'a1b2c3d4e5f6', name: 'x', type: 'weird', chain: good }), /type/);
});

test('invite links are parsed strictly', () => {
  const token = 'a'.repeat(32), key = 'b'.repeat(64);
  const p = parseInvite(`pchat://join/${token}?g=${encodeURIComponent('http://gw.example:8080')}#${key}.2`);
  assert.deepEqual(p, { token, key, epoch: 2, gateway: 'http://gw.example:8080' });
  assert.throws(() => parseInvite('https://gw.example/x'), /not a pchat/);
  assert.throws(() => parseInvite(`pchat://join/short?g=gw.example#${key}.1`), /token/);
  assert.throws(() => parseInvite(`pchat://join/${token}?g=gw.example:9#${key}.1`), /port 8080/);
});
