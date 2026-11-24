# pchat gateway

Node.js gateway for pchat. It manages a pool of pre-launched Komodo assetchains (one per chat room),
relays transactions signed on users' devices, issues single-use invites, and streams room messages.

## Run

```
npm install
export FAUCET_PUBKEY=<hex pubkey>   # premine goes to this key
export FAUCET_WIF=<its WIF key>     # imported into each chain's wallet to fund drips
export RPC_PASS=<strong password>
npm start
```

Needs Node 20+ and `komodod` on PATH (or set `KOMODOD_BIN`). `npm test` checks the codec offline.
Other settings are in `src/config.js` (ports, pool size, drip amount, `KOMODOD_FLAGS`).

## How the chain nodes run

Each room chain runs on two `komodod` nodes, both mining, peered only with each other. The launch flags
(see `nodeArgs` in `src/pool.js`) keep them off Komodo mainnet:

- `-ac_name` runs the standalone assetchain instead of the mainnet chain
- `-connect=<peer>` allows connections only to the room's other node, `-dnsseed=0` disables seed lookups, `-upnp=0` disables port mapping
- `-bind` and `-rpcbind` default to `127.0.0.1` (`BIND_HOST`), so nothing is exposed

A chain is only marked free once both nodes are mining, connected to each other, and past the premine maturity
height. A watchdog restarts any node that dies, and reads fail over to the second node. The current design runs
both nodes on one host; for two machines, give the nodes real addresses in `nodeArgs` instead of loopback.
To let desktop nodes join and mine a room's chain, set `BIND_HOST=0.0.0.0` and `PUBLIC_HOST=<address users can reach>`,
and open the chain P2P ports (`P2P_PORT_BASE` upward, two per chain) in your firewall. Room responses then include the chain's
genesis flags and these peer addresses. RPC always stays on loopback.
`AC_BLOCKTIME` (default 10 seconds) sets block speed, so the 101-block wait is about 17 minutes per chain.

## API

| Method and path | Purpose |
| --- | --- |
| `GET /directory` | Public rooms |
| `POST /rooms` `{name,type,owner}` | Claim a pooled chain for a new room |
| `POST /rooms/:id/faucet` `{address}` | Starter coins for a public room (rate limited) |
| `POST /rooms/:id/invites` | New single-use invite token (private rooms) |
| `POST /invites/redeem` `{token,address}` | Burn the token, send starter coins |
| `GET /rooms/:id/utxos?address=` | Spendable outputs for device-side tx building |
| `POST /rooms/:id/tx` `{hex}` | Broadcast a signed raw transaction |
| `GET /rooms/:id/messages?from=` | History from a block height |
| `WS /ws?room=:id` | New messages as blocks arrive |

## Before relying on it

- **bjson:** `src/codec.js` uses JSON as a stand-in. Replace `encode`/`decode` with your bjson library.
- **Verify against your daemon:** launch flags in `pool.js` (including `-ac_blocktime`, `-connect`, and `-dnsseed`), the `getblock` verbosity 2 output, `getaddressutxos`
  (needs `-addressindex`), and the real `OP_RETURN` size limit (set `MAX_PAYLOAD`).
- **Coin maturity:** the premine is spendable only after ~100 blocks, hence `READY_HEIGHT=101`.
- **Not done yet:** invite creation has no member authentication (see the TODO in `rooms.js`), the gateway
  returns the sender's public key rather than an address, and nothing here has been run against a live `komodod`.
