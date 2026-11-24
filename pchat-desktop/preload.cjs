const { contextBridge, ipcRenderer } = require('electron');

const CALLS = ['state', 'identityCreate', 'identityRestore', 'showMnemonic', 'saveSettings', 'pickKomodod', 'directory',
  'joinPublic', 'createRoom', 'joinInvite', 'leaveRoom', 'setMining', 'history', 'send', 'edit', 'hide', 'invite', 'faucet'];
const EVENTS = ['status', 'messages', 'toast'];

contextBridge.exposeInMainWorld('pchat', {
  call: (name, ...args) => (CALLS.includes(name)
    ? ipcRenderer.invoke('pchat:' + name, ...args)
    : Promise.resolve({ ok: false, error: 'Unknown call' })),
  on: (evt, fn) => {
    if (!EVENTS.includes(evt)) return () => {};
    const h = (_e, data) => fn(data);
    ipcRenderer.on('pchat-event:' + evt, h);
    return () => ipcRenderer.removeListener('pchat-event:' + evt, h);
  },
});
