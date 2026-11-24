# pchat client library

Shared JavaScript library for the pchat mobile and desktop apps. It keeps all secrets on the device:
the user's key, signing, and private-room keys. The gateway only ever sees signed transactions.

```js
import { PchatClient, Key } from 'pchat-client';

const key = Key.generate();                      // back up key.toMnemonic() securely
const pc = new PchatClient({ gateway: 'https://gateway.example', key, keystore });

const room = await pc.createRoom('general', 'public');
await pc.send(room.id, 'hello');
const messages = await pc.history(room.id);      // decrypted, edits applied, hides marked
const stop = pc.subscribe(room.id, (m) => console.log(m));

const link = await pc.createInvite(privateRoomId);   // single use; room key is in the #fragment
await otherClient.redeemInvite(link);
```

`keystore` is any object with async-friendly `get(roomId)` and `set(roomId, {key, epoch})`.
Back it with the Keychain/Keystore (mobile) or OS credential store (desktop); the default is an in-memory Map.

## Modules

| File | Job |
| --- | --- |
| `keys.js` | Identity key, Komodo address, 24-word recovery phrase |
| `tx.js` | Builds and signs a v4 transaction carrying an `OP_RETURN` payload |
| `seal.js` | XChaCha20-Poly1305 encryption for private rooms |
| `codec.js` | Envelope encoding and chunking (JSON stand-in for bjson) |
| `gateway.js` | HTTP and WebSocket client for the gateway |
| `client.js` | `PchatClient`: rooms, invites, send, history, subscribe |

## Before relying on it

- **Not run yet:** this was written without network access, so dependencies were not installed and
  `npm test` has not been run. Run it first (`npm install && npm test`).
- **Transaction signing is the riskiest part.** `tx.js` hand-builds the ZIP-243 signature hash and assumes
  Komodo's Sapling branch ID, `R` address prefix, and a 10,000 satoshi fee. Send a test message on a throwaway
  assetchain and confirm the node accepts it before anything else.
- **bjson:** replace `encode`/`decode` in `codec.js`, matching the gateway's copy.
- **Random numbers:** React Native needs a `crypto.getRandomValues` polyfill.
- **Unconfirmed change:** rapid sends rely on local tracking of unconfirmed outputs; heavy use may need a
  proper mempool-aware UTXO call on the gateway.
