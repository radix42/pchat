// Everything a gateway tells us is untrusted. These checks run before any of it reaches a file path,
// a command line, or the UI.
export const GATEWAY_PORT = 8080;

const NAME_RE = /^[A-Za-z0-9_]{1,32}$/;
const AC_FLAG_RE = /^-ac_[a-z_]{1,24}=[A-Za-z0-9_.,]{1,80}$/;
const PEER_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9.-]{1,253}):(\d{1,5})$/;
const ID_RE = /^[a-f0-9]{12}$/;

// "host", "host:8080" or "http(s)://host[:8080]" -> "http(s)://host:8080". Any other port is refused.
export function normalizeGateway(input) {
  let t = String(input || '').trim();
  if (!t) throw new Error('Enter a gateway address.');
  if (!/^https?:\/\//i.test(t)) t = 'http://' + t;
  let u;
  try { u = new URL(t); } catch { throw new Error(`"${input}" is not a valid address.`); }
  if (!u.hostname) throw new Error(`"${input}" has no host name.`);
  if (u.port && u.port !== String(GATEWAY_PORT)) throw new Error(`Gateways must use port ${GATEWAY_PORT}.`);
  return `${u.protocol}//${u.hostname}:${GATEWAY_PORT}`;
}

export function validateChain(c) {
  if (!c || typeof c !== 'object') throw new Error('The gateway sent no chain details for this room.');
  if (!NAME_RE.test(c.name || '')) throw new Error('Invalid chain name from gateway.');
  const flags = Array.isArray(c.flags) ? c.flags : [];
  if (flags.length > 12) throw new Error('Too many chain flags from gateway.');
  for (const f of flags) {
    if (!AC_FLAG_RE.test(f) || f.startsWith('-ac_name=')) throw new Error(`Refused chain flag from gateway: ${String(f).slice(0, 40)}`);
  }
  if (!flags.some((f) => f.startsWith('-ac_supply='))) throw new Error('Gateway chain details are missing -ac_supply.');
  const peers = Array.isArray(c.peers) ? c.peers : [];
  if (!peers.length || peers.length > 16) throw new Error('Gateway chain details need 1 to 16 peers.');
  for (const p of peers) {
    const m = PEER_RE.exec(p);
    if (!m || +m[1] < 1 || +m[1] > 65535) throw new Error(`Invalid peer address from gateway: ${String(p).slice(0, 40)}`);
  }
  return { name: c.name, flags: [...flags], peers: [...peers] };
}

export function validateRoom(r) {
  if (!r || !ID_RE.test(r.id || '')) throw new Error('Invalid room id from gateway.');
  if (!['public', 'private'].includes(r.type)) throw new Error('Invalid room type from gateway.');
  return {
    id: r.id,
    name: String(r.name || '').slice(0, 60) || 'Untitled room',
    type: r.type,
    created: Number(r.created) || 0,
    chain: validateChain(r.chain),
  };
}

// pchat://join/<token>?g=<gateway>#<roomkey>.<epoch>
export function parseInvite(link) {
  let u;
  try { u = new URL(String(link || '').trim()); } catch { throw new Error('That is not an invite link.'); }
  if (u.protocol !== 'pchat:' || u.hostname !== 'join') throw new Error('That is not a pchat invite link.');
  const token = u.pathname.replace(/^\/+/, '');
  const [key, epoch] = u.hash.slice(1).split('.');
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('The invite link is damaged (token).');
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw new Error('The invite link is damaged (room key).');
  if (!/^\d{1,6}$/.test(epoch || '') || +epoch < 1) throw new Error('The invite link is damaged (key version).');
  return { token, key, epoch: +epoch, gateway: normalizeGateway(u.searchParams.get('g')) };
}
