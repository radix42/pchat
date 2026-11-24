import { app, BrowserWindow, ipcMain, safeStorage, dialog, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PchatCore } from './src/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let win = null, core = null, quitting = false;

if (!app.requestSingleInstanceLock()) app.quit(); // two copies would fight over the same chain data

const send = (evt, data) => { if (win && !win.isDestroyed()) win.webContents.send('pchat-event:' + evt, data); };

function handle(name, fn) {
  ipcMain.handle('pchat:' + name, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message, code: e.code, data: e.data }; }
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 760, minHeight: 520, title: 'pchat',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  await win.loadFile(path.join(here, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  // The page never talks to the network itself; everything goes through the main process.
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^(https?|wss?|ftp):/i.test(d.url) }));

  const cipher = safeStorage.isEncryptionAvailable()
    ? { encrypt: (s) => safeStorage.encryptString(s), decrypt: (b) => safeStorage.decryptString(b) }
    : null;
  core = new PchatCore({ userData: app.getPath('userData'), cipher, emit: send });
  await core.init();

  handle('state', () => core.state());
  handle('identityCreate', () => core.identityCreate());
  handle('identityRestore', (w) => core.identityRestore(w));
  handle('showMnemonic', () => core.showMnemonic());
  handle('saveSettings', (s) => core.saveSettings(s));
  handle('pickKomodod', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Select komodod.exe', properties: ['openFile'], filters: [{ name: 'Programs', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('directory', () => core.directory());
  handle('joinPublic', (a) => core.joinPublic(a));
  handle('createRoom', (a) => core.createRoom(a));
  handle('joinInvite', (l, t) => core.joinInvite(l, t));
  handle('leaveRoom', (id, del) => core.leaveRoom(id, del));
  handle('setMining', (id, on) => core.setMining(id, on));
  handle('history', (id) => core.history(id));
  handle('send', (id, t) => core.send(id, t));
  handle('edit', (id, ref, t) => core.edit(id, ref, t));
  handle('hide', (id, ref) => core.hide(id, ref));
  handle('invite', (id) => core.invite(id));
  handle('faucet', (id) => core.faucet(id));

  await createWindow();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

// Stop every komodod cleanly before exiting, so no node is left holding a chain's data folder.
app.on('before-quit', (e) => {
  if (quitting || !core) return;
  e.preventDefault();
  quitting = true;
  core.shutdown().finally(() => app.quit());
});
