export async function rpcCall(port, pass, method, params = [], { user = 'pchat', timeout = 15000, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'pchat', method, params }),
    signal: AbortSignal.timeout(timeout),
  });
  let j;
  try { j = await res.json(); } catch { throw new Error(`${method}: bad response (${res.status})`); }
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
