const fs = require('fs');
const path = require('path');

function parseEnv(contents) {
  return Object.fromEntries(contents.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('=');
    const value = index < 0 ? '' : line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    return [line.slice(0, index).trim(), value];
  }).filter(([key]) => key));
}

function sync() {
  const root = path.resolve(__dirname, '..');
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return console.log('Không tìm thấy .env; giữ runtime config hiện tại.');
  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const endpoint = env.ORCHESTRATOR_URL || '';
  const isLocal = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(endpoint);
  const config = `(function () {\n  var config = {\n    ENABLE_REASONING: ${String(env.ENABLE_REASONING || 'true').toLowerCase() === 'true'},\n    REASONING_EFFORT: ${JSON.stringify(env.REASONING_EFFORT || 'high')},\n    ORCHESTRATOR_URL: ${JSON.stringify(endpoint)},\n    ORCHESTRATOR_AUTH_TOKEN: ${JSON.stringify(isLocal ? env.ORCHESTRATOR_AUTH_TOKEN || '' : '')}\n  };\n  globalThis.APP_CONFIG = config;\n  globalThis.isReasoningEnabled = () => config.ENABLE_REASONING;\n  globalThis.getReasoningEffort = () => config.REASONING_EFFORT;\n  if (typeof module !== 'undefined' && module.exports) module.exports = { APP_CONFIG: config, isReasoningEnabled: globalThis.isReasoningEnabled, getReasoningEffort: globalThis.getReasoningEffort };\n})();\nvar APP_CONFIG = globalThis.APP_CONFIG;\nvar isReasoningEnabled = globalThis.isReasoningEnabled;\nvar getReasoningEffort = globalThis.getReasoningEffort;\n`;
  fs.writeFileSync(path.join(root, 'src', 'config', 'runtime-config.js'), config, 'utf8');
  console.log('Đã đồng bộ bridge Adaptive Debate từ .env; model/provider chỉ ở backend.');
}
sync();
