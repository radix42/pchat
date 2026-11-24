import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeArgs } from '../src/nodeargs.js';

const chain = { name: 'pool_0001', flags: ['-ac_supply=1000000', '-ac_blocktime=10'], peers: ['203.0.113.10:19002', '203.0.113.10:19003'] };
const base = { chain, pubkey: '02' + 'ab'.repeat(32), dataDir: 'C:\\pchat\\chains\\pool_0001', rpc: { user: 'pchat', pass: 'pw', port: 4001 }, p2pPort: 4002 };

test('node stays off mainnet and mines to the user key', () => {
  const a = nodeArgs({ ...base, mine: true, threads: 2 });
  for (const want of ['-ac_name=pool_0001', '-ac_supply=1000000', '-ac_blocktime=10', `-pubkey=${base.pubkey}`, '-gen', '-genproclimit=2',
    '-dnsseed=0', '-upnp=0', '-listen=0', '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1',
    '-connect=203.0.113.10:19002', '-connect=203.0.113.10:19003', `-datadir=${base.dataDir}`]) assert.ok(a.includes(want), want);
  assert.ok(!a.some((x) => x.startsWith('-addnode')));
});

test('mining flags are left out when mining is off, and threads are clamped', () => {
  assert.ok(!nodeArgs({ ...base, mine: false }).includes('-gen'));
  assert.ok(nodeArgs({ ...base, mine: true, threads: 99 }).includes('-genproclimit=8'));
  assert.ok(nodeArgs({ ...base, mine: true, threads: 0 }).includes('-genproclimit=1'));
});
