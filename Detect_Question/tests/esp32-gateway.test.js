'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Esp32SerialTransport } = require('../desktop/usb/Esp32SerialTransport');
const { Esp32UsbProvider } = require('../orchestrator/lib/esp32-usb-provider');
const { createServer } = require('../orchestrator/server');
const { AdaptiveDebateOrchestrator } = require('../orchestrator/lib/orchestrator');

test('ESP model timeout starts after queue admission; global deadline still bounds waiting', async () => {
  let active = 0, maximum = 0, calls = 0;
  const transport = { async request(op, body, { signal }) {
    calls++; active++; maximum = Math.max(maximum, active);
    try {
      await new Promise((resolve, reject) => {
        const stop = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 300);
        signal.addEventListener('abort', stop, { once: true });
        if (signal.aborted) stop();
      });
      return { model: body.model, choices: [{ message: { content: 'OK' } }] };
    } finally { active--; }
  } };
  const provider = new Esp32UsbProvider({ transport });
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['a', 'b', 'c'] });
  const deadlineAt = Date.now() + 3000;
  const results = await Promise.all(['a', 'b', 'c'].map(model => engine.call(model, [], null, 'initial', 0, { timeoutMs: 500, deadlineAt })));
  assert.ok(results.every(result => result.kind === 'content'));
  assert.equal(maximum, 1);
  assert.ok(results[2].provenance.queueWaitMs >= 500);
  assert.ok(results[2].provenance.serviceMs < 500);
  const release = await provider.acquire();
  const before = calls;
  const waiting = engine.call('a', [], null, 'initial', 0, { timeoutMs: 500, deadlineAt: Date.now() + 30 });
  assert.equal((await waiting).kind, 'timeout');
  assert.equal(calls, before);
  const cancel = new AbortController();
  const cancelled = engine.call('b', [], cancel.signal, 'initial', 0, { timeoutMs: 500, deadlineAt: Date.now() + 2000 });
  cancel.abort();
  assert.equal((await cancelled).kind, 'cancelled');
  release();
  const after = await engine.call('c', [], null, 'initial', 0, { timeoutMs: 500, deadlineAt: Date.now() + 2000 });
  assert.equal(after.kind, 'content');
});

