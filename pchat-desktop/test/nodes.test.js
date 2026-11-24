import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeManager } from '../src/nodes.js';

const room = { id: 'a1b2c3d4e5f6', chain: { name: 'pool_0001', flags: ['-ac_supply=1000'], peers: ['127.0.0.1:19002'] } };
const opts = { pubkey: '02' + 'ab'.repeat(32), mine: true, threads: 1 };

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pchat-nodes-'));
  const spawned = [];
  let n = 4000;
  const script = { getinfo: null, getmininginfo: { generate: true }, stop: 'stopping' };
  const calls = [];
  const mgr = new NodeManager({
    komodod: process.execPath, dataRoot: dir, platform: 'linux', port: async () => ++n,
    spawn: (cmd, args, o) => { const p = new EventEmitter(); p.pid = 9000 + spawned.length; spawned.push({ cmd, args, o, p }); return p; },
    rpc: async (port, pass, method) => {
      calls.push(method);
      const r = script[method];
      if (r instanceof Error) throw r;
      if (method === 'stop') setTimeout(() => spawned[0].p.emit('exit', 0), 5);
      return typeof r === 'function' ? r() : r;
    },
  });
  return { mgr, spawned, script, calls, dir };
}

test('start launches komodod with the room flags and a private RPC login', async () => {
  const { mgr, spawned } = setup();
  await mgr.start(room, opts);
  const { args, o } = spawned[0];
  assert.ok(args.includes('-ac_name=pool_0001') && args.includes('-gen') && args.includes('-connect=127.0.0.1:19002'));
  assert.ok(args.some((a) => /^-rpcpassword=[a-f0-9]{36}$/.test(a)));
  assert.equal(o.windowsHide, true);
  await mgr.start(room, opts);
  assert.equal(spawned.length, 1, 'a running node is not started twice');
});

test('status follows the node from starting to ready', async () => {
  const { mgr, script } = setup();
  await mgr.start(room, opts);
  script.getinfo = new Error('Loading block index...');
  await mgr.poll();
  assert.equal(mgr.status('pool_0001').state, 'starting');
  script.getinfo = { blocks: 3, longestchain: 3, connections: 0 };
  await mgr.poll();
  assert.equal(mgr.status('pool_0001').state, 'connecting');
  script.getinfo = { blocks: 5, longestchain: 100, connections: 2 };
  await mgr.poll();
  assert.equal(mgr.status('pool_0001').state, 'syncing');
  script.getinfo = { blocks: 100, longestchain: 100, connections: 2 };
  await mgr.poll();
  assert.deepEqual(mgr.status('pool_0001'), { state: 'ready', error: null, blocks: 100, longest: 100, connections: 2, mining: true });
  script.getinfo = new Error('timeout');
  await mgr.poll();
  assert.equal(mgr.status('pool_0001').state, 'unreachable');
});

test('start explains a missing komodod.exe', async () => {
  const { mgr } = setup();
  mgr.setKomodod('C:\\nope\\komodod.exe');
  await assert.rejects(() => mgr.start(room, opts), (e) => e.code === 'NO_KOMODOD');
});

test('stop asks the node to quit and waits for it to exit', async () => {
  const { mgr, calls } = setup();
  await mgr.start(room, opts);
  await mgr.stop('pool_0001');
  assert.ok(calls.includes('stop'));
  assert.equal(mgr.status('pool_0001').state, 'stopped');
});

test('a node that ignores stop is killed', async () => {
  const { mgr, script } = setup();
  const killed = [];
  mgr.kill = async (pid) => { killed.push(pid); };
  script.stop = new Error('refused');
  await mgr.start(room, opts);
  await mgr.stop('pool_0001', { wait: 150 });
  assert.deepEqual(killed, [9000]);
});

test('setMining sends setgenerate to the right node', async () => {
  const { mgr, calls } = setup();
  await mgr.start(room, opts);
  await mgr.setMining('pool_0001', false);
  assert.ok(calls.includes('setgenerate'));
});
