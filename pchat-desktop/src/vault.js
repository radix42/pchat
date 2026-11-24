import fs from 'node:fs';

// Small encrypted key/value file. `cipher` wraps the OS credential store (Windows DPAPI via Electron's
// safeStorage). Without a cipher values are stored as plain text and flagged `enc:false`.
export class Vault {
  constructor({ file, cipher = null }) {
    this.file = file;
    this.cipher = cipher;
    this.data = {};
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new vault */ }
  }
  get encrypted() { return !!this.cipher; }
  has(name) { return name in this.data; }
  get(name) {
    const e = this.data[name];
    if (!e) return null;
    try {
      const raw = Buffer.from(e.data, 'base64');
      if (!e.enc) return raw.toString('utf8');
      return this.cipher ? this.cipher.decrypt(raw) : null;
    } catch { return null; }
  }
  set(name, value) {
    const enc = !!this.cipher;
    const buf = enc ? this.cipher.encrypt(String(value)) : Buffer.from(String(value), 'utf8');
    this.data[name] = { enc, data: Buffer.from(buf).toString('base64') };
    this.flush();
  }
  delete(name) { delete this.data[name]; this.flush(); }
  flush() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
