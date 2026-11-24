// Thin client for the pchat gateway's HTTP and WebSocket API.
export class Gateway {
  constructor(base, fetchImpl = globalThis.fetch.bind(globalThis)) {
    this.base = base.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }
  async req(method, path, body) {
    const res = await this.fetch(this.base + path, {
      method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `Gateway error ${res.status}`);
    return j;
  }
  directory() { return this.req('GET', '/directory'); }
  room(id) { return this.req('GET', `/rooms/${id}`); }
  createRoom(b) { return this.req('POST', '/rooms', b); }
  faucet(id, address) { return this.req('POST', `/rooms/${id}/faucet`, { address }); }
  invite(id) { return this.req('POST', `/rooms/${id}/invites`, {}); }
  redeem(token, address) { return this.req('POST', '/invites/redeem', { token, address }); }
  utxos(id, address) { return this.req('GET', `/rooms/${id}/utxos?address=${address}`); }
  broadcast(id, hex) { return this.req('POST', `/rooms/${id}/tx`, { hex }); }
  messages(id, from = 1) { return this.req('GET', `/rooms/${id}/messages?from=${from}`); }
  socket(id, WS = globalThis.WebSocket) {
    return new WS(this.base.replace(/^http/, 'ws') + `/ws?room=${id}`);
  }
}
