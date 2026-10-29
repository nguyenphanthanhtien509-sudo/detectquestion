'use strict';
const assert = require('assert/strict');
const { Esp32SerialTransport } = require('../desktop/usb/Esp32SerialTransport');

async function main() {
  const transport = new Esp32SerialTransport({ path: process.argv[2] || 'COM7', timeoutMs: 15000 });
  try {
    const status = await transport.request('status', {});
    assert.equal(status.device, 'detect-question-esp32s3');
    const memoryStorage = status.requestStorage === 'psram';
    assert.equal(memoryStorage ? status.psramReady : status.filesystemReady, true);
    assert.equal(status.busy, false);
    console.log(JSON.stringify(status, null, 2));
    // Exercise real flash upload + UTF-8/chunk ACKs without making an API
    // call. Only do this when the board has never been provisioned.
    if (!status.configured && !status.wifiConnected) {
      const question = { model: 'hardware-test-no-network', messages: [{ role: 'user', content: 'Câu hỏi kiểm tra USB 東京 '.repeat(2500) }] };
      await assert.rejects(transport.request('complete', question), { code: 'WIFI_OFFLINE' });
      const after = await transport.request('status', {});
      assert.equal(after.busy, false);
      assert.equal(memoryStorage ? after.psramReady : after.filesystemReady, true);
      console.log('PASS: real USB multi-chunk UTF-8 upload, filesystem, offline error and recovery. No API call made.');
    } else {
      console.log('PASS: gateway handshake and filesystem. Upload test skipped because the board is provisioned or online.');
    }
  } finally { await transport.close(); }
}
main().catch(cause => { console.error(cause.code || cause.message); process.exitCode = 1; });
