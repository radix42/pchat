// Builds and signs transparent Sapling (v4) transactions with one OP_RETURN output, as Komodo assetchains expect.
// Signature hash follows ZIP-243. NOT yet verified against a live chain: test on a throwaway assetchain first.
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { blake2b } from '@noble/hashes/blake2b';
import { secp256k1 } from '@noble/curves/secp256k1';
import { createBase58check } from '@scure/base';
import { concatBytes, utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils';

const b58c = createBase58check(sha256);
export const KMD = { p2pkhPrefix: 0x3c, branchId: 0x76b809bb, versionGroupId: 0x892f2085 };

const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
const varint = (n) => (n < 0xfd ? Uint8Array.of(n) : Uint8Array.of(0xfd, n & 255, n >> 8));
const vbytes = (b) => concatBytes(varint(b.length), b);
const rev = (b) => Uint8Array.from(b).reverse();
const hash160 = (b) => ripemd160(sha256(b));
const push = (b) => concatBytes(Uint8Array.of(b.length), b); // data under 76 bytes
const zero32 = new Uint8Array(32);
const bh = (pers, data) => blake2b(data, { dkLen: 32, personalization: utf8ToBytes(pers) });

export const addressFromPubkey = (pub, net = KMD) =>
  b58c.encode(concatBytes(Uint8Array.of(net.p2pkhPrefix), hash160(pub)));

export const p2pkhScript = (h160) => concatBytes(Uint8Array.of(0x76, 0xa9, 0x14), h160, Uint8Array.of(0x88, 0xac));

export function opReturnScript(payload) {
  const n = payload.length;
  const len = n < 0x4c ? Uint8Array.of(n) : n <= 0xff ? Uint8Array.of(0x4c, n) : Uint8Array.of(0x4d, n & 255, n >> 8);
  return concatBytes(Uint8Array.of(0x6a), len, payload);
}

const outpoint = (i) => concatBytes(rev(hexToBytes(i.txid)), u32(i.vout));

function serialize(tx, net) {
  const vin = tx.inputs.map((i) => concatBytes(outpoint(i), vbytes(i.scriptSig || new Uint8Array(0)), u32(0xffffffff)));
  const vout = tx.outputs.map((o) => concatBytes(u64(o.value), vbytes(o.script)));
  return concatBytes(
    u32(0x80000004), u32(net.versionGroupId),
    varint(vin.length), ...vin, varint(vout.length), ...vout,
    u32(0), u32(tx.expiry), u64(0), varint(0), varint(0), varint(0), // locktime, expiry, valueBalance, no shielded data
  );
}

function sighash(tx, idx, scriptCode, value, net) {
  const prevouts = bh('ZcashPrevoutHash', concatBytes(...tx.inputs.map(outpoint)));
  const seqs = bh('ZcashSequencHash', concatBytes(...tx.inputs.map(() => u32(0xffffffff))));
  const outs = bh('ZcashOutputsHash', concatBytes(...tx.outputs.map((o) => concatBytes(u64(o.value), vbytes(o.script)))));
  const pre = concatBytes(
    u32(0x80000004), u32(net.versionGroupId), prevouts, seqs, outs, zero32, zero32, zero32,
    u32(0), u32(tx.expiry), u64(0), u32(1), // locktime, expiry, valueBalance, SIGHASH_ALL
    outpoint(tx.inputs[idx]), vbytes(scriptCode), u64(value), u32(0xffffffff),
  );
  return blake2b(pre, { dkLen: 32, personalization: concatBytes(utf8ToBytes('ZcashSigHash'), u32(net.branchId)) });
}

// utxos: [{txid, outputIndex, satoshis}] as returned by the gateway. One OP_RETURN output plus change.
export function buildOpReturnTx({ priv, utxos, payload, fee = 10000, expiry = 0, net = KMD }) {
  const pub = secp256k1.getPublicKey(priv, true);
  const mine = p2pkhScript(hash160(pub));
  const picked = [];
  let sum = 0;
  for (const u of utxos) {
    picked.push({ txid: u.txid, vout: u.outputIndex, value: u.satoshis });
    sum += u.satoshis;
    if (sum >= fee) break;
  }
  if (sum < fee) throw new Error('Not enough coins on this chain');
  const outputs = [{ value: 0, script: opReturnScript(payload) }];
  const change = sum - fee;
  if (change >= 546) outputs.push({ value: change, script: mine });
  const tx = { inputs: picked, outputs, expiry };
  picked.forEach((inp, i) => {
    const sig = secp256k1.sign(sighash(tx, i, mine, inp.value, net), priv, { lowS: true }).toDERRawBytes();
    inp.scriptSig = concatBytes(push(concatBytes(sig, Uint8Array.of(1))), push(pub));
  });
  const raw = serialize(tx, net);
  const txid = bytesToHex(rev(sha256(sha256(raw))));
  return {
    hex: bytesToHex(raw), txid, used: picked,
    change: change >= 546 ? { txid, outputIndex: 1, satoshis: change } : null,
  };
}
