// Keep identical to the gateway's codec. JSON stands in for bjson: swap encode/decode for your bjson library.
export const MAX_PAYLOAD = 512; // bytes per OP_RETURN; must match the gateway and the daemon's real limit

export const encode = (env) => new TextEncoder().encode(JSON.stringify(env));

export function decode(bytes) {
  try {
    const e = JSON.parse(new TextDecoder().decode(bytes));
    return e && e.v === 1 && typeof e.type === 'string' ? e : null;
  } catch {
    return null;
  }
}

// Split an envelope with a string body into chunk payloads that fit MAX_PAYLOAD.
export function split(env, gid) {
  const whole = encode(env);
  if (whole.length <= MAX_PAYLOAD) return [whole];
  const room = MAX_PAYLOAD - encode({ ...env, body: '', chunk: { gid, i: 99, n: 99 } }).length;
  if (room < 16) throw new Error('MAX_PAYLOAD too small for chunking');
  const parts = [];
  for (let o = 0; o < env.body.length; o += room) parts.push(env.body.slice(o, o + room));
  return parts.map((body, i) => encode({ ...env, body, chunk: { gid, i, n: parts.length } }));
}
