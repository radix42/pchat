import { decode } from './pchat/codec.js';

const PUBKEY_RE = /^0[23][0-9a-f]{64}$/i;
const REORG_WINDOW = 6; // blocks re-read on every update, so short forks between miners settle correctly

function opReturn(vout) {
  if (vout.scriptPubKey?.type !== 'nulldata') return null;
  const m = /^OP_RETURN\s+([0-9a-f]+)$/i.exec(vout.scriptPubKey.asm || '');
  return m ? Buffer.from(m[1], 'hex') : null;
}

function senderPubkey(tx) {
  const p = tx.vin?.[0]?.scriptSig?.asm?.split(' ').pop();
  return PUBKEY_RE.test(p || '') ? p : null;
}

export function extract(block, height) {
  const out = [];
  block.tx.forEach((tx, index) => {
    for (const v of tx.vout) {
      const raw = opReturn(v);
      const env = raw && decode(raw);
      if (env) {
        out.push({
          height, index, txid: tx.txid, time: block.time,
          senderPubkey: senderPubkey(tx), sender: tx.vin?.[0]?.address ?? null, env,
        });
      }
    }
  });
  return out;
}

// Joins chunked messages. The message takes the txid and position of its first chunk.
export function assemble(items) {
  const out = [], groups = new Map();
  for (const it of items) {
    const c = it.env.chunk;
    if (!c) { out.push(it); continue; }
    const key = `${it.senderPubkey || it.sender}:${c.gid}`;
    const g = groups.get(key) || [];
    g[c.i] = it;
    groups.set(key, g);
    if (g.filter(Boolean).length === c.n) {
      groups.delete(key);
      const { chunk, ...rest } = g[0].env;
      out.push({ ...g[0], env: { ...rest, body: g.map((x) => x.env.body).join('') } });
    }
  }
  return out;
}

// Reads a room's chain from the local node. `call(method, params)` talks to that node's RPC.
export class ChainScanner {
  constructor(call, { batch = 300 } = {}) {
    this.call = call;
    this.batch = batch;
    this.height = 0;
    this.raw = [];
  }
  // Returns true when the chain tip moved past what was already read. Calls run one at a time.
  update() {
    this.queue = (this.queue || Promise.resolve()).then(() => this.run(), () => this.run());
    return this.queue;
  }
  async run() {
    const tip = await this.call('getblockcount', []);
    const from = Math.max(1, this.height - REORG_WINDOW + 1);
    const to = Math.min(tip, from + this.batch - 1);
    if (to < from) return false;
    const fresh = [];
    for (let h = from; h <= to; h++) {
      const blk = await this.call('getblock', [await this.call('getblockhash', [h]), 2]);
      fresh.push(...extract(blk, h));
    }
    const advanced = to > this.height;
    this.raw = this.raw.filter((x) => x.height < from).concat(fresh);
    this.height = to;
    return advanced;
  }
  messages(from = 1) {
    return assemble(this.raw).filter((x) => x.height >= from);
  }
}
