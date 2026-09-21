import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
export const tclString = s => `{${s.replaceAll('\\', '/')}}`;

export class OpenMsx {
  constructor({ rom = null, visual = false, machine = 'V9968_Basic', diskDirectory = null } = {}) {
    this.ipc = resolve(root, `.local/ipc-${process.pid}-${Date.now()}`);
    this.ready = this.start({ rom, visual, machine, diskDirectory });
  }
  async start({ rom, visual, machine, diskDirectory }) {
    await mkdir(this.ipc, { recursive: true });
    const args = ['-machine', machine, '-script', resolve(root, 'emulator/bridge.tcl')];
    if (rom) args.push('-cart', resolve(root, rom), '-romtype', 'Normal');
    if (diskDirectory) args.push('-script',resolve(root,'emulator/disk.tcl'));
    this.child = spawn(resolve(root, '.local/openmsx/openmsx.exe'), args, {
      cwd: root, windowsHide: true,
      env: { ...process.env, OPENMSX_SYSTEM_DATA: resolve(root, '.local/openmsx/share'),
        OPENMSX_HOME: resolve(root, '.local/home'), OPENMSX_USER_DATA: resolve(root, '.local/user'),
        V9968_IPC_DIRECTORY: this.ipc, V9968_VISUAL: visual ? '1' : '0',
        ...(diskDirectory?{V9968_DISK:resolve(diskDirectory)}:{}) }
    });
    this.stderr = '';
    this.child.stderr.on('data', data => { this.stderr += data; });
    this.stdout = '';
    this.child.stdout.on('data', data => { this.stdout = (this.stdout + data).slice(-8192); });
    this.closed = new Promise(r => this.child.on('exit', r));
    this.child.on('error', error => { this.startError = error; });
    await this.waitFile('ready');
  }
  async waitFile(name, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.startError) throw this.startError;
      if (this.child.exitCode !== null) throw new Error(`openMSX exited (${this.child.exitCode}): ${this.stderr}`);
      try { return await readFile(resolve(this.ipc, name), 'utf8'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      await delay(10);
    }
    this.child.kill();
    throw new Error(`Timeout waiting for openMSX: ${name}\n${this.stderr}${this.stdout}`);
  }
  async command(command) {
    await this.ready;
    const pending = resolve(this.ipc, 'request.tmp');
    await writeFile(pending, Buffer.from(command).toString('hex'));
    await rename(pending, resolve(this.ipc, 'request'));
    const reply = await this.waitFile('reply');
    await unlink(resolve(this.ipc, 'reply'));
    const [code, hex] = reply.trimEnd().split(/\r?\n/);
    const result = Buffer.from(hex ?? '', 'hex').toString();
    if (code !== '0') throw new Error(result);
    return result;
  }
  async advance(seconds) {
    await this.command(`set ::test_wait 0; after time ${seconds} {set ::test_wait 1}`);
    const deadline = Date.now() + Math.max(30000, seconds*2000);
    while (await this.command('set ::test_wait') !== '1') {
      if (Date.now()>deadline) throw new Error('Emulated time did not advance');
      await delay(10);
    }
  }
  async type(text) {
    const hex = Buffer.from(text, 'ascii').toString('hex');
    await this.command(`type_via_keybuf [binary format H* ${hex}]`);
  }
  async screen() { return this.command('get_screen'); }
  async stop() {
    if (!this.child) return;
    if (this.child.exitCode === null) {
      try { await this.command('after realtime 0.1 exit'); } catch { this.child.kill(); }
    }
    const timer = setTimeout(() => this.child.kill(), 3000);
    await this.closed;
    clearTimeout(timer);
  }
}
