// Prints a fresh faucet key pair for the gateway: FAUCET_PUBKEY (premine recipient) and FAUCET_WIF.
// Keep the output secret; anyone with the WIF controls the faucet's coins.
import { Key } from '../src/keys.js';

const k = Key.generate();
console.log(`export FAUCET_PUBKEY=${k.pubHex}`);
console.log(`export FAUCET_WIF=${k.toWif()}`);
