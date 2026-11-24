const env = process.env;
export const cfg = {
  port: +env.PORT || 8080,
  komodod: env.KOMODOD_BIN || 'komodod',
  dataDir: env.DATA_DIR || './data',
  rpcUser: env.RPC_USER || 'pchat',
  rpcPass: env.RPC_PASS || 'change-me',
  rpcBase: +env.RPC_PORT_BASE || 18000,
  p2pBase: +env.P2P_PORT_BASE || 19000,
  poolTarget: +env.POOL_TARGET || 4,
  acSupply: +env.AC_SUPPLY || 1000000,
  // premined coinbase matures after ~100 blocks, so a chain is only "free" past this height
  readyHeight: +env.READY_HEIGHT || 101,
  bindHost: env.BIND_HOST || '127.0.0.1', // interface the chain nodes listen on
  acBlocktime: +env.AC_BLOCKTIME || 10, // seconds per block; shorter means the premine matures sooner
  faucetPubkey: env.FAUCET_PUBKEY,
  faucetWif: env.FAUCET_WIF,
  dripAmount: +env.DRIP_AMOUNT || 0.01,
  faucetCooldownMs: +env.FAUCET_COOLDOWN_MS || 3600_000,
  extraFlags: (env.KOMODOD_FLAGS || '').split(' ').filter(Boolean),
};
