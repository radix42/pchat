import http from 'node:http';
import { WebSocketServer } from 'ws';
import { cfg } from './config.js';
import { load } from './store.js';
import * as pool from './pool.js';
import * as rooms from './rooms.js';
import * as chain from './chain.js';
import { assemble } from './codec.js';

load();
await pool.boot();

const json = (res, code, obj) => {
  res.writeHead(code, {
    'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(obj));
};

const readBody = (req) => new Promise((ok, no) => {
  let d = '';
  req.on('data', (c) => { d += c; if (d.length > 1e6) { req.destroy(); no(new Error('Body too large')); } });
  req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { no(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
});

const room = (id) => {
  const r = rooms.find(id);
  if (!r) throw Object.assign(new Error('Room not found'), { status: 404 });
  return r;
};

const routes = [
  ['GET', /^\/health$/, async () => ({ ok: true, free: pool.freeCount() })],
  ['GET', /^\/directory$/, async () => rooms.directory()],
  ['POST', /^\/rooms$/, async (m, b) => rooms.create(b)],
  ['GET', /^\/rooms\/(\w+)$/, async (m) => rooms.info(m[1])],
  ['POST', /^\/rooms\/(\w+)\/faucet$/, async (m, b) => rooms.faucet(m[1], b.address)],
  ['POST', /^\/rooms\/(\w+)\/invites$/, async (m) => rooms.invite(m[1])],
  ['POST', /^\/invites\/redeem$/, async (m, b) => rooms.redeem(b.token, b.address)],
  ['GET', /^\/rooms\/(\w+)\/utxos$/, async (m, b, u) => chain.utxos(rooms.chainOf(room(m[1])), u.searchParams.get('address'))],
  ['POST', /^\/rooms\/(\w+)\/tx$/, async (m, b) => ({ txid: await chain.broadcast(rooms.chainOf(room(m[1])), b.hex) })],
  ['GET', /^\/rooms\/(\w+)\/messages$/, async (m, b, u) => {
    const c = rooms.chainOf(room(m[1]));
    const from = Math.max(1, +u.searchParams.get('from') || 1);
    return assemble(await chain.scan(c, from, await chain.tip(c)));
  }],
];

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x');
  for (const [method, re, fn] of routes) {
    const m = method === req.method && re.exec(url.pathname);
    if (!m) continue;
    try { return json(res, 200, await fn(m, req.method === 'POST' ? await readBody(req) : {}, url)); }
    catch (e) { return json(res, e.status || 500, { error: e.message }); }
  }
  json(res, 404, { error: 'Not found' });
});

// Live stream: clients connect to /ws?room=<id> and receive new messages as blocks arrive.
const wss = new WebSocketServer({ noServer: true });
const watch = new Map(); // roomId -> { clients:Set, height, pending:Map }

server.on('upgrade', (req, sock, head) => {
  const id = new URL(req.url, 'http://x').searchParams.get('room');
  if (!id || !rooms.find(id)) return sock.destroy();
  wss.handleUpgrade(req, sock, head, (ws) => {
    const w = watch.get(id) || { clients: new Set(), height: null, pending: new Map() };
    watch.set(id, w);
    w.clients.add(ws);
    ws.on('close', () => w.clients.delete(ws));
  });
});

setInterval(async () => {
  for (const [id, w] of watch) {
    if (!w.clients.size) continue;
    try {
      const c = rooms.chainOf(rooms.find(id));
      const t = await chain.tip(c);
      if (w.height === null) w.height = t; // new subscribers get only future blocks; use /messages for history
      if (t <= w.height) continue;
      const msgs = assemble(await chain.scan(c, w.height + 1, t), w.pending);
      w.height = t;
      for (const m of msgs) for (const ws of w.clients) ws.send(JSON.stringify(m));
    } catch (e) { console.error('[watch]', id, e.message); }
  }
}, 2000);

server.listen(cfg.port, () => console.log(`pchat gateway on :${cfg.port}`));
