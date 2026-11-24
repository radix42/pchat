# pchat

Chat app where every room is its own Komodo assetchain.

| Folder | What it is |
| --- | --- |
| `pchat-gateway/` | Node.js gateway: chain pool (two mining nodes per room), rooms, invites, relay, WebSocket |
| `pchat-client/` | Shared JavaScript client library: keys, transaction signing, encryption, API client |
| `pchat-android/` | React Native (Expo) Android app. `src/pchat` is a copy of `pchat-client/src` |
| `pchat-desktop/` | Electron app for Windows: runs a local node per room and mines for it. `src/pchat` is a copy of `pchat-client/src` |
| `docs/` | Browser prototype (`pchat-prototype.html`) and the session export |

Each folder has its own README with setup steps. Gateway code lives in `pchat-gateway/src/`; run it from
`pchat-gateway/` with `npm start`. The desktop app needs the updated gateway in this archive.
