// The gateway interface PchatClient expects, with chain access served by the user's own local nodes.
// Only directory-style and faucet-style calls (invite, faucet) go to a remote gateway.
export class LocalGateway {
  constructor({ getRoom, nodes, scanner, remote }) {
    this.getRoom = getRoom;
    this.nodes = nodes;
    this.scanner = scanner;
    this.remote = remote; // (gatewayBase) => GwHttp
  }
  need(id) {
    const r = this.getRoom(id);
    if (!r) throw new Error('You have not joined that room.');
    return r;
  }
  baseFor(id) { return this.need(id).gateway; }
  async room(id) { const r = this.need(id); return { id: r.id, name: r.name, type: r.type }; }

  // Spendable outputs only: immature mined coins (coinbase, under 101 confirmations) cannot be spent yet.
  async utxos(id, address) {
    const r = this.need(id);
    const name = r.chain.name;
    const [list, tip] = await Promise.all([
      this.nodes.call(name, 'getaddressutxos', [{ addresses: [address] }]),
      this.nodes.call(name, 'getblockcount', []),
    ]);
    const out = [];
    for (const u of list) {
      if (!(u.satoshis > 0)) continue;
      if (tip - u.height + 1 <= 100) {
        const tx = await this.nodes.call(name, 'getrawtransaction', [u.txid, 1]);
        if (tx.vin?.[0]?.coinbase) continue;
      }
      out.push(u);
    }
    return out;
  }
  broadcast(id, hex) { return this.nodes.call(this.need(id).chain.name, 'sendrawtransaction', [hex]); }

  async messages(id, from = 1) {
    const r = this.need(id);
    const sc = this.scanner(r);
    await sc.update();
    return sc.messages(from);
  }

  async faucet(id, address) { const r = this.need(id); return this.remote(r.gateway).faucet(id, address); }
  async invite(id) { const r = this.need(id); return this.remote(r.gateway).invite(id); }
}
