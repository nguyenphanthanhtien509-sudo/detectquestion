'use strict';

const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const error = (code, message = code) => Object.assign(new Error(message), { code });

class Esp32SerialTransport {
  constructor(options = {}) {
    this.path = options.path || process.env.ESP32_SERIAL_PORT;
    this.timeoutMs = options.timeoutMs || 60000;
    this.openDelayMs = options.openDelayMs ?? 1000;
    this.portFactory = options.portFactory;
    this.events = new EventEmitter();
    this.events.setMaxListeners(32);
    this.queue = Promise.resolve();
    this.rx = ''; this.port = null; this.opening = null;
    this.maxBodyBytes = 1500000;
    this.maxResponseBytes = 262144;
    this.chunkBytes = 768; // Old firmware fallback; negotiated per handshake.
  }

  async open() {
    if (this.port?.isOpen) return;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      let factory = this.portFactory;
      if (!factory) {
        const { SerialPort } = require('serialport');
        let path = this.path;
        if (!path) {
          const candidates = (await SerialPort.list()).filter(port => /^303a$/i.test(port.vendorId || ''));
          if (candidates.length !== 1) throw error('USB_PORT_REQUIRED', 'Set ESP32_SERIAL_PORT to the gateway COM port.');
          path = candidates[0].path;
        }
        factory = process.platform === 'win32'
          ? () => new (require('./WindowsSerialPort').WindowsSerialPort)(path)
          : () => new SerialPort({ path, baudRate: 115200, autoOpen: false });
      }
      const port = factory();
      port.on('data', chunk => this.receive(chunk));
      const failed = () => { if (this.port === port) { this.port = null; this.rx = ''; this.events.emit('disconnected'); } };
      port.on('error', failed); port.on('close', failed);
      this.port = port;
      try {
        await new Promise((resolve, reject) => port.isOpen ? resolve() : port.open(err => err ? reject(err) : resolve()));
        // Native USB CDC on the S3 needs the host to assert DTR. Without
        // this Windows can open COM successfully but return no CDC data.
        await new Promise((resolve, reject) => port.set({ dtr: true, rts: false }, err => err ? reject(err) : resolve()));
        // Sending before the Windows CDC endpoint settles can leave its
        // first overlapped write pending indefinitely on a freshly reset S3.
        if (this.openDelayMs) await new Promise(resolve => setTimeout(resolve, this.openDelayMs));
      } catch (cause) {
        if (port.isOpen) await new Promise(resolve => port.close(() => resolve()));
        this.port = null; throw error('USB_OPEN_FAILED', cause.message);
      }
    })().finally(() => { this.opening = null; });
    return this.opening;
  }

  receive(chunk) {
    this.rx += chunk.toString('utf8'); // Protocol frames themselves are ASCII.
    let newline;
    while ((newline = this.rx.indexOf('\n')) >= 0) {
      const line = this.rx.slice(0, newline).trim(); this.rx = this.rx.slice(newline + 1);
      if (line.length > 24000) { this.events.emit('disconnected'); continue; }
      let frame;
      try { frame = JSON.parse(line); } catch (_) { continue; } // Ignore ROM boot diagnostics.
      if (frame?.v === 1 && typeof frame.id === 'string') this.events.emit('frame', frame);
    }
    if (this.rx.length > 24000) { this.rx = ''; this.events.emit('disconnected'); }
  }

  write(frame) {
    if (!this.port?.isOpen) return Promise.reject(error('USB_DISCONNECTED'));
    const bytes = Buffer.from(JSON.stringify({ ...frame, v: 1 }) + '\n', 'utf8');
    return new Promise((resolve, reject) => this.port.write(bytes, cause => cause ? reject(error('USB_WRITE_FAILED')) : resolve()));
  }

  wait(id, signal, consume, send) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (cause, result) => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        this.events.off('frame', onFrame); this.events.off('disconnected', onClose);
        signal?.removeEventListener('abort', onAbort);
        cause ? reject(cause) : resolve(result);
      };
      const onFrame = frame => {
        if (frame.id !== id) return;
        if (frame.type === 'error') {
          const cause = error(frame.code || 'USB_DEVICE_ERROR');
          cause.status = Number(frame.httpStatus) || undefined;
          if (frame.tlsCode) { cause.tlsCode = Number(frame.tlsCode); cause.tlsMessage = String(frame.tlsMessage || '').slice(0, 128); }
          finish(cause); return;
        }
        try { const result = consume(frame); if (result !== undefined) finish(null, result); }
        catch (cause) { finish(cause); }
      };
      const onClose = () => finish(error('USB_DISCONNECTED'));
      const onAbort = () => finish(signal.reason || error('CANCELLED'));
      // request() owns the operation deadline, including queue and upload.
      // Do not replace a caller's longer deadline with the default timeout.
      const timer = signal ? null : setTimeout(() => finish(error('USB_TIMEOUT')), this.timeoutMs);
      this.events.on('frame', onFrame); this.events.once('disconnected', onClose);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      Promise.resolve().then(send).catch(cause => finish(cause));
    });
  }

  exchange(frame, expected, signal) {
    let retry;
    return this.wait(frame.id, signal, response => response.type === expected ? response : undefined, () => {
      // The first packet can be lost while Windows finishes opening CDC.
      // Only retry the read-only handshake, never an upload or API call.
      if (frame.type === 'hello') retry = setInterval(() => { this.write(frame).catch(() => {}); }, 500);
      return this.write(frame);
    }).finally(() => clearInterval(retry));
  }

  async ready(signal, waitForIdle = true) {
    for (;;) {
      const status = await this.exchange({ id: randomUUID(), type: 'hello' }, 'status', signal);
      if (status.device !== 'detect-question-esp32s3') throw error('USB_WRONG_DEVICE');
      this.maxBodyBytes = Math.min(1500000, Number(status.maxBodyBytes) || 0);
      this.maxResponseBytes = Math.min(262144, Number(status.maxResponseBytes) || 0);
      const chunkBytes = Number(status.chunkBytes);
      this.chunkBytes = Number.isInteger(chunkBytes) && chunkBytes >= 256 && chunkBytes <= 4096 ? chunkBytes : 768;
      if (status.supportsTimeSync === true && status.clockReady === false) {
        await this.exchange({ id: randomUUID(), type: 'sync_time', epochSeconds: Math.floor(Date.now() / 1000) }, 'time_synced', signal);
      }
      if (!waitForIdle || !status.busy) return status;
      await new Promise(resolve => setTimeout(resolve, 100));
      if (signal?.aborted) throw signal.reason || error('CANCELLED');
    }
  }

  // A physical dongle has one HTTPS worker. Queue complete operations, not
  // individual chunks. Abort/deadline includes time spent waiting in this queue.
  request(op, body, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(error('CANCELLED'));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(error('MODEL_TIMEOUT')), options.timeoutMs || this.timeoutMs);
    const job = this.queue.then(async () => {
      if (controller.signal.aborted) throw controller.signal.reason;
      await this.open();
      const status = await this.ready(controller.signal, op !== 'status');
      if (op === 'status') return status;
      if (op === 'configure') return this.exchange({ ...body, id: randomUUID(), type: 'configure' }, 'configured', controller.signal);
      if (op === 'sync_time') return this.exchange({ ...body, id: randomUUID(), type: 'sync_time' }, 'time_synced', controller.signal);
      if (op === 'network_probe') return this.exchange({ id: randomUUID(), type: 'network_probe' }, 'network_probe', controller.signal);
      return this.transfer(op, body, controller.signal);
    });
    this.queue = job.catch(() => {});
    // Return cancellation immediately even while another operation owns USB.
    let listener;
    const aborted = new Promise((_, reject) => {
      listener = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', listener, { once: true });
      if (controller.signal.aborted) listener();
    });
    return Promise.race([job, aborted]).finally(() => {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', listener);
    });
  }

  async transfer(op, body, signal) {
    const id = randomUUID();
    const bytes = Buffer.from(JSON.stringify(body), 'utf8');
    if (!bytes.length || bytes.length > this.maxBodyBytes) throw error('USB_PAYLOAD_TOO_LARGE');
    let started = false;
    try {
      started = true;
      await this.exchange({ id, type: 'begin', op, bytes: bytes.length }, 'ready', signal);
      for (let offset = 0, seq = 0; offset < bytes.length; offset += this.chunkBytes, seq += 1) {
        const ack = await this.exchange({ id, type: 'chunk', seq, data: bytes.subarray(offset, offset + this.chunkBytes).toString('base64') }, 'chunk_ack', signal);
        if (ack.seq !== seq) throw error('USB_SEQUENCE_MISMATCH');
      }
      const chunks = []; let count = 0;
      return await this.wait(id, signal, frame => {
        if (frame.type === 'result_chunk') {
          if (frame.seq !== chunks.length || typeof frame.data !== 'string' ||
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(frame.data)) throw error('USB_INVALID_RESPONSE');
          const chunk = Buffer.from(frame.data, 'base64'); count += chunk.length;
          if (count > this.maxResponseBytes) throw error('USB_RESPONSE_TOO_LARGE');
          chunks.push(chunk);
        } else if (frame.type === 'result_end') {
          if (frame.bytes !== count || frame.chunks !== chunks.length) {
            throw error('USB_SIZE_MISMATCH', `USB_SIZE_MISMATCH: received ${count}/${frame.bytes} bytes and ${chunks.length}/${frame.chunks} chunks.`);
          }
          try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch (_) { throw error('INVALID_RESPONSE'); }
        }
        return undefined;
      }, () => this.write({ id, type: 'end' }));
    } catch (cause) {
      if (started) await this.write({ id, type: 'cancel' }).catch(() => {});
      throw cause;
    }
  }

  async close() {
    const port = this.port;
    if (port?.isOpen) await new Promise(resolve => port.close(() => resolve()));
  }
}

let shared;
function sharedEsp32Transport() { return shared || (shared = new Esp32SerialTransport()); }
module.exports = { Esp32SerialTransport, sharedEsp32Transport };
