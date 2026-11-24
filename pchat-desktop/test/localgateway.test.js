import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalGateway } from '../src/localgateway.js';

const room = { id: 'a1b2c3d4e5f6', name: 'General', type: 'public', gateway: 'http://gw:8080', chain: { name: 'pool_0001' } };

function make(rpcs = {}, remote = {}) {
  const calls = [];
  const nodes = { call: async (name, method, params) => { calls.push([name, method]); if (!(method in rpcs)) throw new Error('no ' + method); return typeof rpcs[method] === 'function' ? rpcs[method](params) : rpcs[method]; } };
  const lg = new LocalGateway({
    getRoom: (id) => (id === room.id ? room : undefined), nodes,
    scanner: () => ({ update: async () => true, messages: (from) => [{ txid: 't', height: from }] }),
    remote: (base) => ({ faucet: async (id, a) => ({ base, id, a }), invite: async (id) => ({ base, id }), ...remote }),
  });
  return { lg, calls };
}

test('unspent outputs skip immature mined coins', async () => {
  const { lg } = make({
    getaddressutxos: [{ txid: 'old', outputIndex: 0, satoshis: 5000, height: 50 }, { txid: 'minted', outputIndex: 0, satoshis: 7000, height: 195 }, { txid: 'recent', outputIndex: 1, satoshis: 9000, height: 199 }],
    getblockcount: 200,
    getrawtransaction: (p) => (p[0] === 'minted' ? { vin: [{ coinbase: '03' }] } : { vin: [{ txid: 'x' }] }),
  });
  assert.deepEqual((await lg.utxos(room.id, 'R1')).map((u) => u.txid), ['old', 'recent']);
});

test('chain reads and writes go to the local node, not a gateway', async () => {
  const { lg, calls } = make({ sendrawtransaction: 'txid1' });
  assert.equal(await lg.broadcast(room.id, 'deadbeef'), 'txid1');
  assert.deepEqual(await lg.messages(room.id, 7), [{ txid: 't', height: 7 }]);
  assert.deepEqual(calls, [['pool_0001', 'sendrawtransaction']]);
});

test('faucet and invites use the gateway the room came from', async () => {
  const { lg } = make();
  assert.deepEqual(await lg.faucet(room.id, 'R1'), { base: 'http://gw:8080', id: room.id, a: 'R1' });
  assert.equal(lg.baseFor(room.id), 'http://gw:8080');
  await assert.rejects(() => lg.invite('ffffffffffff'), /not joined/);
});
