'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { loadLocalEnv } = require('../orchestrator/lib/local-env');
const { createServer } = require('../orchestrator/server');
const { sharedEsp32Transport } = require('../desktop/usb/Esp32SerialTransport');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
loadLocalEnv(process.argv[2]);
process.env.AI_TRANSPORT = 'esp32';
process.env.ESP32_SERIAL_PORT = 'COM7';
const transport = sharedEsp32Transport();
const output = path.resolve(__dirname, '../../HARDWARE_DIAGNOSTICS_RESULTS.json');
const results = [];
function save() { fs.writeFileSync(output, JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2)); }
function summarize(result) {
  return { status: result.status, durationMs: result.metrics?.durationMs, answerPresent: result.answer != null,
    attempts: (result.provenance || []).map(p => ({ model: p.requestedModel, status: p.responseStatus,
      validationError: p.validationError?.code, queueWaitMs: p.queueWaitMs, serviceMs: p.serviceMs,
      gateway: p.providerDiagnostics?.gateway })) };
}
(async () => {
  let server;
  try {
    let status;
    for (let i = 0; i < 10; i++) {
      status = await transport.request('status', {}, { timeoutMs: 5000 });
      if (status.wifiConnected) break;
      await delay(2000);
    }
    results.push({ test: 'initial-status', firmware: status.firmware, wifiConnected: status.wifiConnected, psramReady: status.psramReady }); save();
    if (!status.wifiConnected) throw new Error('WIFI_OFFLINE: hardware tests stopped without AI calls');
    server = createServer({ fileLogging: false });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${process.env.ORCHESTRATOR_AUTH_TOKEN}` };
    const question = { type: 'single_choice', title: 'Compute 2 + 3.', options: [{ key: 'A', text: '5' }, { key: 'B', text: '8' }] };
    async function solve(mode, id = randomUUID()) {
      const response = await fetch(`${base}/v1/solve`, { method: 'POST', headers: { ...headers, 'idempotency-key': id },
        body: JSON.stringify({ schemaVersion: 1, requestId: id, mode, question }) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return response.json();
    }
    for (const mode of ['single_model', 'single_model', 'adaptive_debate']) {
      const summary = { test: mode, ...summarize(await solve(mode)) }; results.push(summary); save(); console.log(JSON.stringify(summary));
    }
    const id = randomUUID();
    const pending = solve('single_model', id);
    await delay(1000);
    const cancelledAt = Date.now();
    const response = await fetch(`${base}/v1/solve/${id}/cancel`, { method: 'POST', headers, body: '{}' });
    const cancelled = await pending;
    results.push({ test: 'cancel', cancelHttpStatus: response.status, hostReturnMs: Date.now() - cancelledAt, ...summarize(cancelled) }); save();
    const next = summarize(await solve('single_model'));
    status = await transport.request('status', {}, { timeoutMs: 10000 });
    results.push({ test: 'after-cancel', ...next, busy: status.busy, lastCancelDrainMs: status.lastCancelDrainMs }); save(); console.log(JSON.stringify(results.slice(-2)));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await transport.close(); save();
  }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
