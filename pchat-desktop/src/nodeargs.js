// komodod command line for one room. No DNS seeds, no port mapping, no listening socket, and the only
// peers are the ones the room's gateway published, so the node never touches Komodo mainnet.
export function nodeArgs({ chain, pubkey, dataDir, rpc, p2pPort, mine, threads = 1 }) {
  const t = Math.max(1, Math.min(Math.floor(+threads) || 1, 8));
  const args = [`-ac_name=${chain.name}`, ...chain.flags, `-pubkey=${pubkey}`];
  if (mine) args.push('-gen', `-genproclimit=${t}`);
  args.push(
    '-server=1', '-txindex=1', '-addressindex=1', '-timestampindex=1', '-spentindex=1',
    `-rpcuser=${rpc.user}`, `-rpcpassword=${rpc.pass}`, `-rpcport=${rpc.port}`,
    '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1',
    `-port=${p2pPort}`, '-listen=0', '-dnsseed=0', '-upnp=0',
    ...chain.peers.map((p) => `-connect=${p}`),
    `-datadir=${dataDir}`,
  );
  return args;
}
