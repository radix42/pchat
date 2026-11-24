import { encode } from '../src/pchat/codec.js';

export const PUB = '02' + 'ab'.repeat(32);
export const PUB2 = '03' + 'cd'.repeat(32);

export function msgTx(txid, payload, pub = PUB) {
  const bytes = payload instanceof Uint8Array ? payload : encode(payload);
  return { txid, vin: [{ scriptSig: { asm: `3045022100aa ${pub}` } }], vout: [{ scriptPubKey: { type: 'nulldata', asm: 'OP_RETURN ' + Buffer.from(bytes).toString('hex') } }] };
}
export const text = (body, extra = {}) => ({ v: 1, type: 'text', flags: 0, ts: 1, ref: null, body, ...extra });

// blocks[0] is height 1. Returns an rpc-style (method, params) function.
export function fakeChain(blocks, calls = []) {
  return async (method, params) => {
    calls.push(method + ':' + JSON.stringify(params));
    if (method === 'getblockcount') return blocks.length;
    if (method === 'getblockhash') return 'hash' + params[0];
    if (method === 'getblock') return { time: 1000 + Number(params[0].slice(4)), tx: blocks[Number(params[0].slice(4)) - 1] };
    throw new Error('unexpected ' + method);
  };
}
