// End-to-end check against a running gateway: new identity, public room, send a message, read it back.
// Usage: GATEWAY=http://127.0.0.1:8080 node scripts/smoke.js
import { PchatClient, Key } from '../src/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = Key.generate();
const pc = new PchatClient({ gateway: process.env.GATEWAY || 'http://127.0.0.1:8080', key });

const room = await pc.createRoom('smoke-test', 'public');
console.log('room', room.id, 'address', key.address);

console.log('waiting for the starter coins to confirm (needs one new block)...');
for (let i = 0; i < 60 && (await pc.coins(room.id)).length === 0; i++) await sleep(3000);
if ((await pc.coins(room.id)).length === 0) throw new Error('No coins arrived; check the gateway log and the pool chain');

const txid = await pc.send(room.id, 'hello from pchat');
console.log('broadcast accepted, txid', txid);

console.log('waiting for the message to be mined...');
for (let i = 0; i < 60; i++) {
  const msgs = await pc.history(room.id);
  const m = msgs.find((x) => x.id === txid);
  if (m) { console.log('PASS:', JSON.stringify({ from: m.from, text: m.text, height: m.height })); process.exit(0); }
  await sleep(3000);
}
throw new Error('Message was accepted but never showed up in history');
