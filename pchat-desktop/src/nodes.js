import { spawn as nodeSpawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { rpcCall } from './rpc.js';
import { nodeArgs } from './nodeargs.js';

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.unref();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs one komodod per joined room and reports how each is doing.
export class NodeManager {
  constructor({ komodod = '', dataRoot, spawn = nodeSpawn, rpc = rpcCall, port = freePort, exec = execFile, platform = process.platform }) {
    this.komodod = komodod;
    this.dataRoot = dataRoot;
    this.spawn = spawn;
    this.rpc = rpc;
    this.port = port;
    this.exec = exec;
    this.platform = platform;
    this.nodes = new Map();
    this.pidFile = path.join(dataRoot, 'nodes.json');
    fs.mkdirSync(dataRoot, { recursive: true });
  }

  setKomodod(p) { this.komodod = p || ''; }

  async start(room, { pubkey, mine, threads }) {
    const name = room.chain.name;
    const existing = this.nodes.get(name);
    if (existing && !existing.exited) return;
    if (!this.komodod || !fs.existsSync(this.komodod)) {
      throw Object.assign(new Error('Set the path to komodod.exe in Settings.'), { code: 'NO_KOMODOD' });
    }
    const dataDir = path.join(this.dataRoot, name);
    fs.mkdirSync(dataDir, { recursive: true });
    const rpcPort = await this.port();
    const p2pPort = await this.port();
    const pass = crypto.randomBytes(18).toString('hex');
    const args = nodeArgs({ chain: room.chain, pubkey, dataDir, rpc: { user: 'pchat', pass, port: rpcPort }, p2pPort, mine, threads });
    const proc = this.spawn(this.komodod, args, { cwd: path.dirname(this.komodod), windowsHide: true, stdio: 'ignore' });
    const n = { name, proc, rpcPort, pass, p2pPort, state: 'starting', info: null, up: false, exited: false, mine: !!mine, error: null };
    proc.on('exit', (code) => { n.exited = true; n.state = 'stopped'; n.exitCode = code; this.savePids(); });
    proc.on('error', (e) => { n.exited = true; n.state = 'error'; n.error = e.message; this.savePids(); });
    this.nodes.set(name, n);
    this.savePids();
  }

  async poll() {
    await Promise.all([...this.nodes.values()].map((n) => this.refresh(n)));
  }

  async refresh(n) {
    if (n.exited) return;
    try {
      const info = await this.rpc(n.rpcPort, n.pass, 'getinfo');
      const mi = await this.rpc(n.rpcPort, n.pass, 'getmininginfo').catch(() => ({}));
      n.up = true;
      n.info = { blocks: info.blocks, longest: info.longestchain || 0, connections: info.connections, mining: !!mi.generate };
      n.state = info.connections === 0 ? 'connecting'
        : n.info.longest && n.info.blocks < n.info.longest - 1 ? 'syncing' : 'ready';
    } catch {
      n.state = n.up ? 'unreachable' : 'starting'; // RPC answers errors while the block index loads
    }
  }

  status(name) {
    const n = this.nodes.get(name);
    if (!n) return { state: 'stopped' };
    return { state: n.state, error: n.error, ...(n.info || {}) };
  }

  call(name, method, params = []) {
    const n = this.nodes.get(name);
    if (!n || n.exited) return Promise.reject(new Error('This room\'s node is not running.'));
    return this.rpc(n.rpcPort, n.pass, method, params);
  }

  async setMining(name, on, threads = 1) {
    await this.call(name, 'setgenerate', [!!on, Math.max(1, Math.min(Math.floor(+threads) || 1, 8))]);
    const n = this.nodes.get(name);
    if (n) n.mine = !!on;
  }

  async stop(name, { wait = 20000 } = {}) {
    const n = this.nodes.get(name);
    if (!n) return;
    if (!n.exited) {
      await this.rpc(n.rpcPort, n.pass, 'stop').catch(() => {});
      const until = Date.now() + wait;
      while (!n.exited && Date.now() < until) await sleep(100);
      if (!n.exited) await this.kill(n.proc.pid);
    }
    this.nodes.delete(name);
    this.savePids();
  }

  async stopAll(opts) {
    await Promise.all([...this.nodes.keys()].map((k) => this.stop(k, opts)));
  }

  kill(pid) {
    return new Promise((resolve) => {
      if (!pid) return resolve();
      if (this.platform === 'win32') this.exec('taskkill', ['/pid', String(pid), '/t', '/f'], () => resolve());
      else { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } resolve(); }
    });
  }

  savePids() {
    const pids = {};
    for (const [k, n] of this.nodes) if (!n.exited && n.proc?.pid) pids[k] = n.proc.pid;
    try { fs.writeFileSync(this.pidFile, JSON.stringify(pids)); } catch { /* best effort */ }
  }

  isKomodod(pid) {
    return new Promise((resolve) => {
      if (this.platform === 'win32') {
        this.exec('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], (e, out) => resolve(!e && /komodod/i.test(String(out))));
      } else {
        try { resolve(/komodod/.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'))); } catch { resolve(false); }
      }
    });
  }

  // After a crash the old komodod keeps running and holds the chain's data folder. Stop any left over.
  async reapStale() {
    let pids = {};
    try { pids = JSON.parse(fs.readFileSync(this.pidFile, 'utf8')); } catch { return 0; }
    let killed = 0;
    for (const pid of Object.values(pids)) {
      if (await this.isKomodod(pid)) { await this.kill(pid); killed++; }
    }
    try { fs.writeFileSync(this.pidFile, '{}'); } catch { /* ignore */ }
    return killed;
  }
}
