'use strict';
const S = { st: null, view: 'welcome', roomId: null, msgs: [], dir: null };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(2)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

async function call(name, ...args) {
  const r = await window.pchat.call(name, ...args);
  if (!r.ok) { const e = new Error(r.error); e.code = r.code; e.data = r.data; throw e; }
  return r.data;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 4000);
}

const short = (a) => (a ? a.slice(0, 8) : '?');

function statusText(r) {
  const peers = r.connections === undefined ? '' : ` · ${r.connections} peer${r.connections === 1 ? '' : 's'}`;
  switch (r.state) {
    case 'needs-setup': return r.error || 'Setup needed';
    case 'starting': return 'Starting node…';
    case 'connecting': return 'Waiting for peers…';
    case 'syncing': return `Syncing ${r.blocks}/${r.longest}${peers}`;
    case 'ready': return `${r.mining ? 'Mining' : 'Not mining'} · block ${r.blocks}${peers}`;
    case 'unreachable': return 'Node not responding';
    case 'error': return r.error || 'Node failed to start';
    default: return 'Stopped';
  }
}
const stateClass = (r) => (r.state === 'ready' ? 'ok' : ['needs-setup', 'error', 'unreachable'].includes(r.state) ? 'err' : 'warn');

async function refresh() { S.st = await call('state'); }

// ---- sidebar ------------------------------------------------------------------------------------
function renderSide() {
  const side = document.getElementById('side');
  side.replaceChildren();
  const st = S.st;
  side.append(h('div', { class: 'brand' }, h('b', {}, 'pchat'), st.address ? h('div', { class: 'addr' }, st.address) : null));
  if (!st.hasKey) return;
  const nav = h('div', { class: 'nav' },
    h('button', { onclick: () => show('browse') }, 'Browse public rooms'),
    h('button', { onclick: () => show('join') }, 'Join with invite link'),
    h('button', { onclick: () => show('new') }, 'New room'),
    h('button', { onclick: () => show('settings') }, 'Settings'));
  const list = h('div', { class: 'rooms' });
  if (!st.rooms.length) list.append(h('p', { class: 'mut', style: 'padding:8px' }, 'No rooms yet. Browse public rooms or paste an invite link.'));
  for (const r of st.rooms) {
    list.append(h('button', { class: 'room' + (S.view === 'chat' && S.roomId === r.id ? ' sel' : ''), onclick: () => show('chat', r.id) },
      h('div', {}, r.name, h('span', { class: 'tag' }, r.type)),
      h('div', { class: 'st ' + stateClass(r) }, statusText(r))));
  }
  side.append(nav, list);
}

function show(view, arg) {
  S.view = view;
  if (view === 'chat') { S.roomId = arg; S.msgs = []; }
  render();
}

function render() {
  renderSide();
  const main = document.getElementById('main');
  main.replaceChildren();
  if (!S.st.hasKey) return main.append(viewSetup());
  const v = { welcome: viewWelcome, browse: viewBrowse, join: viewJoin, new: viewNew, settings: viewSettings, chat: viewChat }[S.view] || viewWelcome;
  main.append(v());
}

// ---- views --------------------------------------------------------------------------------------
function viewSetup() {
  const box = h('div', { class: 'pad' });
  const words = h('textarea', { placeholder: 'word1 word2 word3 …', autocomplete: 'off', spellcheck: 'false' });
  const err = h('p', { class: 'err' });
  box.append(
    h('h1', {}, 'Welcome to pchat'),
    h('p', { class: 'mut' }, 'Your identity is a key that stays on this computer, protected by Windows. Rooms you join run their own chain on your machine, and your computer helps keep it going by mining blocks.'),
    h('button', { class: 'go', onclick: async (ev) => {
      ev.target.disabled = true;
      try {
        const { mnemonic } = await call('identityCreate');
        box.replaceChildren(h('h1', {}, 'Back up your recovery phrase'),
          h('p', { class: 'mut' }, 'These 24 words are your account. Anyone who has them can act as you, and without them a lost computer means a lost identity. Write them down somewhere safe.'),
          h('div', { class: 'card words' }, mnemonic),
          h('button', { class: 'go', onclick: async () => { await refresh(); show('welcome'); } }, 'I saved it, continue'));
      } catch (e) { err.textContent = e.message; ev.target.disabled = false; }
    } }, 'Create a new identity'),
    h('h2', {}, 'Or restore from a recovery phrase'), words, err,
    h('button', { onclick: async () => {
      try { await call('identityRestore', words.value); await refresh(); show('welcome'); } catch (e) { err.textContent = e.message; }
    } }, 'Restore identity'));
  return box;
}

