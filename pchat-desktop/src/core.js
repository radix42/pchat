import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PchatClient, Key, newRoomKey } from './pchat/index.js';
import { NodeManager } from './nodes.js';
import { ChainScanner } from './scan.js';
import { LocalGateway } from './localgateway.js';
import { GwHttp } from './gwhttp.js';
import { Vault } from './vault.js';
import { JsonFile } from './jsonfile.js';
import { normalizeGateway, validateRoom, parseInvite, GATEWAY_PORT } from './validate.js';

const PARAM_FILES = ['sapling-spend.params', 'sapling-output.params', 'sprout-groth16.params'];
const err = (message, code, data) => Object.assign(new Error(message), { code, data });

export class PchatCore {
  constructor({ userData, cipher = null, emit = () => {}, platform = process.platform, env = process.env, fetchImpl = fetch, pollMs = 3000 }) {
    this.userData = userData;
    this.cipher = cipher;
    this.emit = emit;
    this.platform = platform;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.pollMs = pollMs;
    this.key = null;
    this.client = null;
    this.scanners = new Map();
    this.errors = new Map(); // room id -> last start error
    this.busy = false;
  }

  async init() {
    fs.mkdirSync(this.userData, { recursive: true });
    this.settings = new JsonFile(path.join(this.userData, 'settings.json'), { gateways: [], komodod: '', threads: 1 });
    this.roomsFile = new JsonFile(path.join(this.userData, 'rooms.json'), []);
    this.vault = new Vault({ file: path.join(this.userData, 'vault.json'), cipher: this.cipher });
    this.nodes = new NodeManager({ komodod: this.settings.value.komodod, dataRoot: path.join(this.userData, 'chains'), platform: this.platform });
    await this.nodes.reapStale();
    this.keystore = {
      get: async (id) => { const v = this.vault.get('rk_' + id); return v ? JSON.parse(v) : null; },
      set: async (id, v) => this.vault.set('rk_' + id, JSON.stringify(v)),
    };
    this.local = new LocalGateway({
      getRoom: (id) => this.rooms.find((r) => r.id === id),
      nodes: this.nodes,
      scanner: (r) => this.scanner(r),
      remote: (base) => this.gw(base),
    });
    const hex = this.vault.get('identity');
    if (hex) await this.useKey(Key.fromHex(hex));
    this.timer = setInterval(() => this.tick().catch(() => {}), this.pollMs);
  }

  get rooms() { return this.roomsFile.value; }
  gw(base) { return new GwHttp(base, { allowed: () => this.settings.value.gateways, fetchImpl: this.fetchImpl }); }
  need() { if (!this.key) throw err('Create or restore your identity first.', 'NO_KEY'); }

  scanner(r) {
    let s = this.scanners.get(r.id);
    if (!s) { s = new ChainScanner((m, p) => this.nodes.call(r.chain.name, m, p)); this.scanners.set(r.id, s); }
    return s;
  }

  // ---- identity -----------------------------------------------------------------------------------
  async useKey(key) {
    this.key = key;
    this.client = new PchatClient({ gateway: this.local, key, keystore: this.keystore });
    for (const r of this.rooms) await this.startRoom(r);
  }
  async identityCreate() {
    const key = Key.generate();
    this.vault.set('identity', key.toHex());
    await this.useKey(key);
    return { mnemonic: key.toMnemonic() };
  }
  async identityRestore(words) {
    const key = Key.fromMnemonic(String(words || '').trim().toLowerCase().replace(/\s+/g, ' '));
    this.vault.set('identity', key.toHex());
    await this.useKey(key);
    return true;
  }
  showMnemonic() { this.need(); return { mnemonic: this.key.toMnemonic() }; }

