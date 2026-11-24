# pchat chat session export

Exported from a Claude chat session, November 2026. This is a transcript of the visible conversation. Tool activity is left out, and the code and documents Claude produced are listed at the end rather than repeated inline.

---

## 1. User

Start a project called pchat

## Claude

Happy to get pchat going. What kind of project is it: an app, a codebase, a document, or something else? And what's the basic idea behind it?

---

## 2. User

It is an app for mobile and desktop with a backend using asset chain blockchains for each chat room from the code at https://GitHub.com/komodoplatform/komodo

## Claude

Got it. One note: that link redirected to a fork (GLEECBTC/komodo-daemon). The README says it mirrors the official Komodo code, which is Zcash-based and creates assetchains with `komodod -ac_name=<chain> -ac_supply=<n>`. Each chain needs at least one node with a static IP and another node to connect and mine.

That makes the "one chain per chat room" design the main thing to plan around, because every room becomes its own network of running nodes. A few things to settle early:

- **Cost at scale:** hundreds of rooms means hundreds of daemons to host and sync, so decide whether rooms get chains on demand or share a pool of them.
- **Message storage:** chains are best for small, ordered payloads (text, plus hashes pointing to media stored elsewhere).
- **Clients:** phones can't run full nodes, so mobile and desktop apps will talk to a backend over RPC or light-client calls.

Want me to sketch an architecture for pchat, or start with a minimal prototype: one room, one assetchain, and a simple send/read flow?

---

## 3. User

Start by sketching an architecture

## Claude

Here's the architecture, shown as the app clients, the backend services, and the chain pool underneath.

*[Diagram: Mobile app and Desktop app connect to a Chat gateway (WebSocket, auth, relay). The gateway connects to a Room manager (room to chain mapping) and to Media storage (files, hash kept on-chain). The Room manager connects to a Komodo node pool holding Room A, Room B, and Room C chains, each a `komodod` assetchain.]*

The flow runs top to bottom:

- **Clients:** the mobile and desktop apps never touch the blockchain directly. They connect to the gateway over WebSocket, which also handles auth and real-time delivery.
- **Gateway and room manager:** the gateway relays messages. The room manager creates a room by launching a new assetchain (`-ac_name=room_<id>`) and keeps the room-to-chain mapping, so it's the one stateful piece.
- **Chains:** each message is written to its room's chain, which gives you ordering, tamper-evidence, and history. Media stays off-chain, with only its hash recorded.

Two choices will shape the build: whether room creation is on demand or from a pre-launched pool, and who holds message-signing keys (users on their device, or the gateway on their behalf). Which would you like to settle first?

---

## 4. User

With a prelaunched pool

## Claude

A pre-launched pool means a new room claims an already-running chain, so there's no daemon startup or genesis wait. The room manager gets a second job as pool manager.

**How it works**
- Each pool chain has one of three states: free, assigned to a room, or retired.
- Creating a room means picking a free chain, recording the room-to-chain mapping, and returning right away.
- A background job keeps the free count above a threshold by launching new chains with identical parameters (same `-ac_supply` and so on).

**Things to plan for**
- **Chains are single-use.** A blockchain can't be wiped, so a chain that hosted room A can never be reassigned to room B without exposing A's history. Retired chains stay retired, and the pool is a consumable you keep refilling.
- **Idle chains still cost resources.** Each running `komodod` needs its own data directory, ports, and a mining node, so pool size is limited by host capacity. Start small (say 10 to 20 free) and tune it.
- **Naming:** the chain name is fixed at genesis, so pool chains get generic names (`pool_0001`), and the room name lives only in your mapping.

Next I'd suggest deciding who holds the signing keys, since that determines how the gateway writes to the chains. Do you want users to sign messages on their own devices, or the gateway to sign for them?

---

## 5. User

On their own devices

## Claude

Device-side signing makes the gateway non-custodial: it never holds a private key. It only relays transactions that users have already signed.

**What changes in the design**
- **Identity:** each user's keypair, generated on their device, is their account. Their public key or address is their user ID in every room.
- **Sending a message:** the device builds a transaction that carries the message as an `OP_RETURN` payload, signs it locally, and sends the raw transaction to the gateway. The gateway broadcasts it to the room's chain.
- **Light clients:** phones shouldn't track UTXOs themselves, so the gateway can return the user's spendable outputs and the device builds and signs from those.

**The catch: fees**
Every message is a transaction, so the sender needs coins on that room's chain. The usual fix is to premine the chain's supply at genesis, then have a faucet drip a few small UTXOs to each user when they join the room. That faucet is also your join gate, since the chain itself doesn't know who's a member.

