import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';

const file = path.join(cfg.dataDir, 'state.json');
// pool: [{name,rpcPort,p2pPort,status,roomId,pid}], rooms: [{id,name,type,chain,created}], invites: {sha256(token): {roomId,used}}
export const state = { pool: [], rooms: [], invites: {}, seq: 0 };

export function load() {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  if (fs.existsSync(file)) Object.assign(state, JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, file);
}
