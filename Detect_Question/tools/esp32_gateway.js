'use strict';
// Provision only from an explicit local config file. Never print its contents.
const fs = require('fs');
const { Esp32SerialTransport } = require('../desktop/usb/Esp32SerialTransport');

async function main(args = process.argv.slice(2)) {
  const [command, port, configFile] = args;
  if (!['status', 'configure', 'smoke', 'probe'].includes(command) || !port || (command === 'configure' && !configFile)) {
    throw new Error('Usage: node tools/esp32_gateway.js status|configure|smoke|probe COM7 [config-file.json]');
  }
  const transport = new Esp32SerialTransport({ path: port });
  try {
    if (command === 'configure') {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      // CA files avoid manual JSON escaping of multiline PEM certificates.
      if (config.caCertFile) config.caCert = fs.readFileSync(config.caCertFile, 'utf8');
      if (config.licenseCaFile) config.licenseCa = fs.readFileSync(config.licenseCaFile, 'utf8');
      const keys = ['ssid', 'password', 'apiUrl', 'apiKey', 'caCert', 'licenseUrl', 'anonKey', 'licenseCa'];
      await transport.request('configure', Object.fromEntries(keys.map(key => [key, config[key] || ''])));
      console.log('Configuration saved. Wait for Wi-Fi and clockReady=true before solving.');
    } else if (command === 'smoke') {
      const model = process.env.ESP32_SMOKE_MODEL;
      if (!model) throw new Error('Set ESP32_SMOKE_MODEL to a model supported by your API. This command makes one billable API call.');
      const data = await transport.request('complete', { model, messages: [{ role: 'user', content: 'Reply with exactly OK.' }], temperature: 0, stream: false });
      console.log(JSON.stringify({ actualModel: data.model || null, content: data.choices?.[0]?.message?.content || null }));
    } else console.log(JSON.stringify(await transport.request(command === 'probe' ? 'network_probe' : 'status', {}), null, 2));
  } finally { await transport.close(); }
}
if (require.main === module) main().catch(cause => { console.error(cause.code || cause.message); process.exitCode = 1; });
module.exports = { main };
