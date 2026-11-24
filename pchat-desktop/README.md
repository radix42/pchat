# pchat for Windows

Desktop app that runs a Komodo node on your computer for every room you join, and mines blocks for that room's
chain. Your key, signing, and message history all stay on this machine.

## What it talks to

| Traffic | Where | Notes |
| --- | --- | --- |
| Web requests | Your configured gateways, **port 8080 only** | Public room lists, room creation, faucet coins, invite redemption |
| Chain peer connections | The peers each room's gateway publishes | Made by `komodod` itself, outbound only, one set per room |
| Everything else | Nothing | No DNS seeds, no Komodo mainnet, no port mapping, no listening socket |

The app window cannot make web requests at all. Everything goes through the main process, which refuses any
address that is not in your gateway list and any port other than 8080.

**Chain peers are separate from port 8080.** Mining and syncing need `komodod` to connect to other nodes of the
room's chain. Those connections use the P2P ports the gateway listed, so the gateway operator must open them
(see "Gateway setup"). If your firewall blocks them, a room shows "Waiting for peers".

## What you need

1. Windows 10 or 11 and Node.js 20+ (to run or build the app).
2. `komodod.exe` for Windows, with its DLLs in the same folder (from a Komodo release). Choose it in Settings.
3. The Zcash parameter files in `%APPDATA%\ZcashParams`: `sapling-spend.params`, `sapling-output.params`, and
   `sprout-groth16.params`. Komodo's `fetch-params` script downloads them. Settings shows which are missing.
4. The address of at least one pchat gateway.

## Run or build

```
npm install
npm start          # run the app
npm test           # unit tests (no Electron needed)
npm run dist       # builds a Windows installer into dist/
```

## Using it

- **First run:** create an identity and write down the 24-word recovery phrase, or restore from one. The key is
  stored with Windows credential protection.
- **Settings:** add gateways (one per line), pick `komodod.exe`, and set mining threads per room.
- **Browse public rooms:** lists rooms from your gateways. Joining starts a node for the room and asks the
  faucet for starter coins.
- **New room:** a gateway assigns a fresh chain. Private rooms get a room key made on this computer.
- **Join with invite link:** paste a `pchat://join/...` link. Each link works once.
- **In a room:** the sidebar shows each node's state (starting, waiting for peers, syncing, mining with block
  height and peer count). "Mine blocks" turns mining on or off for that room. Messages appear once a block
  includes them.
- Closing the app stops every node cleanly. After a crash, leftover nodes are stopped on the next start.

## Gateway setup

The gateway must publish each room's chain details and accept connections from desktop nodes. In
`pchat-gateway`, set `BIND_HOST=0.0.0.0` and `PUBLIC_HOST=<address users can reach>`, and open the chain P2P
ports (`P2P_PORT_BASE` upward, two per chain) in the firewall. Run the updated gateway from this archive: room
responses now include a `chain` object (genesis flags and peer addresses) that the desktop app needs.

## How it fits together

- `src/core.js` holds the app logic. `main.js` is the Electron shell, `preload.cjs` is the only bridge to the page.
- `src/nodes.js` starts one `komodod` per room (random local RPC port and password, loopback only) and tracks its state.
- `src/localgateway.js` gives the shared client library (`src/pchat`) the same interface the Android app uses,
  but serves chain reads and transaction broadcasts from the local node.
- `src/scan.js` reads each room's blocks from the local node, re-checks the last few blocks so forks between
  miners settle, and joins long messages that were split into chunks.
- `src/validate.js` checks everything a gateway sends (chain names, flags, peers, room ids, invite links) before it
  reaches a command line, a file path, or the screen. Only `-ac_*` chain flags are accepted.

## Before relying on it

- **Not run on Windows.** This was written without network access or a Windows machine. The tests cover the
  parts that need neither Electron nor a node: validation, command lines, block scanning and chunk joining,
  node state tracking, the vault, and gateway access rules. `core.js`, `main.js`, and the screens have only
  had a syntax check, so expect small fixes on the first run.
- **Launch flags are unverified on Windows and for joining a chain.** The flags follow the gateway's, which
  mined successfully, plus `-connect` to the gateway's published peers. A desktop node joining an existing chain
  has not been tested.
- **Mining returns little.** Chains pay no block reward, so mining mostly keeps the room's chain moving
  (and earns transaction fees). It also uses CPU and memory for every room you have joined.
- **Package versions:** Electron and electron-builder are pinned to versions I know; run
  `npm install electron@latest electron-builder@latest -D` if you want newer ones.
- **Message history** is re-read from the local chain on each start, which is fine for small rooms.
- **Gateway invites are still unauthenticated** (see the gateway README).