function viewWelcome() {
  const st = S.st, c = st.setup;
  const box = h('div', { class: 'pad' }, h('h1', {}, 'Your rooms'),
    h('p', { class: 'mut' }, 'Every room has its own chain. Your computer runs a node for each room you join and mines blocks for it while the app is open.'));
  const problems = [];
  if (!c.komodod) problems.push('Tell pchat where komodod.exe is (Settings).');
  for (const p of c.params) if (!p.found) problems.push(`Missing ${p.file} in ${c.paramsDir}`);
  if (!st.settings.gateways.length) problems.push('Add at least one gateway (Settings) to find rooms.');
  if (problems.length) box.append(h('div', { class: 'card' }, h('b', {}, 'Before you start'), h('ul', {}, problems.map((p) => h('li', { class: 'warn' }, p)))),
    h('button', { class: 'go', onclick: () => show('settings') }, 'Open settings'));
  return box;
}

function viewBrowse() {
  const box = h('div', { class: 'pad' }, h('h1', {}, 'Public rooms'));
  const list = h('div', {}, h('p', { class: 'mut' }, 'Loading…'));
  box.append(h('p', { class: 'mut' }, 'Rooms listed by your gateways. Joining starts a node for the room and requests starter coins.'), list);
  (async () => {
    try {
      const d = await call('directory');
      list.replaceChildren();
      for (const p of d.problems) list.append(h('p', { class: 'err' }, p));
      if (!d.rooms.length && !d.problems.length) list.append(h('p', { class: 'mut' }, S.st.settings.gateways.length ? 'No public rooms yet.' : 'Add a gateway in Settings first.'));
      for (const r of d.rooms) {
        const btn = h('button', { class: 'go', disabled: r.joined, onclick: async () => {
          btn.disabled = true;
          try { const res = await call('joinPublic', { id: r.id, gateway: r.gateway }); toast(res.note); await refresh(); show('chat', r.id); }
          catch (e) { toast(e.message); btn.disabled = false; }
        } }, r.joined ? 'Joined' : 'Join');
        list.append(h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('b', {}, r.name), h('div', { class: 'mut' }, r.gateway)), btn));
      }
    } catch (e) { list.replaceChildren(h('p', { class: 'err' }, e.message)); }
  })();
  return box;
}

function viewJoin() {
  const link = h('input', { type: 'text', placeholder: 'pchat://join/…', autocomplete: 'off', spellcheck: 'false' });
  const err = h('p', { class: 'err' });
  const go = async (trust) => {
    err.textContent = '';
    try { const r = await call('joinInvite', link.value.trim(), trust); await refresh(); show('chat', r.id); }
    catch (e) {
      if (e.code === 'UNKNOWN_GATEWAY' && confirm(`${e.message}\n\nAdd it and join?`)) return go(true);
      err.textContent = e.message;
    }
  };
  return h('div', { class: 'pad' }, h('h1', {}, 'Join a private room'),
    h('p', { class: 'mut' }, 'Paste the invite link you were sent. Each link works once.'), link, err,
    h('button', { class: 'go', onclick: () => go(false) }, 'Join room'));
}

function viewNew() {
  const name = h('input', { type: 'text', placeholder: 'Room name', maxlength: '60' });
  const type = h('select', {}, h('option', { value: 'public' }, 'Public: anyone can find and read it'), h('option', { value: 'private' }, 'Private: invite only, messages encrypted'));
  const gws = S.st.settings.gateways;
  const gw = h('select', {}, gws.map((g) => h('option', { value: g }, g)));
  const err = h('p', { class: 'err' });
  return h('div', { class: 'pad' }, h('h1', {}, 'New room'),
    h('p', { class: 'mut' }, 'A gateway assigns the room a fresh chain, and your computer starts running it.'),
    h('h2', {}, 'Name'), name, h('h2', {}, 'Type'), type, h('h2', {}, 'Gateway'), gw, err,
    h('p', {}, h('button', { class: 'go', disabled: !gws.length, onclick: async (ev) => {
      ev.target.disabled = true; err.textContent = '';
      try { const r = await call('createRoom', { name: name.value, type: type.value, gateway: gw.value }); await refresh(); show('chat', r.id); }
      catch (e) { err.textContent = e.message; ev.target.disabled = false; }
    } }, 'Create room'), gws.length ? '' : h('span', { class: 'warn' }, ' Add a gateway in Settings first.')));
}