  // ---- settings and checks ------------------------------------------------------------------------
  paramsDir() {
    if (this.platform === 'win32') return path.join(this.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ZcashParams');
    if (this.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ZcashParams');
    return path.join(os.homedir(), '.zcash-params');
  }
  setupCheck() {
    const k = this.settings.value.komodod;
    const dir = this.paramsDir();
    return {
      komodod: !!k && fs.existsSync(k),
      paramsDir: dir,
      params: PARAM_FILES.map((f) => ({ file: f, found: fs.existsSync(path.join(dir, f)) })),
    };
  }
  async saveSettings(s) {
    const gateways = [...new Set((s.gateways || []).map((g) => String(g).trim()).filter(Boolean).map(normalizeGateway))];
    const komodod = String(s.komodod || '').trim();
    const threads = Math.max(1, Math.min(Math.floor(+s.threads) || 1, 8));
    this.settings.value = { gateways, komodod, threads };
    this.settings.save();
    this.nodes.setKomodod(komodod);
    if (this.key) for (const r of this.rooms) await this.startRoom(r);
    return this.state();
  }

  state() {
    return {
      hasKey: !!this.key,
      address: this.key?.address || null,
      encrypted: this.vault.encrypted,
      settings: this.settings.value,
      gatewayPort: GATEWAY_PORT,
      setup: this.setupCheck(),
      rooms: this.roomStatuses(),
    };
  }

  // ---- rooms --------------------------------------------------------------------------------------
  roomStatuses() {
    return this.rooms.map((r) => {
      const st = this.nodes.status(r.chain.name);
      const e = this.errors.get(r.id);
      return { id: r.id, name: r.name, type: r.type, gateway: r.gateway, mining: r.mining !== false, ...st, ...(e ? { state: 'needs-setup', error: e } : {}) };
    });
  }

  async startRoom(r) {
    try {
      await this.nodes.start(r, { pubkey: this.key.pubHex, mine: r.mining !== false, threads: this.settings.value.threads });
      this.errors.delete(r.id);
    } catch (e) {
      this.errors.set(r.id, e.message);
    }
  }

  async addRoom(view, gateway) {
    const room = { ...view, gateway, mining: true };
    const i = this.rooms.findIndex((r) => r.id === room.id);
    if (i >= 0) this.rooms[i] = { ...this.rooms[i], ...room, mining: this.rooms[i].mining };
    else this.rooms.push(room);
    this.roomsFile.save();
    await this.startRoom(this.rooms.find((r) => r.id === room.id));
    return room.id;
  }

  async directory() {
    this.need();
    const joined = new Set(this.rooms.map((r) => r.id));
    const out = [], problems = [];
    await Promise.all(this.settings.value.gateways.map(async (g) => {
      try {
        for (const raw of await this.gw(g).directory()) {
          try { const v = validateRoom(raw); out.push({ ...v, gateway: g, joined: joined.has(v.id) }); } catch { /* skip a bad entry */ }
        }
      } catch (e) { problems.push(`${g}: ${e.message}`); }
    }));
    return { rooms: out, problems };
  }

  async joinPublic({ id, gateway }) {
    this.need();
    const base = normalizeGateway(gateway);
    const view = validateRoom(await this.gw(base).room(id));
    if (view.type !== 'public') throw err('That room is private. Use an invite link.');
    await this.addRoom(view, base);
    let coins = 'Starter coins requested.';
    try { await this.gw(base).faucet(id, this.key.address); } catch (e) { coins = `Joined, but the faucet said: ${e.message}`; }
    return { id, note: coins };
  }

  async createRoom({ name, type, gateway }) {
    this.need();
    if (!['public', 'private'].includes(type)) throw err('Choose public or private.');
    const base = normalizeGateway(gateway);
    const view = validateRoom(await this.gw(base).createRoom({ name: String(name || '').trim(), type, owner: this.key.address }));
    if (type === 'private') await this.keystore.set(view.id, { key: newRoomKey(), epoch: 1 }); // never leaves this device
    await this.addRoom(view, base);
    return { id: view.id };
  }

  async joinInvite(link, trustGateway = false) {
    this.need();
    const inv = parseInvite(link);
    if (!this.settings.value.gateways.includes(inv.gateway)) {
      if (!trustGateway) throw err(`This invite uses a gateway that is not in your settings: ${inv.gateway}`, 'UNKNOWN_GATEWAY', { gateway: inv.gateway });
      this.settings.value.gateways.push(inv.gateway);
      this.settings.save();
    }
    const view = validateRoom(await this.gw(inv.gateway).redeem(inv.token, this.key.address));
    await this.keystore.set(view.id, { key: inv.key, epoch: inv.epoch });
    await this.addRoom(view, inv.gateway);
    return { id: view.id };
  }

  async leaveRoom(id, deleteData) {
    const r = this.rooms.find((x) => x.id === id);
    if (!r) return;
    await this.nodes.stop(r.chain.name);
    this.roomsFile.value = this.rooms.filter((x) => x.id !== id);
    this.roomsFile.save();
    this.vault.delete('rk_' + id);
    this.scanners.delete(id);
    this.errors.delete(id);
    if (deleteData) fs.rmSync(path.join(this.userData, 'chains', r.chain.name), { recursive: true, force: true });
  }

  async setMining(id, on) {
    const r = this.rooms.find((x) => x.id === id);
    if (!r) throw err('Unknown room.');
    r.mining = !!on;
    this.roomsFile.save();
    try { await this.nodes.setMining(r.chain.name, on, this.settings.value.threads); } catch { /* node still starting; flag applies on next start */ }
  }

  // ---- chat ---------------------------------------------------------------------------------------
  history(id) { this.need(); return this.client.history(id); }
  send(id, text) { this.need(); return this.client.send(id, String(text)); }
  edit(id, ref, text) { this.need(); return this.client.edit(id, ref, String(text)); }
  hide(id, ref) { this.need(); return this.client.hide(id, ref); }
  async invite(id) { this.need(); return { link: await this.client.createInvite(id) }; }
  async faucet(id) {
    this.need();
    const r = this.rooms.find((x) => x.id === id);
    if (!r) throw err('Unknown room.');
    await this.gw(r.gateway).faucet(id, this.key.address);
    return true;
  }

  // ---- background loop ----------------------------------------------------------------------------
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.nodes.poll();
      for (const r of this.rooms) {
        const st = this.nodes.status(r.chain.name);
        if (st.blocks === undefined) continue;
        try { if (await this.scanner(r).update()) this.emit('messages', { roomId: r.id }); } catch { /* retry next tick */ }
      }
      this.emit('status', this.roomStatuses());
    } finally { this.busy = false; }
  }

  async shutdown() {
    clearInterval(this.timer);
    await this.nodes?.stopAll();
  }
}