**Two other consequences**
- **No account recovery:** if a user loses their seed phrase, they lose their identity. The app needs a clear backup flow at signup.
- **Privacy:** anyone running a node for a room's chain can read what's on it, so message payloads should be encrypted before they're signed. Also, `OP_RETURN` size is limited, so long messages need splitting or an off-chain pointer.

Should room messages be end-to-end encrypted, or are some rooms meant to be public?

---

## 6. User

Some rooms public

## Claude

Mixing public and private rooms works well with the pool, because every pool chain is identical. Whether a room is public or private is just a flag in the room manager's mapping, applied when a room claims its chain.

**Public rooms**
- Messages go on-chain in plaintext. Anyone can read the room by running a node or querying the gateway, with no key needed.
- Posting still needs coins, so the faucet can drip to any user, ideally rate-limited per account to cut spam.
- Chains are immutable, so abusive content can't be deleted. Moderation means hiding it in the apps and gateway, while the raw data stays on-chain. That's worth deciding on before launch, including your terms of use.

**Private rooms**
- Messages are encrypted with a shared room key before signing, so node operators see only ciphertext.
- When someone joins, the key is delivered to them encrypted to their public key.
- When someone is removed, rotate to a new key for future messages. Anything they already had access to stays readable to them.

**Both types** use the same message format, with a header field marking whether the payload is plaintext or encrypted, so the apps need only one code path for sending and reading.

How should people find and join rooms: a browsable directory for public rooms, and invite links for private ones? Or something different?

---

## 7. User

Yes that works

## Claude

Here's how those two entry points fit the design.

**Public directory**
- The room manager keeps an index of public rooms (name, description, chain ID) and exposes it through the gateway for browsing and search.
- Opening a room needs no key, so users can read first and get faucet coins only when they want to post.

**Private invite links**
- A link carries the room ID, the gateway address, and the room key. Put the key in the URL fragment (after the `#`) so it's never sent to a server when the link is opened.
- The link deep-links into the mobile or desktop app, which stores the key locally and asks the faucet for starter coins.
- Decide whether links are single-use or expiring, since anyone holding a link holds the key.

**Where the design stands**
- Apps: mobile and desktop, with device-side signing
- Backend: gateway and room manager, with a pool of pre-launched Komodo assetchains
- Rooms: public (plaintext) and private (encrypted), one chain each

The next step would be a message format spec: header fields, payload encoding, and how long messages are split across transactions. Or we could jump to a one-room prototype. Which do you want first?

---

## 8. User

Links are single use

## Claude

Single-use is enforced by the gateway, not the link itself. The link carries a random invite token, and the gateway marks it redeemed the first time someone claims it, so a second attempt is refused and no faucet coins are issued.

There's a limit to that. If the room key sits in the link, anyone who copied the link before it was redeemed also has the key. You have two ways to handle it:

- **Key in the link (simpler):** the joiner gets in instantly. Single-use controls gateway access and faucet coins, but not the key, so if a link leaks you rotate the room key. Adding a short expiry (a few days, say) limits the exposure.
- **Token only (stronger):** the link has no key. After redeeming, the joiner sends their public key, and an existing member's app encrypts the room key to it. This needs a member online to approve, so joining can take a while.

I'd start with the first option for the MVP and move to the second if you need stricter privacy.

Still open: should I write the message format spec next, or sketch a one-room prototype first?

---

## 9. User

Message format

## Claude

Here's a first draft of the message format. Each message is one `OP_RETURN` payload in a transaction the sender signs, using a compact binary encoding such as CBOR.

**Envelope fields**
- `v`: format version
- `type`: text, reply, edit, hide, media, or key-update
- `flags`: includes an encrypted bit, which is 0 for public rooms and 1 for private ones
- `ts`: the sender's claimed time, for display only
- `ref`: the txid of the message being replied to, edited, or hidden
- `epoch` and `nonce`: private rooms only, naming the room key version and the encryption nonce
- `chunk`: group ID, index, and total, only for messages split across transactions
- `body`: UTF-8 text, ciphertext, or a media reference

**Decisions built in**
- **No sender or room field:** the transaction signature already proves who sent it, and the chain itself is the room.
- **Message ID is the txid** (of the first chunk, for split messages), so replies and edits point to it directly.
- **Ordering is by block height and position in the block,** not the sender's `ts`, which clients can't trust.
- **Edits and hides are new messages** that reference the original. Apps render the latest version, but the original stays on-chain.
- **Private rooms use authenticated encryption** (e.g. XChaCha20-Poly1305) with the room key for that `epoch`. The header fields are authenticated but not encrypted, so a node operator sees a message's type and sender, but not its content.
- **Media:** the body holds the file's hash, storage locator, MIME type, and size. In private rooms the file's own key sits inside the encrypted body.

