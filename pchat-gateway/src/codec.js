// Envelope codec. JSON stands in for bjson here: swap encode/decode for your bjson
// library and keep the same envelope fields (v, type, flags, ts, ref, epoch, nonce, chunk, body).
export const MAX_PAYLOAD = +process.env.MAX_PAYLOAD || 512; // bytes per OP_RETURN, verify against your daemon

export const encode = (env) => Buffer.from(JSON.stringify(env), 'utf8');

export function decode(buf) {
  try {
    const e = JSON.parse(buf.toString('utf8'));
    return e && e.v === 1 && typeof e.type === 'string' ? e : null;
  } catch {
    return null;
  }
}

// Split an envelope whose body is a string into chunk envelopes that fit MAX_PAYLOAD.
export function split(env, gid) {
  const whole = encode(env);
  if (whole.length <= MAX_PAYLOAD) return [whole];
  const room = MAX_PAYLOAD - encode({ ...env, body: '', chunk: { gid, i: 99, n: 99 } }).length;
  if (room < 16) throw new Error('MAX_PAYLOAD too small for chunking');
  const parts = [];
  for (let o = 0; o < env.body.length; o += room) parts.push(env.body.slice(o, o + room));
  return parts.map((body, i) => encode({ ...env, body, chunk: { gid, i, n: parts.length } }));
}

// Reassemble chunked messages. `pending` carries incomplete groups between scans.
export function assemble(items, pending = new Map()) {
  const out = [];
  for (const it of items) {
    const c = it.env.chunk;
    if (!c) { out.push(it); continue; }
    const key = `${it.senderPubkey || it.sender}:${c.gid}`;
    const g = pending.get(key) || { items: [] };
    g.items[c.i] = it;
    pending.set(key, g);
    if (g.items.filter(Boolean).length === c.n) {
      pending.delete(key);
      const first = g.items[0];
      const { chunk, ...rest } = first.env;
      out.push({ ...first, env: { ...rest, body: g.items.map((x) => x.env.body).join('') } });
    }
  }
  return out;
}
