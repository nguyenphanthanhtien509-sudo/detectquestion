// SILENT STEALTH MODE: Vô hiệu hóa toàn bộ console để DevTools luôn sạch sẽ 100%
if (typeof console !== 'undefined') {
  if (typeof globalThis !== 'undefined' && !globalThis.__qaNativeConsole) {
    globalThis.__qaNativeConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      groupCollapsed: console.groupCollapsed?.bind(console),
      groupEnd: console.groupEnd?.bind(console),
      table: console.table?.bind(console)
    };
  }
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
}

if (typeof globalThis !== 'undefined') {
  globalThis.QA_DIAGNOSTICS_ENABLED = true;
  globalThis.QA_DEBUG_LOG = (...args) => {
    if (!globalThis.QA_DIAGNOSTICS_ENABLED) return;
    globalThis.__qaNativeConsole?.log?.('[Question Detect diagnostics]', ...args);
  };
}

// =========================================================================
// CONFIGURATION SYSTEM (ĐỒNG BỘ TỰ ĐỘNG TỪ .ENV)
// Tự động sinh bởi sync_env.js vào lúc: 23:45:57 19/10/2026
// =========================================================================

(function () {
  var config = {
    // 1. REASONING / SUY LUẬN SÂU
    ENABLE_REASONING: false,            // true = BẬT suy luận sâu, false = TẮT
    REASONING_EFFORT: 'low',          // 'high' | 'medium' | 'low'
    DIAGNOSTIC_LOGS: true,             // Alt+N writes DOM scan diagnostics to this tab's DevTools console.

    // 2. Public bridge configuration only. Provider credentials and model
    // selection are owned by the local orchestrator process.
    ORCHESTRATOR_URL: "http://127.0.0.1:8787",
    ORCHESTRATOR_AUTH_TOKEN: "qd-local-2026-7xP4mN9kR2vL8sT1"
  };

  var reasoningHelper = function () {
    return (typeof globalThis.APP_CONFIG !== 'undefined' && globalThis.APP_CONFIG.ENABLE_REASONING !== false);
  };

  var effortHelper = function () {
    return (typeof globalThis.APP_CONFIG !== 'undefined' && globalThis.APP_CONFIG.REASONING_EFFORT) || 'high';
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.APP_CONFIG = config;
    globalThis.isReasoningEnabled = reasoningHelper;
    globalThis.getReasoningEffort = effortHelper;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      APP_CONFIG: config,
      isReasoningEnabled: reasoningHelper,
      getReasoningEffort: effortHelper
    };
  }
})();

var APP_CONFIG = (typeof globalThis !== 'undefined') ? globalThis.APP_CONFIG : undefined;
var isReasoningEnabled = (typeof globalThis !== 'undefined') ? globalThis.isReasoningEnabled : undefined;
var getReasoningEffort = (typeof globalThis !== 'undefined') ? globalThis.getReasoningEffort : undefined;
