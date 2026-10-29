'use strict';

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Request cancelled.'), { code: 'CANCELLED' }));
    }, { once: true });
  });
}

function retryAfterMs(response) {
  const header = response?.headers?.get?.('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

function transientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

class OpenAICompatibleProvider {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.AI_PROVIDER_URL || 'https://api.key4u.vn/v1/chat/completions';
    this.apiKey = options.apiKey || process.env.AI_PROVIDER_API_KEY || process.env.KEY4U_API_KEY || '';
    this.fetch = options.fetch || globalThis.fetch;
    this.timeoutMs = Number(options.timeoutMs || process.env.AI_PROVIDER_TIMEOUT_MS || 45_000);
    this.maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 1;
    if (typeof this.fetch !== 'function') throw new Error('A fetch implementation is required.');
  }

  async complete({ model, messages, signal, maxRetries }) {
    if (!this.apiKey) throw Object.assign(new Error('Provider credential is not configured.'), { code: 'PROVIDER_AUTH' });
    let lastError;
    const retryLimit = Number.isInteger(maxRetries) ? Math.max(0, maxRetries) : this.maxRetries;
    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      try {
        const result = await this.completeOnce({ model, messages, signal });
        return { ...result, retryAttempts: attempt };
      } catch (error) {
        lastError = error;
        if (signal?.aborted || error.code === 'CANCELLED' || !error.transient || attempt === retryLimit) throw error;
        const backoff = error.retryAfterMs ?? Math.min(4_000, 250 * (2 ** attempt) + Math.floor(Math.random() * 150));
        await sleep(backoff, signal);
      }
    }
    throw lastError;
  }

  async completeOnce({ model, messages, signal }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0 })
      });
      if (!response.ok) {
        const error = Object.assign(new Error(`Provider returned HTTP ${response.status}.`), {
          code: response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_ERROR',
          status: response.status,
          transient: transientStatus(response.status),
          retryAfterMs: retryAfterMs(response)
        });
        throw error;
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw Object.assign(new Error('Provider returned no final content.'), { code: 'INVALID_RESPONSE' });
      return {
        content,
        actualModel: typeof data.model === 'string' ? data.model : null,
        providerRequestId: response.headers.get('x-request-id') || data.id || null,
        usage: data.usage || null
      };
    } catch (cause) {
      if (cause.name === 'AbortError') {
        throw Object.assign(new Error(signal?.aborted ? 'Request cancelled.' : 'Provider timeout.'), { code: signal?.aborted ? 'CANCELLED' : 'MODEL_TIMEOUT', transient: false });
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}

module.exports = { OpenAICompatibleProvider };
