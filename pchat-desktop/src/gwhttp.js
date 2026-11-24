import { normalizeGateway } from './validate.js';

// HTTP client for one gateway. It refuses any base address the user has not configured, so the app's
// only web traffic is to the gateways in Settings, always on port 8080.
export class GwHttp {
  constructor(base, { allowed, fetchImpl = fetch, timeout = 10000 }) {
    this.base = normalizeGateway(base);
    this.allowed = allowed;
    this.fetch = fetchImpl;
    this.timeout = timeout;
  }
  async req(method, path, body) {
    if (!this.allowed().includes(this.base)) throw new Error('That gateway is not in your settings.');
    let res;
    try {
      res = await this.fetch(this.base + path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (e) {
      throw new Error(`Cannot reach ${this.base} (${e.cause?.code || e.name || 'network error'}).`);
    }
    let j;
    try { j = await res.json(); } catch { throw new Error(`Gateway ${this.base} sent an unreadable response (${res.status}).`); }
    if (!res.ok) throw new Error(j.error || `Gateway error ${res.status}`);
    return j;
  }
  directory() { return this.req('GET', '/directory'); }
  room(id) { return this.req('GET', `/rooms/${encodeURIComponent(id)}`); }
  createRoom(b) { return this.req('POST', '/rooms', b); }
  faucet(id, address) { return this.req('POST', `/rooms/${encodeURIComponent(id)}/faucet`, { address }); }
  invite(id) { return this.req('POST', `/rooms/${encodeURIComponent(id)}/invites`, {}); }
  redeem(token, address) { return this.req('POST', '/invites/redeem', { token, address }); }
}
