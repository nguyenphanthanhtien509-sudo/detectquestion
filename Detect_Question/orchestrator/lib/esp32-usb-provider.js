'use strict';
const { sharedEsp32Transport } = require('../../desktop/usb/Esp32SerialTransport');

class Esp32UsbProvider {
  constructor(options = {}) { this.transport = options.transport || sharedEsp32Transport(); }
  async complete({ model, messages, signal }) {
    let data;
    try { data = await this.transport.request('complete', { model, messages, temperature: 0, stream: false }, { signal }); }
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
      retryAttempts: 0
    };
  }
}
module.exports = { Esp32UsbProvider };