class FakePort extends EventEmitter {
  constructor(options = {}) { super(); this.options = options; this.isOpen = false; this.completed = []; this.active = null; this.cancelCount = 0; this.chunkLengths = []; this.timeSyncs = 0; }
  open(callback) { this.isOpen = true; callback(); }
  set(options, callback) { this.dtr = options.dtr; assert.equal(options.rts, false); callback(); }
  close(callback) { this.isOpen = false; this.emit('close'); callback(); }
  emitFrame(frame) {
    // Arbitrary USB packet boundaries, including inside JSON tokens.
    const emit = () => {
      const bytes = Buffer.from(JSON.stringify({ ...frame, v: 1 }) + '\n');
      for (let offset = 0; offset < bytes.length; offset += 13) this.emit('data', bytes.subarray(offset, offset + 13));
    };
    if (this.options.responseDelay && /^result_/.test(frame.type)) setTimeout(emit, this.options.responseDelay);
    else emit();
  }
  write(bytes, callback) {
    const f = JSON.parse(bytes.toString()); callback();
    queueMicrotask(() => this.handle(f));
  }
  handle(f) {
    assert.equal(this.dtr, true, 'USB CDC requires DTR before handshake');
    const reply = (type, extra = {}) => this.emitFrame({ id: f.id, type, ...extra });
    if (f.type === 'hello' || f.type === 'status') return reply('status', { device: 'detect-question-esp32s3', busy: Boolean(this.options.busy), maxBodyBytes: 1500000, maxResponseBytes: 262144, chunkBytes: this.options.chunkBytes, supportsTimeSync: this.options.timeSync, clockReady: this.options.timeSync ? this.timeSyncs > 0 : undefined });
    if (f.type === 'sync_time') { this.timeSyncs++; assert.ok(Math.abs(f.epochSeconds - Date.now() / 1000) < 5); return reply('time_synced'); }
    if (f.type === 'cancel') { this.cancelCount++; this.active = null; return reply('cancel_ack'); }
    if (f.type === 'configure') return reply('configured');
    if (f.type === 'network_probe') return reply('network_probe', { dnsResolved: true, dnsFallback: true, address: '192.0.2.1' });
    if (f.type === 'begin') {
      assert.equal(this.active, null, 'operations must not interleave');
      this.active = { id: f.id, op: f.op, bytes: f.bytes, chunks: [] }; return reply('ready');
    }
    if (f.type === 'chunk') {
      this.active.chunks.push(Buffer.from(f.data, 'base64'));
      this.chunkLengths.push(Buffer.from(f.data, 'base64').length);
      if (this.options.disconnect) { this.isOpen = false; this.emit('close'); return; }
      return reply('chunk_ack', { seq: this.options.badAck ? 999 : f.seq });
    }
    if (f.type === 'end') {
      const request = this.active;
      const body = Buffer.concat(request.chunks);
      assert.equal(body.length, request.bytes);
      this.completed.push({ op: request.op, body: JSON.parse(body.toString()) });
      this.active = null;
      if (this.options.hang) return;
      if (this.options.httpError) return reply('error', { code: 'HTTP_ERROR', httpStatus: 401 });
      if (this.options.headerTimeout) return reply('error', { code: 'HTTPS_FAILED', httpStatus: -11, tlsCode: -123,
        diagnostics: { postAndHeadersMs: 30000, reusedConnection: true, idleMs: 45000, secret: 'must-not-log', bodyMs: 'invalid' } });
      if (this.options.dnsError) return reply('error', { code: 'DNS_FAILED', httpStatus: -1 });
      const data = request.op === 'license' ? { allowed: true, sessionId: 'session-1' } : {
        model: JSON.parse(body.toString()).model, id: 'provider-id',
        choices: [{ message: { content: 'Đáp án: 東京 ✅' } }], usage: { total_tokens: 12 }
      };
      const result = Buffer.from(JSON.stringify(data));
      let seq = 0;
      for (let offset = 0; offset < result.length; offset += 7) reply('result_chunk', { seq: seq++, data: result.subarray(offset, offset + 7).toString('base64') });
      reply('result_end', { bytes: result.length + (this.options.badSize ? 1 : 0), chunks: seq,
        ...(this.options.diagnostics ? { diagnostics: { dnsMs: 15, connectMs: 200, postAndHeadersMs: 800, bodyMs: 20, reusedConnection: false, secret: 'must-not-log' } } : {}) });
    }
  }
}

function setup(options) {
  const port = new FakePort(options);
  const transport = new Esp32SerialTransport({ portFactory: () => port, timeoutMs: 2000, openDelayMs: 0 });
  return { port, transport, provider: new Esp32UsbProvider({ transport }) };
}

test('gateway timing and raw HTTP/TLS errors survive into provenance without arbitrary fields', async () => {
  for (const fail of [false, true]) {
    const fixture = setup(fail ? { headerTimeout: true } : { diagnostics: true });
    const engine = new AdaptiveDebateOrchestrator({ provider: fixture.provider, models: ['a', 'b', 'c'] });
    try {
      const result = await engine.call('a', [], null, 'initial', 0, { timeoutMs: 1000, deadlineAt: Date.now() + 2000 });
      const diagnostics = result.provenance.providerDiagnostics.gateway;
      assert.equal(result.kind, fail ? 'provider_error' : 'content');
      assert.equal(diagnostics.postAndHeadersMs, fail ? 30000 : 800);
      assert.equal(diagnostics.reusedConnection, fail);
      assert.equal(diagnostics.secret, undefined);
      if (fail) {
        assert.equal(diagnostics.httpCode, -11);
        assert.equal(diagnostics.tlsCode, -123);
        assert.equal(diagnostics.bodyMs, undefined);
      } else assert.equal(diagnostics.connectMs, 200);
    } finally { await fixture.transport.close(); }
  }
});