One thing to verify before coding is the daemon's actual `OP_RETURN` size limit. That sets the maximum payload per transaction, so I'd make it a single constant in the apps.

Want this as a doc you can edit and share, or should we move on to the one-room prototype?

---

## 10. User

A document

## Claude

The pchat message format doc is ready. Read it over, edit inline, or comment, and tell me what to change.

Doc: https://claude.ai/artifact/AXxVwHuiZHhhJJEXeQY64h

---

## 11. User

Use bjson for binary payloads

## Claude

I've switched the doc to bjson in the two places that mentioned the encoding: the Transport section and the Open items list. I haven't verified bjson's specifics, such as which field types it supports, so check that it can carry the envelope's binary fields (nonce, hashes, ciphertext) as raw bytes.

---

## 12. User

Create an MVP prototype

## Claude

The pchat prototype is published. It runs a simulated chain in your browser, so you can try the whole flow without a Komodo node.

- **Pool and rooms:** creating a room claims a free chain from a pre-launched pool, which refills in the background.
- **Devices:** you can switch between Alice and Bob. Each has a key pair, and every message is signed on the device before the gateway verifies it.
- **Public rooms:** messages are plaintext, and a faucet button hands out coins.
- **Private rooms:** messages are encrypted, and joining works through single-use invite links. A second redeem attempt is refused.
- **Hide:** you can hide your own messages, and they stay on the raw chain, which you can inspect with "Show raw chain".

I used browser stand-ins for the crypto and encoding: ECDSA P-256, AES-GCM, and JSON in place of bjson. The next step would be a real gateway that talks to `komodod` over RPC, which needs a machine where you can run the daemon.

Prototype: https://claude.ai/artifact/DK28ggFiNdvJZAXBe9LmYG

---

## 13. User

Generate the code

## Claude

The pchat gateway is a Node.js service, written to the design we settled on. It manages the pre-launched chain pool, relays transactions signed on users' devices, and issues single-use invites. Only the codec has been tested, with `npm test`, and the rest passed a syntax check. I couldn't run it against a live `komodod` here, so the RPC calls and daemon launch flags are unverified. The README lists what to check.

- **Pool:** `pool.js` launches assetchains, waits about 100 blocks until the premined coins mature, and keeps a target number free. Chains are single-use.
- **Rooms and invites:** `rooms.js` handles the directory, room creation, the rate-limited public faucet, and single-use invites. An invite token is burned before any coins are sent.
- **Chain access:** `chain.js` handles broadcasting signed transactions, fetching spendable outputs, and scanning blocks for message payloads.
- **Server:** `server.js` exposes an HTTP API and a WebSocket that streams new messages.
- **Codec:** `codec.js` handles chunking and reassembly of long messages. It uses JSON as a stand-in for bjson, so swap in your bjson library's `encode` and `decode` there.

Invite creation has no member authentication yet, so anyone who knows a private room's ID could request an invite. That needs a signed-request check before you expose this publicly.

To run it, you need Node 20+, `komodod` installed, and a faucet key pair (`FAUCET_PUBKEY` and `FAUCET_WIF`). Should I write the client library next, to build, sign, and send message transactions from the mobile and desktop apps?

---

## 14. User

Yes

## Claude

The pchat client library is written, but it has only passed a syntax check. I had no network access here, so the dependencies weren't installed and I couldn't run the tests. Run `npm install && npm test` first.

The library keeps every secret on the device, which matches the design we settled on. It has these parts:

- **`keys.js`:** each user's identity key and Komodo address, with a 24-word recovery phrase that is the key itself.
- **`tx.js`:** builds and signs the transaction carrying each message, with change handling.
- **`seal.js`:** encrypts private-room messages with XChaCha20-Poly1305, so the gateway never sees room keys.
- **`client.js`:** the main `PchatClient` class, which handles rooms, invites, sending, history, and live messages.
- **`codec.js`:** the same JSON stand-in for bjson as in the gateway, so swap in your bjson library on both sides together.

Transaction signing in `tx.js` is the riskiest part. I wrote the signature hash by hand and assumed Komodo's consensus branch ID, `R` address prefix, and a 10,000 satoshi fee. Send one test message on a throwaway assetchain and confirm the node accepts it before building on this.

