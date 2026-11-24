import { secp256k1 } from '@noble/curves/secp256k1';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { createBase58check } from '@scure/base';
import { addressFromPubkey } from './tx.js';

// A user's identity: one secp256k1 key. The 32-byte key doubles as 24-word backup entropy,
// so the recovery phrase is the key. Store it only in the platform's secure storage.
export class Key {
  constructor(priv) {
    this.priv = priv;
    this.pub = secp256k1.getPublicKey(priv, true);
    this.address = addressFromPubkey(this.pub);
  }
  static generate() { return new Key(secp256k1.utils.randomPrivateKey()); }
  static fromHex(h) { return new Key(hexToBytes(h)); }
  static fromMnemonic(words) {
    if (!validateMnemonic(words, wordlist)) throw new Error('Invalid recovery phrase');
    return new Key(mnemonicToEntropy(words, wordlist));
  }
  toHex() { return bytesToHex(this.priv); }
  // Wallet import format for Komodo (prefix 0xbc, compressed key), as `importprivkey` expects.
  toWif() { return createBase58check(sha256).encode(concatBytes(Uint8Array.of(0xbc), this.priv, Uint8Array.of(1))); }
  toMnemonic() { return entropyToMnemonic(this.priv, wordlist); }
  get pubHex() { return bytesToHex(this.pub); }
}
