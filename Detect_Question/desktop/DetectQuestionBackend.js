'use strict';

// Windows launcher for the local Question Detect orchestrator. The extension
// always talks to 127.0.0.1:8787, so a fresh launch deliberately replaces any
// process that is already listening on that port.
const { execFile } = require('child_process');
const { once } = require('events');
const { createServer } = require('../orchestrator/server');
const { loadLocalEnv, defaultEnvFile } = require('../orchestrator/lib/local-env');
const { writeStandaloneLog } = require('./StandaloneChromeController');

const HOST = '127.0.0.1';

function run(command, args) {
  return new Promise(resolve => execFile(command, args, { windowsHide: true }, (error, stdout = '', stderr = '') => {
    resolve({ error, stdout: String(stdout), stderr: String(stderr) });
  }));
}

async function listenersOnPort(port) {
  const { stdout } = await run('netstat.exe', ['-ano', '-p', 'tcp']);
  const portPattern = new RegExp(`^\\s*TCP\\s+[^\\s]+:${port}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)\\s*$`, 'i');
  return [...new Set(stdout.split(/\r?\n/).map(line => line.match(portPattern)?.[1]).filter(Boolean))];
}

async function waitForPortToClose(port, timeoutMs = 6_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await listenersOnPort(port)).length === 0) return true;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return false;
}

async function stopPortListeners(port) {
  const stopped = new Set();
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    const pids = await listenersOnPort(port);
    if (pids.length === 0) return [...stopped];
    for (const pid of pids) {
      console.log(`[launcher] Stopping PID ${pid} on port ${port}...`);
      const result = await run('taskkill.exe', ['/PID', pid, '/T', '/F']);
      // A listener can exit between netstat and taskkill. It is already gone,
      // so refresh the port table instead of failing the new startup.
      if (result.error && !/not found|not exist/i.test(`${result.stderr} ${result.error.message}`)) {
        throw new Error(`Could not stop PID ${pid}: ${result.stderr || result.error.message}`);
      }
      stopped.add(pid);
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Port ${port} is still occupied after stopping its listener.`);
}

function printStartupError(error) {
  writeStandaloneLog('launcher.start_failed', {
    code: error.code || null,
    httpStatus: Number(error.status) || null,
    message: String(error.message || 'Startup failed.').slice(0, 500)
  });
  console.error(`[launcher] ${error.message}`);
  if (String(error.message).includes('ORCHESTRATOR_AUTH_TOKEN')) {
    console.error(`[launcher] Create ${defaultEnvFile()} from .env.example and set ORCHESTRATOR_AUTH_TOKEN and AI_PROVIDER_API_KEY.`);
  }
}

function profileCountFromArgs(args) {
  const flagIndex = args.findIndex(arg => arg === '--profiles');
  const raw = flagIndex >= 0 ? args[flagIndex + 1] : args.find(arg => /^--profiles=\d+$/i.test(arg))?.split('=')[1];
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1;
}

async function main() {
  loadLocalEnv();
  // Provisioning/diagnostics must not start Chrome or stop
  // another process listening on the backend port.
  if (process.argv.includes('--usb-diagnostics')) {
    const ports = await require('serialport').SerialPort.list();
    console.log(JSON.stringify(ports.map(({ path, vendorId, productId }) => ({ path, vendorId, productId }))));
    return;
  }
  const gatewayIndex = process.argv.indexOf('--gateway');
  if (gatewayIndex >= 0) return require('../tools/esp32_gateway').main(process.argv.slice(gatewayIndex + 1));
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const stopOnly = process.argv.includes('--stop');
  await stopPortListeners(port);
  if (stopOnly) {
    console.log(`[launcher] Port ${port} is stopped.`);
    return;
  }

  // The standalone browser already writes page events to standalone.log. Send
  // the redacted orchestrator events to that same stream so `--logs` is a
  // complete, chronological trace: hotkey -> extraction -> pipeline -> result.
  // These are summaries only; the server never logs credentials or image data.
  const server = createServer({
    debug: true,
    detailedBackwardLogging: true,
    fileLogger: (event, data) => writeStandaloneLog(event, data)
  });
  let standaloneBrowser = null;
  server.once('error', error => {
    printStartupError(error);
    process.exitCode = 1;
  });
  server.listen(port, HOST);
  await once(server, 'listening');
  console.log(`[launcher] Question Detect backend is ready at http://${HOST}:${port}`);
  console.log('[launcher] Keep this window open while using the extension. Press Ctrl+C to stop it.');

  const shutdown = signal => {
    console.log(`\n[launcher] ${signal} received; stopping backend...`);
    Promise.resolve(standaloneBrowser?.close?.()).catch(() => {}).finally(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.once('SIGINT', () => shutdown('Ctrl+C'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  if (process.argv.includes('--standalone')) {
    try {
      const profileCount = profileCountFromArgs(process.argv.slice(2));
      standaloneBrowser = await require('./StandaloneChromeController').launchStandaloneChrome({ profileCount });
    } catch (error) {
      const message = String(error?.stack || error?.message || error);
      console.error(`[standalone] ${message}`);
      try { require('./StandaloneChromeController').writeStandaloneLog('browser.start_failed', { message }); } catch (_) {}
    }
  }
}

main().catch(async error => {
  printStartupError(error);
  process.exitCode = 1;
  if (process.env.AI_TRANSPORT === 'esp32') {
    await require('./usb/Esp32SerialTransport').sharedEsp32Transport().close().catch(() => {});
  }
});
