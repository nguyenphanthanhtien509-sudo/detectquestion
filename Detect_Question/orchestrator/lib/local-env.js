'use strict';

// Local-development convenience only. Values are read by the Node backend
// process and are never copied into extension runtime configuration.
const fs = require('fs');
const path = require('path');

function defaultEnvFile() {
  if (!process.pkg) return path.resolve(__dirname, '..', '..', '.env');
  // Prefer a portable configuration beside the .exe. During local release
  // builds, transparently reuse the existing project-root .env so the user
  // never has to enter the same credentials a second time.
  const besideExecutable = path.join(path.dirname(process.execPath), '.env');
  if (fs.existsSync(besideExecutable)) return besideExecutable;
  return path.resolve(path.dirname(process.execPath), '..', '.env');
}

function loadLocalEnv(file = defaultEnvFile()) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

module.exports = { defaultEnvFile, loadLocalEnv };
