import { cfg } from './config.js';

const auth = 'Basic ' + Buffer.from(`${cfg.rpcUser}:${cfg.rpcPass}`).toString('base64');

export async function rpc(port, method, params = []) {
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'pchat', method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

// Calls the first reachable node of a chain. Falls through only on connection failures, never on RPC errors.
export async function rpcChain(c, method, params = []) {
  let last;
  for (const n of c.nodes) {
    try { return await rpc(n.rpcPort, method, params); }
    catch (e) {
      if (!/fetch failed|ECONNREFUSED/i.test(e.message + (e.cause?.code || ''))) throw e;
      last = e;
    }
  }
  throw last;
}
