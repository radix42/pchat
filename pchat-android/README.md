# pchat for Android

React Native (Expo) app that reuses the client library (`src/pchat`), so keys, signing, and encryption stay on the device.

## Screens

- **Setup:** create an identity and back up its 24-word phrase, or restore from a phrase.
- **Home:** your rooms, the public room directory, create a room (public or private), paste an invite link.
- **Chat:** live messages, send, edit or hide your own (long-press), invite to private rooms, get coins in public rooms.
- Opening a `pchat://join/...` link redeems the single-use invite and enters the room.

## Run

1. `npm install`
2. `npx expo install react react-native expo-secure-store expo-build-properties react-native-get-random-values react-native-url-polyfill react-native-safe-area-context fast-text-encoding`
   (this picks the versions that match your Expo SDK, so don't edit those by hand)
3. Start the gateway and set `GATEWAY_URL` in `src/config.js` (the emulator reaches your machine at `10.0.2.2`).
4. `npx expo run:android` (a development build, so the `pchat://` scheme works; Expo Go will not handle it).

The client code lives in `src/pchat/`, a plain copy of `pchat-client/src`. It is copied in, not linked, because
Metro (the bundler) struggles with symlinked packages. After changing the client library, copy its `src/*.js` files
here again.

## Before relying on it

- **Not built or run:** this was written without network access or an Android toolchain, so nothing has been
  installed, compiled, or tested. Expect small fixes on the first build.
- **Hermes and BigInt:** The client code uses BigInt for transaction amounts. Use a recent React Native with Hermes.
- **Metro and package exports:** the crypto libraries need package-exports support, on by default in recent Expo SDKs.
- **Messages appear after a block is mined,** so a just-sent message shows as "Sending to the chain" until then.
- **Cleartext traffic** is allowed for development only. Use https and remove it in `app.json` for release.
- **Secure storage:** the identity key and room keys sit in the Android Keystore-backed secure store. Add a
  biometric or PIN gate before shipping.
- **Gateway invites:** the gateway does not yet authenticate invite requests (see its README).
