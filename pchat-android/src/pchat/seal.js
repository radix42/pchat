import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// Header fields are authenticated but not encrypted; the body is the ciphertext (hex).
const aad = (e) => utf8ToBytes(JSON.stringify([e.v, e.type, e.flags, e.epoch]));
export const newRoomKey = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

export function seal(keyHex, env, text) {
  const nonce = crypto.getRandomValues(new Uint8Array(24)); // React Native needs a getRandomValues polyfill
  const body = xchacha20poly1305(hexToBytes(keyHex), nonce, aad(env)).encrypt(utf8ToBytes(text));
  return { ...env, nonce: bytesToHex(nonce), body: bytesToHex(body) };
}

export function open(keyHex, env) {
  try {
    const pt = xchacha20poly1305(hexToBytes(keyHex), hexToBytes(env.nonce), aad(env)).decrypt(hexToBytes(env.body));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
