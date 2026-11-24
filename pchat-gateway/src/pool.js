import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { rpc } from './rpc.js';
import { state, save } from './store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const freeCount = () => state.pool.filter((c) => c.status === 'free').length;
export const get = (name) => state.pool.find((c) => c.name === name);

// Every room chain runs on TWO mining nodes (a and b) that peer only with each other.
//   -ac_name        runs this standalone assetchain, never the Komodo mainnet chain
//   -connect        pins peers to the room's own other node, so there is no outbound peering at all
//   -dnsseed=0      no seed lookups; -upnp=0 no port mapping
//   -bind/-rpcbind  loopback by default, so nothing is exposed to the network
// Together these keep the nodes from contacting or downloading anything from Komodo mainnet.
function nodeArgs(c, n, peer) {
  const dir = path.resolve(cfg.dataDir, 'chains', c.name, n.role);
  fs.mkdirSync(dir, { recursive: true });
  return [
    `-ac_name=${c.name}`, `-ac_supply=${cfg.acSupply}`, `-ac_blocktime=${cfg.acBlocktime}`, `-pubkey=${cfg.faucetPubkey}`,
    '-gen', '-genproclimit=1',
    `-port=${n.p2pPort}`, `-bind=${cfg.bindHost}:${n.p2pPort}`, '-listen=1',
    `-connect=${cfg.bindHost}:${peer.p2pPort}`, '-dnsseed=0', '-upnp=0',
    '-server=1', '-txindex=1', '-addressindex=1', '-timestampindex=1', '-spentindex=1',
    `-rpcuser=${cfg.rpcUser}`, `-rpcpassword=${cfg.rpcPass}`, `-rpcport=${n.rpcPort}`,
    `-rpcbind=${cfg.bindHost}`, '-rpcallowip=127.0.0.1',
    `-datadir=${dir}`, ...cfg.extraFlags,
  ];
}

function launchNode(c, n) {
  const peer = c.nodes.find((x) => x !== n);
  const child = spawn(cfg.komodod, nodeArgs(c, n, peer), { detached: true, stdio: 'ignore' });
  child.unref();
  n.pid = child.pid;
  save();
}

async function alive(n) {
  try { await rpc(n.rpcPort, 'getblockcount'); return true; } catch { return false; }
}

// A node counts as ready when it is mining, connected to its peer, and past the premine maturity height.
async function nodeReady(n) {
  try {
    const [h, conns, mi] = await Promise.all([
      rpc(n.rpcPort, 'getblockcount'), rpc(n.rpcPort, 'getconnectioncount'), rpc(n.rpcPort, 'getmininginfo'),
    ]);
    return h >= cfg.readyHeight && conns >= 1 && mi.generate === true;
  } catch { return false; }
}

async function setup(n) {
  // rescan=true so the wallet sees the premine, which is mined at block 1 before the key is imported
  await rpc(n.rpcPort, 'importprivkey', [cfg.faucetWif, '', true]).catch((e) => console.error('[pool] import', e.message));
  await rpc(n.rpcPort, 'setgenerate', [true, 1]).catch(() => {});
}

async function prepare(c) {
  for (const n of c.nodes) while (!(await alive(n))) await sleep(2000);
  for (const n of c.nodes) await setup(n);
  while (!(await Promise.all(c.nodes.map(nodeReady))).every(Boolean)) await sleep(3000);
  c.status = 'free';
  save();
  console.log(`[pool] ${c.name} ready with ${c.nodes.length} mining nodes`);
}

function create() {
  state.seq++;
  const i = state.seq * 2;
  const nodes = [
    { role: 'a', rpcPort: cfg.rpcBase + i, p2pPort: cfg.p2pBase + i },
    { role: 'b', rpcPort: cfg.rpcBase + i + 1, p2pPort: cfg.p2pBase + i + 1 },
  ];
  const c = { name: 'pool_' + String(state.seq).padStart(4, '0'), nodes, rpcPort: nodes[0].rpcPort, status: 'launching' };
  state.pool.push(c);
  nodes.forEach((n) => launchNode(c, n));
  prepare(c).catch((e) => console.error('[pool]', c.name, e.message));
}

// Restarts any node that died, so every live room keeps both of its miners running.
async function watchdog() {
  for (const c of state.pool) {
    if (c.status !== 'free' && c.status !== 'assigned') continue;
    for (const n of c.nodes) {
      if (await alive(n)) continue;
      console.warn(`[pool] ${c.name}/${n.role} is down, restarting`);
      launchNode(c, n);
      sleep(15000).then(() => setup(n)); // give the daemon time to open its RPC port
    }
  }
}

export async function boot() {
  if (!cfg.faucetPubkey || !cfg.faucetWif) throw new Error('Set FAUCET_PUBKEY and FAUCET_WIF');
  for (const c of state.pool) {
    if (c.status === 'retired') continue;
    for (const n of c.nodes) if (!(await alive(n))) launchNode(c, n);
    if (c.status === 'launching') prepare(c).catch((e) => console.error('[pool]', c.name, e.message));
  }
  setInterval(() => {
    const warm = state.pool.filter((c) => c.status === 'free' || c.status === 'launching').length;
    if (warm < cfg.poolTarget) create();
  }, 5000);
  setInterval(() => watchdog().catch((e) => console.error('[watchdog]', e.message)), 10000);
}

// Chains are single-use: once assigned, a chain is never returned to the pool.
export function claim(roomId) {
  const c = state.pool.find((x) => x.status === 'free');
  if (!c) throw Object.assign(new Error('No free chain yet, retry shortly'), { status: 503 });
  c.status = 'assigned';
  c.roomId = roomId;
  save();
  return c;
}