The README covers the other caveats, including that React Native needs a random-number polyfill.

Should I wire this into a first desktop or mobile app screen next?

---

## 15. User

Mobile app for Android

## Claude

The Android app is written as a React Native (Expo) project, reusing the client library so signing and encryption stay on the phone. I couldn't install anything or build it here, so expect small fixes on the first build, and the README has the setup steps.

- **Setup:** create an identity and back up its 24-word recovery phrase, or restore from a phrase.
- **Home:** your rooms, the public directory, room creation (public or private), and a field to paste an invite link.
- **Chat:** live messages, a "Sending to the chain" state until the block is mined, long-press to edit or hide your own messages, an Invite button for private rooms, and a Get coins button in public rooms.
- **Invite links:** opening a `pchat://join/...` link redeems the single-use invite and drops you into the room. Test this on a development build, because Expo Go won't handle the scheme.

The identity key and room keys sit in Android's secure storage, but with no PIN or biometric gate yet. I'd add one before shipping.

Next I'd suggest standing up the gateway with one throwaway assetchain and sending a first real message from the emulator. That would confirm that transaction signing, the riskiest part, works against a live chain. Do you have a machine where you can run `komodod`?

---

## 16. User

Yes

## Claude

To run the first real message on your machine, I added what the path needed. `keys.js` now exports a WIF key, which the gateway's faucet requires, and there are two new scripts in `pchat-client/scripts`. Like the rest of the code, they passed a syntax check but have not been run.

1. Build `komodod` from the Komodo repo, following its README (`./zcutil/fetch-params.sh`, then `./zcutil/build.sh`), and put it on your PATH.
2. In `pchat-client`, run `npm install && npm test`. Fix anything that fails here first, since the tests cover the transaction builder.
3. Run `node scripts/faucet-key.js` and export the two values it prints (`FAUCET_PUBKEY` and `FAUCET_WIF`).
4. In `pchat-gateway`, run `npm install`, set `RPC_PASS`, and run `npm start`. Wait for `curl localhost:8080/health` to show `free` above 0. The first chain needs about 100 blocks before its premine is spendable, so give it a few minutes.
5. In `pchat-client`, run `node scripts/smoke.js`. It creates an identity and a public room, waits for the starter coins, sends "hello from pchat", and reads it back. A line starting with `PASS` means signing, broadcasting, and scanning all work.

If step 5 fails at "broadcast", that points to the transaction signing code, and the node's error message will say why. Send me that output and I'll fix it.

---

## 17. User

Export this entire chat session

---

## Things produced during the session

| Item | Where |
| --- | --- |
| Message format doc (bjson edit applied) | https://claude.ai/artifact/AXxVwHuiZHhhJJEXeQY64h |
| Browser prototype with a simulated chain | https://claude.ai/artifact/DK28ggFiNdvJZAXBe9LmYG (file: `pchat-prototype.html`) |
| Gateway (Node.js) | `pchat-gateway/`: `package.json`, `README.md`, `src/` (`server.js`, `pool.js`, `rooms.js`, `chain.js`, `codec.js`, `config.js`, `rpc.js`, `store.js`, `codec.test.js`) |
| Client library (JavaScript) | `pchat-client/`: `package.json`, `README.md`, `src/` (`client.js`, `tx.js`, `keys.js`, `seal.js`, `codec.js`, `gateway.js`, `index.js`), `scripts/` (`faucet-key.js`, `smoke.js`), `test/client.test.js` |
| Android app (React Native, Expo) | `pchat-android/`: `package.json`, `app.json`, `index.js`, `App.js`, `README.md`, `src/` (`Chat.js`, `Home.js`, `Setup.js`, `storage.js`, `theme.js`, `config.js`) |

## Decisions made

- Project: pchat, a mobile and desktop chat app with one Komodo assetchain per chat room, built from the Komodo codebase
- Chains come from a pre-launched pool, and each chain is single-use
- Users sign messages on their own devices; the gateway only relays signed transactions
- Some rooms are public (plaintext), the rest private (encrypted); public rooms are found through a directory, private rooms through invite links
- Invite links are single-use
- Binary payloads use bjson (JSON is a stand-in in the current code)
- The mobile app targets Android first

## Open items

- Verify transaction signing and the daemon's launch flags against a live `komodod`; run the smoke test
- Replace the JSON stand-in with a bjson library in both `codec.js` files
- Add member authentication for invite creation on the gateway
- Add a PIN or biometric gate to the Android app's secure storage
- Check the daemon's real `OP_RETURN` size limit and set `MAX_PAYLOAD`
