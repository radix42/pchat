import { Gateway } from './gateway.js';
import { buildOpReturnTx, addressFromPubkey } from './tx.js';
import { split } from './codec.js';
import { seal, open, newRoomKey } from './seal.js';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';

// keystore: anything with get(roomId) / set(roomId, {key, epoch}). Back it with secure storage in the apps.
export class PchatClient {
  constructor({ gateway, key, keystore = new Map() }) {
    // gateway: a base URL string, or an object with the same methods (the desktop app supplies one backed by a local node)
    this.gw = typeof gateway === 'string' ? new Gateway(gateway) : gateway;
    this.gatewayUrl = typeof gateway === 'string' ? gateway : null;
    this.key = key;
    this.keys = keystore;
    this.rooms = new Map();
    this.spent = new Map(); // "txid:vout" -> time, covers outputs spent but not yet confirmed
    this.pending = new Map(); // roomId -> unconfirmed change outputs
  }

  directory() { return this.gw.directory(); }
  async room(id) {
    if (!this.rooms.has(id)) this.rooms.set(id, await this.gw.room(id));
    return this.rooms.get(id);
  }

  async createRoom(name, type) {
    const r = await this.gw.createRoom({ name, type, owner: this.key.address });
    this.rooms.set(r.id, r);
    if (type === 'private') await this.keys.set(r.id, { key: newRoomKey(), epoch: 1 }); // never leaves the device
    return r;
  }

  async joinPublic(id) { await this.gw.faucet(id, this.key.address); return this.room(id); }

  // The room key rides in the link fragment, so it is not sent to any server when the link is opened.
  async createInvite(id) {
    const k = await this.keys.get(id);
    if (!k) throw new Error('Only members can invite');
    const { token } = await this.gw.invite(id);
    return `pchat://join/${token}?g=${encodeURIComponent(this.gw.baseFor ? this.gw.baseFor(id) : this.gatewayUrl)}#${k.key}.${k.epoch}`;
  }

  async redeemInvite(link) {
    const u = new URL(link);
    const token = u.pathname.replace(/^\/+/, ''); // pchat://join/<token>?g=<gateway>#<key>.<epoch>
    const [key, epoch] = u.hash.slice(1).split('.');
    const r = await this.gw.redeem(token, this.key.address);
    await this.keys.set(r.id, { key, epoch: +epoch });
    this.rooms.set(r.id, r);
    return r;
  }

  async coins(id) {
    const now = Date.now();
    for (const [k, t] of this.spent) if (now - t > 300_000) this.spent.delete(k);
    const fetched = await this.gw.utxos(id, this.key.address);
    const have = new Set(fetched.map((u) => `${u.txid}:${u.outputIndex}`));
    const pend = (this.pending.get(id) || []).filter((u) => !have.has(`${u.txid}:${u.outputIndex}`));
    this.pending.set(id, pend);
    return [...fetched, ...pend].filter((u) => !this.spent.has(`${u.txid}:${u.outputIndex}`));
  }

  // Sends text (type 'text'), or an edit/hide referencing an earlier message id. Returns the first txid.
  async send(id, text, { type = 'text', ref = null } = {}) {
    const room = await this.room(id);
    let env = { v: 1, type, flags: room.type === 'private' ? 1 : 0, ts: Date.now(), ref, body: text };
    if (env.flags) {
      const k = await this.keys.get(id);
      if (!k) throw new Error('No room key on this device');
      env = seal(k.key, { ...env, epoch: k.epoch }, text);
    }
    const gid = bytesToHex(crypto.getRandomValues(new Uint8Array(4)));
    let coins = await this.coins(id), first = null;
    for (const payload of split(env, gid)) {
      const t = buildOpReturnTx({ priv: this.key.priv, utxos: coins, payload });
      await this.gw.broadcast(id, t.hex);
      first ||= t.txid;
      for (const u of t.used) this.spent.set(`${u.txid}:${u.vout}`, Date.now());
      coins = coins.filter((c) => !t.used.some((u) => u.txid === c.txid && u.vout === c.outputIndex));
      if (t.change) { coins.push(t.change); this.pending.set(id, [...(this.pending.get(id) || []), t.change]); }
    }
    return first;
  }
  edit(id, ref, text) { return this.send(id, text, { type: 'edit', ref }); }
  hide(id, ref) { return this.send(id, '', { type: 'hide', ref }); }

  async decrypt(id, item) {
    const e = item.env;
    const from = item.senderPubkey ? addressFromPubkey(hexToBytes(item.senderPubkey)) : item.sender;
    let text = e.body;
    if (e.flags) {
      const k = await this.keys.get(id);
      text = k ? open(k.key, e) : null; // null = no key, or tampered
    }
    return { id: item.txid, from, pubkey: item.senderPubkey, time: item.time, height: item.height, type: e.type, ref: e.ref, text };
  }

  // Turns a decoded, ordered list into the visible conversation: edits applied, hidden messages marked.
  fold(msgs) {
    const byId = new Map(), out = [];
    for (const m of msgs) {
      if (m.type === 'text' || m.type === 'reply') { m.edited = false; m.hidden = false; byId.set(m.id, m); out.push(m); continue; }
      const t = byId.get(m.ref);
      if (!t || t.pubkey !== m.pubkey) continue; // only the author may edit or hide
      if (m.type === 'edit' && m.text !== null) { t.text = m.text; t.edited = true; }
      if (m.type === 'hide') t.hidden = true; // still on the chain; apps just stop showing it
    }
    return out;
  }

  async history(id, from = 1) {
    const items = await this.gw.messages(id, from);
    return this.fold(await Promise.all(items.map((i) => this.decrypt(id, i))));
  }

  // onMessage receives each new decoded message (text, edit, or hide); pass lists through fold() in the UI.
  subscribe(id, onMessage, WS) {
    const ws = this.gw.socket(id, WS);
    ws.onmessage = async (ev) => onMessage(await this.decrypt(id, JSON.parse(ev.data)));
    return () => ws.close();
  }
}