function viewSettings() {
  const s = S.st.settings, c = S.st.setup;
  const gws = h('textarea', { placeholder: 'one gateway per line, e.g. 203.0.113.10', spellcheck: 'false' });
  gws.value = s.gateways.map((g) => g.replace(/:8080$/, '')).join('\n');
  const kom = h('input', { type: 'text', placeholder: 'C:\\komodo\\komodod.exe', spellcheck: 'false' });
  kom.value = s.komodod;
  const thr = h('input', { type: 'number', min: '1', max: '8', value: String(s.threads) });
  const msg = h('p', { class: 'mut' });
  return h('div', { class: 'pad' }, h('h1', {}, 'Settings'),
    h('h2', {}, `Gateways (port ${S.st.gatewayPort})`),
    h('p', { class: 'mut' }, `Used only to list public rooms, create rooms, and request starter coins. pchat contacts them on port ${S.st.gatewayPort} and nothing else on the web.`), gws,
    h('h2', {}, 'komodod.exe'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, kom), h('button', { onclick: async () => { const p = await call('pickKomodod'); if (p) kom.value = p; } }, 'Browse…')),
    h('p', { class: c.komodod ? 'ok' : 'warn' }, c.komodod ? 'Found.' : 'Not found yet.'),
    h('h2', {}, 'Zcash parameters'),
    h('p', { class: 'mut' }, `komodod needs these files in ${c.paramsDir}`),
    h('ul', {}, c.params.map((p) => h('li', { class: p.found ? 'ok' : 'warn' }, `${p.file}: ${p.found ? 'found' : 'missing'}`))),
    h('h2', {}, 'Mining threads per room'),
    h('p', { class: 'mut' }, 'More threads find blocks faster and use more CPU and memory for every room you have joined.'), thr,
    h('h2', {}, 'Recovery phrase'),
    h('p', {}, h('button', { onclick: async () => { const r = await call('showMnemonic'); if (confirm('Anyone who sees these words can act as you. Show them now?')) alert(r.mnemonic); } }, 'Show recovery phrase'),
      S.st.encrypted ? '' : h('span', { class: 'warn' }, ' Windows credential protection is unavailable, so your key is stored unencrypted.')),
    msg,
    h('button', { class: 'go', onclick: async () => {
      try {
        S.st = await call('saveSettings', { gateways: gws.value.split(/\r?\n/), komodod: kom.value, threads: Number(thr.value) });
        msg.className = 'ok'; msg.textContent = 'Saved.'; renderSide();
      } catch (e) { msg.className = 'err'; msg.textContent = e.message; }
    } }, 'Save settings'));
}

