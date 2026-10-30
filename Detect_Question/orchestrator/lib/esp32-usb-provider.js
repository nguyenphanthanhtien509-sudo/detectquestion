'use strict';
const { sharedEsp32Transport } = require('../../desktop/usb/Esp32SerialTransport');
const queues = new WeakMap();

class Esp32UsbProvider {
  constructor(options = {}) { this.transport = options.transport || sharedEsp32Transport(); }
  acquire(signal) {
    let queue = queues.get(this.transport);
    if (!queue) { queue = { busy: false, waiting: [] }; queues.set(this.transport, queue); }
    return new Promise((resolve, reject) => {
      const cancelled = () => {
        const index = queue.waiting.indexOf(start);
        if (index >= 0) queue.waiting.splice(index, 1);
        reject(signal.reason || Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }));
      };
      const start = () => {
        signal?.removeEventListener('abort', cancelled);
        queue.busy = true;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          const next = queue.waiting.shift();
          if (next) next(); else queue.busy = false;
        });
      };
      if (signal?.aborted) return cancelled();
      signal?.addEventListener('abort', cancelled, { once: true });
      if (queue.busy) queue.waiting.push(start); else start();
    });
  }
  async complete({ model, messages, signal, timeoutMs }) {
    let data;
    try { data = await this.transport.request('complete', { model, messages, temperature: 0, stream: false }, { signal, timeoutMs }); }
    catch (cause) {
      // Do not hide transport failures or retry a cancelled operation.
      if (cause.status === 401 || cause.status === 403) cause.code = 'PROVIDER_AUTH';
      throw cause;
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw Object.assign(new Error('Gateway returned no model content.'), { code: 'INVALID_RESPONSE' });
    return {
      content,
      actualModel: typeof data.model === 'string' ? data.model : null,
      providerRequestId: typeof data.id === 'string' ? data.id : null,
      usage: data.usage || null,
      gatewayDiagnostics: data.gatewayDiagnostics || null,
      retryAttempts: 0
    };
  }
}
module.exports = { Esp32UsbProvider };
