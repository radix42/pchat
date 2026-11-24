import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../src/vault.js';
import { JsonFile } from '../src/jsonfile.js';
import { GwHttp } from '../src/gwhttp.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pchat-v-'));
const rot = { encrypt: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)), decrypt: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString() };

test('vault encrypts through the cipher and survives a restart', () => {
  const file = path.join(tmp(), 'v.json');
  const v = new Vault({ file, cipher: rot });
  v.set('identity', 'secret-key');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('secret-key'));
  assert.equal(new Vault({ file, cipher: rot }).get('identity'), 'secret-key');
  assert.equal(new Vault({ file, cipher: null }).get('identity'), null, 'encrypted values are unreadable without the cipher');
  v.delete('identity');
  assert.equal(v.get('identity'), null);
});

test('vault without a cipher still works and says so', () => {
  const v = new Vault({ file: path.join(tmp(), 'v.json') });
  v.set('a', 'b');
  assert.equal(v.get('a'), 'b');
  assert.equal(v.encrypted, false);
});

test('json files merge defaults and save atomically', () => {
  const file = path.join(tmp(), 's.json');
  const j = new JsonFile(file, { gateways: [], threads: 1 });
  j.value.threads = 3; j.save();
  assert.deepEqual(new JsonFile(file, { gateways: [], threads: 1, extra: true }).value, { gateways: [], threads: 3, extra: true });
  assert.deepEqual(new JsonFile(path.join(tmp(), 'r.json'), []).value, []);
});

test('gateway client only talks to configured gateways and reports errors plainly', async () => {
  const seen = [];
  const fetchImpl = async (url, o) => { seen.push([url, o.method]); return { ok: true, status: 200, json: async () => [{ id: 'x' }] }; };
  const allowed = ['http://gw.example:8080'];
  const g = new GwHttp('gw.example', { allowed: () => allowed, fetchImpl });
  assert.deepEqual(await g.directory(), [{ id: 'x' }]);
  assert.deepEqual(seen, [['http://gw.example:8080/directory', 'GET']]);
  await assert.rejects(() => new GwHttp('other.example', { allowed: () => allowed, fetchImpl }).directory(), /not in your settings/);
  const bad = new GwHttp('gw.example', { allowed: () => allowed, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'Faucet cooldown' }) }) });
  await assert.rejects(() => bad.faucet('a1b2c3d4e5f6', 'R1'), /Faucet cooldown/);
  const down = new GwHttp('gw.example', { allowed: () => allowed, fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } });
  await assert.rejects(() => down.directory(), /Cannot reach http:\/\/gw.example:8080 \(ECONNREFUSED\)/);
});