test('multi-chunk UTF-8 and image payload round-trip; simultaneous calls stay isolated', async () => {
  const { port, transport, provider } = setup();
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'Câu hỏi 東京'.repeat(1000) }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'AAAA'.repeat(1000) } }] }];
  try {
    const answers = await Promise.all(['model-a', 'model-b', 'model-c'].map(model => provider.complete({ model, messages })));
    assert.deepEqual(answers.map(a => a.actualModel), ['model-a', 'model-b', 'model-c']);
    assert.equal(answers[0].content, 'Đáp án: 東京 ✅');
    assert.equal(answers[0].providerRequestId, 'provider-id');
    assert.equal(answers[0].usage.total_tokens, 12);
    assert.deepEqual(port.completed[0].body.messages, messages);
    assert.equal(port.completed.length, 3);
  } finally { await transport.close(); }
});

test('bad acknowledgement and truncated response fail closed', async () => {
  for (const options of [{ badAck: true }, { badSize: true }]) {
    const { transport } = setup(options);
    try { await assert.rejects(transport.request('complete', { model: 'a' }), { code: options.badAck ? 'USB_SEQUENCE_MISMATCH' : 'USB_SIZE_MISMATCH' }); }
    finally { await transport.close(); }
  }
});

test('USB disconnect rejects the in-flight request', async () => {
  const { transport } = setup({ disconnect: true });
  await assert.rejects(transport.request('complete', { model: 'a' }), { code: 'USB_DISCONNECTED' });
});

test('a later operation reopens the port after disconnect', async () => {
  let opens = 0;
  const transport = new Esp32SerialTransport({ portFactory: () => new FakePort({ disconnect: opens++ === 0 }), timeoutMs: 1000, openDelayMs: 0 });
  await assert.rejects(transport.request('complete', { model: 'a' }), { code: 'USB_DISCONNECTED' });
  try {
    const result = await transport.request('complete', { model: 'b' });
    assert.equal(result.model, 'b'); assert.equal(opens, 2);
  } finally { await transport.close(); }
});

