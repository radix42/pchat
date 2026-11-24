import crypto from 'node:crypto';
import { cfg } from './config.js';
import { state, save } from './store.js';
import * as pool from './pool.js';
import * as chain from './chain.js';

const err = (status, message) => Object.assign(new Error(message), { status });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const lastDrip = new Map();

export const find = (id) => state.rooms.find((r) => r.id === id);
export const chainOf = (room) => pool.get(room.chain);
// chain = what a desktop node needs to run this room's chain: genesis flags and the gateway's peer addresses
const view = (r) => {
  const c = pool.get(r.chain);
  return {
    id: r.id, name: r.name, type: r.type, created: r.created,
    chain: c && {
      name: c.name,
      flags: [`-ac_supply=${c.supply ?? cfg.acSupply}`, `-ac_blocktime=${c.blocktime ?? cfg.acBlocktime}`],
      peers: c.nodes.map((n) => `${cfg.publicHost}:${n.p2pPort}`),
    },
  };
};

export function directory() {
  return state.rooms.filter((r) => r.type === 'public').map(view);
}

export function info(id) {
  const r = find(id);
  if (!r) throw err(404, 'Room not found');
  return view(r);
}

export async function create({ name, type, owner }) {
  if (!name || !['public', 'private'].includes(type)) throw err(400, 'name and type (public|private) required');
  const id = crypto.randomBytes(6).toString('hex');
  const c = pool.claim(id);
  const room = { id, name: String(name).slice(0, 60), type, chain: c.name, created: Date.now() };
  state.rooms.push(room);
  save();
  // the owner gets starter coins so they can post immediately
  if (owner) await chain.drip(c, owner, cfg.dripAmount).catch((e) => console.error('[drip]', e.message));
  return view(room);
}

export async function faucet(id, address) {
  const r = find(id);
  if (!r) throw err(404, 'Room not found');
  if (r.type !== 'public') throw err(403, 'Faucet is for public rooms; use an invite');
  const key = `${id}:${address}`;
  if (Date.now() - (lastDrip.get(key) || 0) < cfg.faucetCooldownMs) throw err(429, 'Faucet cooldown');
  lastDrip.set(key, Date.now());
  return { txid: await chain.drip(chainOf(r), address, cfg.dripAmount) };
}

// TODO: require a signed request proving the caller is a member before issuing invites.
export function invite(id) {
  const r = find(id);
  if (!r || r.type !== 'private') throw err(404, 'Private room not found');
  const token = crypto.randomBytes(16).toString('hex');
  state.invites[sha(token)] = { roomId: id, used: false };
  save();
  return { token };
}

// Single use: the token is burned before any coins are sent.
export async function redeem(token, address) {
  const rec = state.invites[sha(String(token))];
  if (!rec) throw err(404, 'Unknown invite');
  if (rec.used) throw err(410, 'Invite already used');
  rec.used = true;
  save();
  const r = find(rec.roomId);
  await chain.drip(chainOf(r), address, cfg.dripAmount);
  return view(r);
}
