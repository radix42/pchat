import { rpcChain } from './rpc.js';
import { decode } from './codec.js';

export const tip = (c) => rpcChain(c, 'getblockcount');
export const utxos = (c, addr) => rpcChain(c, 'getaddressutxos', [{ addresses: [addr] }]);
export const broadcast = (c, hex) => rpcChain(c, 'sendrawtransaction', [hex]);
export const drip = (c, addr, amount) => rpcChain(c, 'sendtoaddress', [addr, amount]);

function opReturn(vout) {
  if (vout.scriptPubKey?.type !== 'nulldata') return null;
  const m = /^OP_RETURN\s+([0-9a-f]+)$/i.exec(vout.scriptPubKey.asm || '');
  return m ? Buffer.from(m[1], 'hex') : null;
}

// The spender's public key is the last item of the first input's scriptSig.
function senderPubkey(tx) {
  const p = tx.vin?.[0]?.scriptSig?.asm?.split(' ').pop();
  return /^0[23][0-9a-f]{64}$/i.test(p || '') ? p : null;
}

// Returns decoded envelopes found in blocks from..to (inclusive), oldest first.
export async function scan(c, from, to) {
  const out = [];
  for (let h = from; h <= to; h++) {
    const blk = await rpcChain(c, 'getblock', [await rpcChain(c, 'getblockhash', [h]), 2]);
    blk.tx.forEach((tx, index) => {
      for (const v of tx.vout) {
        const raw = opReturn(v);
        const env = raw && decode(raw);
        if (env) {
          out.push({
            height: h, index, txid: tx.txid, time: blk.time,
            senderPubkey: senderPubkey(tx), sender: tx.vin?.[0]?.address ?? null, env,
          });
        }
      }
    });
  }
  return out;
}