// ---- chat ---------------------------------------------------------------------------------------
function viewChat() {
  const id = S.roomId;
  const r = S.st.rooms.find((x) => x.id === id);
  if (!r) return h('div', { class: 'pad' }, h('p', { class: 'mut' }, 'Room not found.'));
  const status = h('div', { class: 'mut', id: 'chat-status' }, statusText(r));
  const mining = h('input', { type: 'checkbox', checked: r.mining, onchange: async (ev) => { try { await call('setMining', id, ev.target.checked); } catch (e) { toast(e.message); } } });
  const actions = h('div', { class: 'row' },
    h('label', { class: 'row' }, mining, 'Mine blocks'),
    r.type === 'private'
      ? h('button', { onclick: async () => { try { const { link } = await call('invite', id); showLink(link); } catch (e) { toast(e.message); } } }, 'Invite someone')
      : h('button', { onclick: async () => { try { await call('faucet', id); toast('Starter coins requested.'); } catch (e) { toast(e.message); } } }, 'Get coins'),
    h('button', { class: 'danger', onclick: async () => {
      if (!confirm(`Leave "${r.name}"? Your node for this room will stop.`)) return;
      const del = confirm('Also delete this room\'s chain data from this computer?');
      await call('leaveRoom', id, del); await refresh(); show('welcome');
    } }, 'Leave'));
  const linkBox = h('div', { id: 'linkbox' });
  const list = h('div', { class: 'msgs', id: 'msgs' });
  const input = h('input', { type: 'text', placeholder: 'Message', maxlength: '2000', autocomplete: 'off' });
  let editing = null;
  const sendBtn = h('button', { class: 'go' }, 'Send');
  const doSend = async () => {
    const t = input.value.trim(); if (!t) return;
    sendBtn.disabled = true;
    try { if (editing) await call('edit', id, editing, t); else await call('send', id, t); input.value = ''; editing = null; sendBtn.textContent = 'Send'; toast('Sent. It appears once a block includes it.'); }
    catch (e) { toast(e.message); }
    sendBtn.disabled = false; input.focus();
  };
  sendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doSend(); });
  S.startEdit = (m) => { editing = m.id; input.value = m.text || ''; sendBtn.textContent = 'Save'; input.focus(); };
  loadMsgs();
  return h('div', { class: 'chat' },
    h('div', { class: 'chead' }, h('div', { class: 'row' }, h('b', {}, r.name), h('span', { class: 'tag' }, r.type)), status, actions, linkBox),
    list, h('div', { class: 'composer' }, input, sendBtn));
}

function showLink(link) {
  const box = document.getElementById('linkbox');
  if (!box) return;
  box.replaceChildren(h('div', { class: 'card' },
    h('div', { class: 'mut' }, 'Single-use invite link. It contains the room key, so share it only with the person you are inviting.'),
    h('div', { class: 'link' }, link),
    h('button', { onclick: async () => { await navigator.clipboard.writeText(link); toast('Copied.'); } }, 'Copy link')));
}

async function loadMsgs() {
  const id = S.roomId;
  try {
    const msgs = await call('history', id);
    if (S.view !== 'chat' || S.roomId !== id) return;
    S.msgs = msgs;
    renderMsgs();
  } catch (e) {
    const list = document.getElementById('msgs');
    if (list && !S.msgs.length) list.replaceChildren(h('p', { class: 'mut' }, 'Messages appear once this room\'s node has started and synced.'));
  }
}

function renderMsgs() {
  const list = document.getElementById('msgs');
  if (!list) return;
  const me = S.st.address;
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.replaceChildren();
  if (!S.msgs.length) list.append(h('p', { class: 'mut' }, 'No messages yet.'));
  for (const m of S.msgs) {
    const mine = m.from === me;
    const body = m.hidden ? 'Hidden by sender (still on the chain)' : m.text === null ? 'Cannot decrypt this message' : m.text;
    const meta = h('div', { class: 'meta' }, new Date((m.time || 0) * 1000).toLocaleTimeString(), m.edited ? ' · edited' : '');
    if (mine && !m.hidden) {
      meta.append(h('button', { onclick: () => S.startEdit(m) }, 'Edit'),
        h('button', { onclick: async () => { try { await call('hide', S.roomId, m.id); } catch (e) { toast(e.message); } } }, 'Hide'));
    }
    list.append(h('div', { class: 'msg' + (mine ? ' mine' : '') + (m.hidden || m.text === null ? ' gone' : '') },
      mine ? null : h('div', { class: 'who' }, short(m.from)), h('div', { class: 'body' }, body), meta));
  }
  if (atBottom) list.scrollTop = list.scrollHeight;
}

// ---- events -------------------------------------------------------------------------------------
window.pchat.on('status', (rooms) => {
  if (!S.st) return;
  S.st.rooms = rooms;
  renderSide();
  const el = document.getElementById('chat-status');
  const r = rooms.find((x) => x.id === S.roomId);
  if (el && r) el.textContent = statusText(r);
});
window.pchat.on('messages', ({ roomId }) => { if (S.view === 'chat' && S.roomId === roomId) loadMsgs(); });
window.pchat.on('toast', (m) => toast(m));

(async () => {
  try { await refresh(); render(); }
  catch (e) { document.getElementById('main').append(h('p', { class: 'err pad' }, e.message)); }
})();
