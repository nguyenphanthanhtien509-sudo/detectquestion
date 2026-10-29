'use strict';
const assert = require('assert/strict');
const { Esp32SerialTransport } = require('../desktop/usb/Esp32SerialTransport');

async function main() {
  const transport = new Esp32SerialTransport({ path: process.argv[2] || 'COM7', timeoutMs: 30000 });
  try {
    const before = await transport.request('status', {});
    assert.equal(before.requestStorage, 'psram', 'Upgrade to the PSRAM firmware first');
    assert.equal(before.psramReady, true);
    const measurements = [];
    const pattern = 'Kiểm tra USB 東京 ✅ 1234567890 ';
    for (const target of [16 * 1024, 64 * 1024, 128 * 1024]) {
      const payload = { text: pattern.repeat(Math.floor((target - 64) / Buffer.byteLength(pattern))) };
      const bytes = Buffer.byteLength(JSON.stringify(payload));
      const started = process.hrtime.bigint();
      const received = await transport.request('transport_test', payload);
      const roundTripMs = Number(process.hrtime.bigint() - started) / 1e6;
      assert.deepEqual(received, payload, 'Real USB round-trip corrupted UTF-8 payload');
      const status = await transport.request('status', {});
      assert.equal(status.busy, false);
      measurements.push({ bytes, chunkBytes: transport.chunkBytes, uploadMs: status.lastUploadMs, roundTripMs: Math.round(roundTripMs), freePsram: status.freePsram });
      console.log(JSON.stringify(measurements.at(-1)));
    }
    // Partial upload cancellation must release PSRAM and allow another job.
    const id = 'benchmark-cancel';
    await transport.exchange({ id, type: 'begin', op: 'transport_test', bytes: 65536 }, 'ready');
    await transport.exchange({ id, type: 'cancel' }, 'cancel_ack');
    const after = await transport.request('status', {});
    assert.equal(after.busy, false);
    assert.ok(after.freePsram >= measurements.at(-1).freePsram - 4096, 'Cancelled upload leaked PSRAM');
    console.log(JSON.stringify({ psramBytes: before.psramBytes, clockSource: after.clockSource, measurements, cancellation: 'passed', apiCalls: 0 }, null, 2));
  } finally { await transport.close(); }
}
main().catch(cause => { console.error(cause.code || cause.message); process.exitCode = 1; });
