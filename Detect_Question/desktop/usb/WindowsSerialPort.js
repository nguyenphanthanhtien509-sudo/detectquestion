'use strict';
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash } = require('crypto');

function helperPath() {
  const bundled = path.join(__dirname, 'bin', 'SerialBridge.exe');
  if (!process.pkg) return bundled;
  const bytes = fs.readFileSync(bundled);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'DetectQuestionBackend', 'serial-bridge');
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, digest.slice(0, 16) + '.exe');
  let valid = false;
  try { valid = createHash('sha256').update(fs.readFileSync(destination)).digest('hex') === digest; } catch (_) {}
  if (!valid) fs.writeFileSync(destination, bytes);
  return destination;
}

class WindowsSerialPort extends EventEmitter {
  constructor(portPath) { super(); this.path = portPath; this.isOpen = false; this.child = null; }
  open(callback) {
    let executable;
    try { executable = helperPath(); }
    catch (cause) { callback(cause); return; }
    if (!fs.existsSync(executable)) { callback(new Error('Build the Windows Serial bridge with tools/build_serial_bridge.ps1 first.')); return; }
    const child = this.child = spawn(executable, [this.path], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let pending = true, initial = '', stderr = '';
    const timeout = setTimeout(() => { if (pending) { pending = false; callback(new Error('Serial bridge open timed out.')); child.kill(); } }, 5000);
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-512); });
    child.stdout.on('data', data => {
      if (!pending) { this.emit('data', data); return; }
      initial += data.toString('utf8');
      const newline = initial.indexOf('\n');
      if (newline < 0) return;
      let control;
      try { control = JSON.parse(initial.slice(0, newline)); } catch (_) {}
      if (control?.serialBridge !== 'ready') return;
      pending = false; clearTimeout(timeout); this.isOpen = true;
      callback();
      const rest = initial.slice(newline + 1);
      if (rest) this.emit('data', Buffer.from(rest));
    });
    child.on('error', cause => {
      clearTimeout(timeout);
      if (pending) { pending = false; callback(cause); }
      else this.emit('error', cause);
    });
    child.on('exit', () => {
      clearTimeout(timeout); this.isOpen = false;
      if (pending) { pending = false; callback(new Error(stderr.trim() || 'Serial bridge exited before opening the port.')); }
      this.emit('close');
    });
    child.stdin.on('error', cause => { if (this.isOpen) this.emit('error', cause); });
  }
  set(options, callback) {
    callback(options.dtr === true && options.rts === false ? null : new Error('Unsupported CDC control-line configuration.'));
  }
  write(bytes, callback) {
    if (!this.isOpen) { callback(new Error('Serial port is closed.')); return; }
    this.child.stdin.write(bytes, callback);
  }
  close(callback) {
    const child = this.child;
    if (!child || child.exitCode !== null) { this.isOpen = false; callback(); return; }
    const timer = setTimeout(() => child.kill(), 2000);
    child.once('exit', () => { clearTimeout(timer); callback(); });
    child.stdin.end();
  }
}
module.exports = { WindowsSerialPort };