test('aborting a queued request never sends it to the board', async () => {
  const { port, transport } = setup({ hang: true });
  const controller = new AbortController();
  const first = transport.request('complete', { model: 'a' }, { timeoutMs: 70 });
  const second = transport.request('complete', { model: 'b' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(second, { code: 'CANCELLED' });
  await assert.rejects(first, { code: 'MODEL_TIMEOUT' });
  await transport.queue;
  assert.equal(port.completed.length, 1);
  assert.ok(port.cancelCount >= 1);
  await transport.close();
});

test('oversized requests fail before upload; licensing uses its own operation', async () => {
  const { port, transport } = setup();
  try {
    await assert.rejects(transport.request('complete', { text: 'x'.repeat(1500000) }), { code: 'USB_PAYLOAD_TOO_LARGE' });
    assert.equal(port.completed.length, 0);
    const result = await transport.request('license', { studentId: 'ABC123', deviceId: 'device' });
    assert.equal(result.allowed, true); assert.equal(port.completed[0].op, 'license');
  } finally { await transport.close(); }
});

test('provider preserves missing model metadata and maps HTTP auth failure', async () => {
  const provider = new Esp32UsbProvider({ transport: { request: async () => ({ choices: [{ message: { content: 'A' } }] }) } });
  assert.equal((await provider.complete({ model: 'expected', messages: [] })).actualModel, null);
  const failing = setup({ httpError: true });
  try { await assert.rejects(failing.provider.complete({ model: 'a', messages: [] }), { code: 'PROVIDER_AUTH', status: 401 }); }
  finally { await failing.transport.close(); }
});

test('server selects USB provider without a laptop provider API key', () => {
  const server = createServer({ transport: 'esp32', authToken: 'test-only', fileLogging: false });
  assert.ok(server);
  assert.throws(() => createServer({ transport: 'typo', authToken: 'test-only', fileLogging: false }), /AI_TRANSPORT/);
});

test('new firmware negotiates 2KB chunks and synchronizes an unset clock once', async () => {
  const { port, transport } = setup({ chunkBytes: 2048, timeSync: true });
  try {
    await transport.request('complete', { model: 'a', text: 'x'.repeat(10000) });
    await transport.request('status', {});
    assert.equal(port.timeSyncs, 1);
    assert.equal(Math.max(...port.chunkLengths), 2048);
    assert.equal(port.chunkLengths.length, Math.ceil(Buffer.byteLength(JSON.stringify(port.completed[0].body)) / 2048));
  } finally { await transport.close(); }
});

test('unreasonable negotiated chunk sizes use the legacy safe size', async () => {
  const { port, transport } = setup({ chunkBytes: 90000 });
  try {
    await transport.request('complete', { model: 'a', text: 'x'.repeat(2000) });
    assert.equal(Math.max(...port.chunkLengths), 768);
    assert.equal(port.timeSyncs, 0);
  } finally { await transport.close(); }
});

test('emergency model selection remains a single unverified call', async () => {
  const { AdaptiveDebateOrchestrator } = require('../orchestrator/lib/orchestrator');
  const calls = [];
  const engine = new AdaptiveDebateOrchestrator({ models: ['full-a', 'full-b', 'full-c'], emergencyModel: 'fast-lite', provider: {
    complete: async ({ model }) => { calls.push(model); return { actualModel: model, content: JSON.stringify({ questionType: 'single_choice', answer: 'A', evidence: [], uncertainty: [], needsVerification: false }) }; }
  } });
  const result = await engine.solveSingleModel({ requestId: 'fast-model-test', question: { type: 'single_choice', title: 'Pick one', options: [{ key: 'A', text: 'one' }, { key: 'B', text: 'two' }] } });
  assert.deepEqual(calls, ['fast-lite']);
  assert.equal(result.status, 'SINGLE_MODEL_UNVERIFIED');
  assert.equal(result.finalDecision.eligibleForAutoApply, false);
  assert.equal(result.backwardVerification.attempted, false);
});

test('DNS failure reaches the provider without replaying the AI request', async () => {
  const { port, transport, provider } = setup({ dnsError: true });
  try {
    await assert.rejects(provider.complete({ model: 'a', messages: [] }), { code: 'DNS_FAILED' });
    assert.equal(port.completed.length, 1);
    assert.equal(port.completed[0].op, 'complete');
  } finally { await transport.close(); }
});

test('DNS probe never uploads an AI payload', async () => {
  const { port, transport } = setup();
  try {
    const result = await transport.request('network_probe', {});
    assert.equal(result.dnsResolved, true);
    assert.equal(result.dnsFallback, true);
    assert.equal(port.completed.length, 0);
  } finally { await transport.close(); }
});

test('status remains readable while the HTTPS worker is busy', async () => {
  const { port, transport } = setup({ busy: true });
  try {
    const status = await transport.request('status', {}, { timeoutMs: 100 });
    assert.equal(status.busy, true);
    assert.equal(port.completed.length, 0);
  } finally { await transport.close(); }
});

test('AI uploads wait for a busy worker and cancel without posting', async () => {
  const { port, transport } = setup({ busy: true });
  try {
    await assert.rejects(transport.request('complete', { model: 'a' }, { timeoutMs: 30 }), { code: 'MODEL_TIMEOUT' });
    await transport.queue;
    assert.equal(port.completed.length, 0);
    assert.equal(port.active, null);
  } finally { await transport.close(); }
});

test('per-request deadline can exceed the transport default', async () => {
  const { transport } = setup({ responseDelay: 60 });
  transport.timeoutMs = 20;
  try {
    const result = await transport.request('complete', { model: 'a' }, { timeoutMs: 300 });
    assert.equal(result.model, 'a');
  } finally { await transport.close(); }
});
