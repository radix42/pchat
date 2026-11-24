import fs from 'node:fs';

// A JSON file with atomic saves. Object defaults are merged with what is on disk; array defaults are replaced.
export class JsonFile {
  constructor(file, defaults) {
    this.file = file;
    let disk;
    try { disk = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { disk = undefined; }
    if (Array.isArray(defaults)) this.value = Array.isArray(disk) ? disk : defaults;
    else this.value = { ...defaults, ...(disk && typeof disk === 'object' ? disk : {}) };
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.value, null, 1));
    fs.renameSync(tmp, this.file);
  }
}
