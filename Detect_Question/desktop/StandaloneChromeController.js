'use strict';

const crypto = require('crypto');
const { APP_VERSION } = require('./AppVersion');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { readExtensionParityScripts } = require('./ExtensionParityBundle');

const runtimeDirectory = path.join(process.env.LOCALAPPDATA || process.cwd(), 'DetectQuestionBackend');
const standaloneLogFile = path.join(runtimeDirectory, 'standalone.log');
const answerCacheFile = path.join(runtimeDirectory, 'answer-cache.json');
const managedProfileDirectory = path.join(process.env.LOCALAPPDATA || process.cwd(), 'DetectQuestionBrowser');

function profileDirectoryFor(index) {
  // Preserve the existing managed sign-in as profile 1. Additional profiles
  // are intentionally isolated so each can keep a different LMS account.
  return index === 1 ? managedProfileDirectory : `${managedProfileDirectory}-${index}`;
}

function readAnswerCache(key) {
  try {
    const cache = JSON.parse(fs.readFileSync(answerCacheFile, 'utf8'));
    return cache && typeof cache === 'object' ? cache[key] || null : null;
  } catch (_) { return null; }
}

function writeAnswerCache(key, item) {
  if (!key || !item || typeof item !== 'object') return false;
  try {
    fs.mkdirSync(runtimeDirectory, { recursive: true });
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(answerCacheFile, 'utf8')) || {}; } catch (_) {}
    cache[key] = item;
    fs.writeFileSync(answerCacheFile, JSON.stringify(cache), 'utf8');
    return true;
  } catch (_) { return false; }
}

function log(event, data = {}) {
  try { fs.mkdirSync(runtimeDirectory, { recursive: true }); fs.appendFileSync(standaloneLogFile, `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...data, appVersion: APP_VERSION })}\n`, 'utf8'); } catch (_) {}
  console.log(`[standalone] ${event} ${JSON.stringify(data)}`);
}

function findChromeExecutable() {
  const candidates = [
    process.env.QA_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function answerText(result, question = null) {
  const value = result?.answer;
  if (Array.isArray(value)) {
    // Keep standalone Alt+M identical to the extension: a multiple-choice
    // answer is copied/displayed as its 1-based option positions without
    // separators (for example A,C,D => "134"), not as raw model letters.
    if (question?.type === 'multiple_choice' && Array.isArray(question.options)) {
      return value.map(answer => {
        const index = question.options.findIndex(option =>
          String(option?.key || '').trim().toUpperCase() === String(answer || '').trim().toUpperCase());
        return index >= 0 ? String(index + 1) : String(answer || '').trim();
      }).filter(Boolean).join('');
    }
    return value.map(item => String(item ?? '').trim()).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    // Matching/multi-input results must retain the visual field order (CX,
    // AX, DX), not JavaScript object insertion order from the model response.
    if (question?.type === 'multi_input' && Array.isArray(question.fields)) {
      const fields = question.fields.map(field => {
        const selected = String(value[field.id] ?? '').trim();
        const choices = Array.isArray(field.options)
          ? field.options.filter(option => String(option?.value ?? '').trim())
          : [];
        const index = field.kind === 'select'
          ? choices.findIndex(option => String(option.value) === selected)
          : -1;
        return { selected, position: index >= 0 ? String(index + 1) : null };
      }).filter(field => field.selected);
      // A matching question is shown/copyable exactly like multiple choice:
      // each dropdown's 1-based visible option position, in field order.
      // Keep raw text only when a field has no reliable option mapping.
      return fields.length && fields.every(field => field.position)
        ? fields.map(field => field.position).join('')
        : fields.map(field => field.selected).join(', ');
    }
    if (question?.type === 'dropdown_select' && Array.isArray(question.selects)) {
      return question.selects.map(select => {
        const selected = value[select.id] ?? value[select.label];
        const choices = (select.options || []).filter(option => String(option?.value ?? '').trim());
        const index = choices.findIndex(option => String(option.value) === String(selected));
        return index >= 0 ? String(index + 1) : String(selected ?? '').trim();
      }).filter(Boolean).join('');
    }
    return Object.values(value).map(item => String(item ?? '').trim()).filter(Boolean).join(', ');
  }
  return String(value || '').trim();
}

function isSafeRemoteImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    // Images are fetched by the local backend on behalf of the page. Do not
    // let a quiz page turn that bridge into a probe for the user's LAN,
    // loopback services, or link-local cloud metadata endpoints.
    const isPrivateIpv4 = /^(?:0|10|127)\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host);
    const isLocalIpv6 = host === '::1' || host.startsWith('fe80:') ||
      host.startsWith('fc') || host.startsWith('fd');
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') &&
      !isPrivateIpv4 && !isLocalIpv6;
  } catch (_) {
    return false;
  }
}

async function readRemoteImage(urlText, timeoutMs = 15_000) {
  let url = String(urlText || '');
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isSafeRemoteImageUrl(url)) throw new Error('Question image URL is not a safe remote HTTP(S) URL.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Timed out while reading the question image.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) throw new Error('Question image redirect has no destination.');
      url = new URL(next, url).toString();
      continue;
    }
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType) || !bytes.length || bytes.length > 1_000_000) {
      throw new Error('Unable to read a supported question image.');
    }
    return { mimeType, data: bytes.toString('base64') };
  }
  throw new Error('Question image exceeded the redirect limit.');
}

async function reconnectManagedBrowser(profileDirectory) {
  // If a previous backend was restarted, Chrome can briefly outlive it and
  // retain the profile lock. Its DevTools port lets the new backend adopt that
  // exact managed browser instead of launching a second Chrome or failing.
  try {
    const portFile = path.join(profileDirectory, 'DevToolsActivePort');
    const port = String(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0] || '').trim();
    if (!/^\d{2,5}$/.test(port)) return null;
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, timeout: 2_500 });
    log('browser.reconnected', { port });
    return browser;
  } catch (_) {
    return null;
  }
}

async function installPageHelper(page, solve, extensionScripts, runtimeConfig, bridge) {
  page.on('console', message => log('page.console', { type: message.type(), text: String(message.text()).slice(0, 500) }));
  page.on('pageerror', error => log('page.error', { message: String(error?.message || error).slice(0, 500) }));
  // Chrome internal pages (chrome://extensions, settings, new-tab UI, DevTools
  // and browser UI iframes) own privileged `chrome.*` APIs. Replacing those
  // APIs with our standalone bridge can leave the internal page blank or
  // unresponsive. Register the hooks for every tab so a later navigation to a
  // website still works, but make every injected script a no-op outside normal
  // document schemes.
  const supportedDocumentSchemes = ['http:', 'https:', 'file:', 'data:'];
  await page.evaluateOnNewDocument(config => {
    if (!['http:', 'https:', 'file:', 'data:'].includes(location.protocol)) return;
    globalThis.APP_CONFIG = config;
    const call = (...args) => {
      // Chrome supports sendMessage(message, callback) as well as its
      // extension-id overload. The parity scripts use the former, but parsing
      // the arguments makes this bridge resilient to either form.
      const callback = [...args].reverse().find(value => typeof value === 'function');
      const request = typeof args[0] === 'string' && args.length > 1 ? args[1] : args[0];
      let serializedRequest;
      try {
        // Puppeteer's exposed bindings are most reliable with one primitive
        // argument. Sending the payload as one JSON string prevents the
        // intermittent "should be exactly one string" binding error.
        serializedRequest = JSON.stringify(request == null ? {} : request);
      } catch (error) {
        globalThis.chrome.runtime.lastError = { message: `Unable to serialize extension request: ${String(error?.message || error)}` };
        callback?.();
        globalThis.chrome.runtime.lastError = null;
        return;
      }
      globalThis.__qaStandaloneBridge(serializedRequest).then(serializedResponse => {
        let value = serializedResponse;
        if (typeof serializedResponse === 'string') {
          try { value = JSON.parse(serializedResponse); } catch (_) {}
        }
        callback?.(value);
      }).catch(error => {
        globalThis.chrome.runtime.lastError = { message: String(error?.message || error) };
        callback?.();
        globalThis.chrome.runtime.lastError = null;
      });
    };
    globalThis.chrome = {
      runtime: { lastError: null, sendMessage: call, onMessage: { addListener: () => {} }, __qaStandaloneBridge: true },
      storage: { local: { get: (_keys, callback) => callback?.({}) } }
    };
    addEventListener('keydown', event => {
      const key = String(event.key || '').toLowerCase();
      if (event.altKey && !event.ctrlKey && !event.metaKey && ['n', 'm', 'k', 'y', 'u', 'b'].includes(key)) {
        globalThis.__qaStandaloneLog?.({ event: 'hotkey', data: { key, url: location.href } });
        setTimeout(() => {
          const questions = globalThis.ExamDomScanner?.scanAll?.() || [];
          globalThis.__qaStandaloneLog?.({ event: 'scanner.result', data: { key, count: questions.length, type: questions[0]?.type || null } });
          // Detection telemetry remains in the live log. Do not show a
          // transient on-page toast here: it is redundant with solve/error
          // feedback and obscures content near the bottom-right corner.
        }, 280);
      }
    }, { capture: true });
  }, runtimeConfig);
  for (const script of extensionScripts) {
    const guardedSource = `if (${JSON.stringify(supportedDocumentSchemes)}.includes(location.protocol)) {\n${script.source}\n}`;
    await page.evaluateOnNewDocument(guardedSource);
  }
  return Promise.all([
    page.exposeFunction('__qaStandaloneSolve', solve),
    page.exposeFunction('__qaStandaloneBridge', async serializedRequest => {
      // Keep the browser <-> Node transport constrained to one JSON string.
      // Besides avoiding Puppeteer binding argument ambiguity, this makes a
      // malformed page request fail as a normal bridge response instead of
      // breaking the active hotkey handler.
      let request;
      try {
        request = JSON.parse(String(serializedRequest || '{}'));
      } catch (error) {
        return JSON.stringify({ success: false, error: `Invalid bridge request: ${String(error?.message || error)}` });
      }
      try {
        return JSON.stringify(await bridge(request));
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error?.message || error) });
      }
    }),
    page.exposeFunction('__qaStandaloneLog', payload => log(`page.${payload?.event || 'unknown'}`, payload?.data || {})),
    page.evaluateOnNewDocument(() => {
      if (!['http:', 'https:', 'file:', 'data:'].includes(location.protocol)) return;
      const debugStatus = (message, type = 'info', duration = 4000) => {
        let node = document.getElementById('__qaStandaloneDebugStatus');
        if (!node) {
          node = document.createElement('div');
          node.id = '__qaStandaloneDebugStatus';
          Object.assign(node.style, {
            position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
            maxWidth: '420px', padding: '10px 13px', borderRadius: '8px', color: '#fff',
            font: '13px/1.35 system-ui, sans-serif', boxShadow: '0 5px 18px rgba(0,0,0,.32)'
          });
          document.documentElement.appendChild(node);
        }
        const colors = { success: '#166534', warning: '#a16207', error: '#b91c1c', info: '#1d4ed8' };
        node.style.background = colors[type] || colors.info;
        node.textContent = String(message || 'Detect Question');
        clearTimeout(node.__timer);
        node.__timer = setTimeout(() => node.remove(), Math.max(1500, duration));
      };
      globalThis.__qaStandaloneStatus = debugStatus;
      const observeExtensionStatus = () => {
        const notifier = globalThis.StealthToastNotifier;
        if (!notifier || notifier.__qaStandaloneObserved) return;
        notifier.__qaStandaloneObserved = true;
        const originalShow = notifier.show.bind(notifier);
        notifier.show = (message, type, duration) => {
          globalThis.__qaStandaloneLog?.({ event: 'extension.status', data: { message: String(message || ''), type: type || 'info' } });
          // Status/progress is log-only. The page stays visually quiet except
          // for the compact answer badge supplied by showAnswer().
          return originalShow(message, type, duration);
        };
        const originalShowAnswer = notifier.showAnswer.bind(notifier);
        notifier.showAnswer = (answer, duration) => {
          const text = Array.isArray(answer) ? answer.join(', ') : String(answer ?? '').trim();
          globalThis.__qaStandaloneLog?.({ event: 'extension.answer', data: { answer: text } });
          // Preserve the extension's compact answer badge (the bare answer
          // in the page corner), while deliberately suppressing the large
          // standalone debug toast such as "Answer: B".
          return originalShowAnswer(answer, duration);
        };
      };
      observeExtensionStatus();
      const visible = element => {
        const rect = element?.getBoundingClientRect?.();
        const style = element && getComputedStyle(element);
        return !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden';
      };
      const text = element => String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
      // This legacy fallback runs only if the bundled extension scripts did
      // not initialise. Keep it log-only as well.
      const show = () => undefined;
      // Keep this legacy standalone fallback visually silent as well. The
      // canonical extension path logs/copies its answer through the bridge.
      const showAnswer = () => undefined;
      const ready = () => {
        globalThis.__qaStandaloneLog?.({ event: 'ready', data: { url: location.href } });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
      const questionCard = () => {
        const cards = [...document.querySelectorAll('.que, .question, [data-question-id], [data-qa-id], .yh-question-card, [id^="q-card-"]')].filter(visible);
        const detected = cards.find(card => {
          const rect = card.getBoundingClientRect();
          return rect.bottom > 80 && rect.top < innerHeight - 80;
        }) || cards[0];
        if (detected) return detected;

        // Non-Moodle practice sites often have no Moodle class names. Start
        // from a visible answer control and walk up to its question container.
        const answerControl = [...document.querySelectorAll('input[type="radio"], input[type="checkbox"], select, textarea, input[type="text"], input[type="number"]')].find(visible);
        if (!answerControl) return null;
        return answerControl.closest('[data-question], [class*="question" i], [class*="quiz" i], [class*="card" i], article, form, section, [role="group"]')
          || answerControl.parentElement?.parentElement
          || answerControl.parentElement
          || null;
      };
      const labelFor = input => {
        const byFor = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        return text(byFor || input.closest('label') || input.parentElement);
      };
      const extract = () => {
        // Primary path: run the identical layered scanner used by the Chrome
        // extension (Moodle, cards, anchors, generic DOM, buttons, controls).
        if (globalThis.ExamDomScanner?.scanAll) {
          const all = globalThis.ExamDomScanner.scanAll() || [];
          const active = all.find(question => {
            const rect = question.element?.getBoundingClientRect?.();
            return rect && rect.bottom > 80 && rect.top < innerHeight - 80;
          }) || all[0];
          if (active) {
            const question = {
              type: active.type,
              title: String(active.title || ''),
              ...(active.passage ? { passage: String(active.passage) } : {}),
              ...(active.image ? { imageUrl: String(active.image) } : {})
            };
            if (Array.isArray(active.options)) question.options = active.options.map(option => ({ key: String(option.key), text: String(option.text || '') }));
            if (Array.isArray(active.items)) question.items = active.items.map(item => ({ key: String(item.key), text: String(item.text || '') }));
            if (Array.isArray(active.selects)) question.selects = active.selects.map(select => ({ id: String(select.id), label: String(select.label || ''), options: (select.options || []).map(option => ({ value: String(option.value ?? option.text ?? ''), text: String(option.text || '') })) }));
            if (Array.isArray(active.fields)) question.fields = active.fields.map(field => ({ id: String(field.id), label: String(field.label || ''), kind: field.kind, ...(field.kind === 'select' ? { options: (field.options || []).map(option => ({ value: String(option.value ?? option.text ?? ''), text: String(option.text || '') })) } : {}) }));
            globalThis.__qaStandaloneLog?.({ event: 'extension_scanner_used', data: { detected: all.length, type: question.type } });
            return question;
          }
        }
        const card = questionCard();
        if (!card) throw new Error('No visible supported question was found.');

        // The bundled COA exam app uses clickable divs rather than native
        // radio inputs. Its stable q-card-* id makes this branch precise.
        if (card.id?.startsWith('q-card-')) {
          const optionNodes = [...card.querySelectorAll('div.cursor-pointer')].filter(visible);
          const title = text(card.querySelector('div.prose, div.whitespace-pre-line'));
          if (title && optionNodes.length >= 2) {
            const options = optionNodes.map((node, index) => {
              const answerText = text([...node.children].find(child => child.classList?.contains('flex-1')) || node);
              return { key: String.fromCharCode(65 + index), text: answerText || `Option ${index + 1}` };
            });
            const header = text(card.querySelector(':scope > div'));
            return { type: /chọn nhiều|multiple/i.test(header) ? 'multiple_choice' : 'single_choice', title, options };
          }
        }
        const titleNode = card.querySelector('.qtext, .questiontext, .content, [class*="questiontext"]') || card;
        const title = text(titleNode);
        const radios = [...card.querySelectorAll('input[type="radio"]')].filter(input => !input.disabled && input.value !== '-1');
        const checks = [...card.querySelectorAll('input[type="checkbox"]')].filter(input => !input.disabled);
        const selects = [...card.querySelectorAll('select')].filter(input => !input.disabled);
        const textInputs = [...card.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], textarea')].filter(input => !input.disabled);
        const options = inputs => inputs.map((input, index) => ({ key: String.fromCharCode(65 + index), text: labelFor(input) || `Option ${index + 1}` }));
        if (radios.length) return { type: 'single_choice', title, options: options(radios) };
        if (checks.length) return { type: 'multiple_choice', title, options: options(checks) };
        if (textInputs.length && selects.length) return {
          type: 'multi_input', title,
          fields: [
            ...textInputs.map((input, index) => ({ id: input.id || `text_${index + 1}`, label: input.getAttribute('aria-label') || `Answer ${index + 1}`, kind: 'text' })),
            ...selects.map((select, index) => ({ id: select.id || `select_${index + 1}`, label: select.getAttribute('aria-label') || `Select ${index + 1}`, kind: 'select', options: [...select.options].filter(option => option.value).map(option => ({ value: option.value, text: text(option) })) }))
          ]
        };
        if (selects.length) return { type: 'dropdown_select', title, selects: selects.map((select, index) => ({ id: select.id || `select_${index + 1}`, label: select.getAttribute('aria-label') || `Select ${index + 1}`, options: [...select.options].filter(option => option.value).map(option => ({ value: option.value, text: text(option) })) })) };
        if (textInputs.length) return { type: 'short_answer', title };
        throw new Error('This question format is not supported by standalone mode yet.');
      };
      addEventListener('keydown', async event => {
        const key = String(event.key || '').toLowerCase();
        if (!(event.altKey && !event.ctrlKey && !event.metaKey && (key === 'n' || key === 'm'))) return;
        event.preventDefault(); event.stopImmediatePropagation();
        try {
          const singleModel = key === 'm';
          globalThis.__qaStandaloneLog?.({ event: 'hotkey', data: { key, url: location.href } });
          show(singleModel ? 'Detect Question: solving with one model…' : 'Detect Question: solving…');
          const question = extract();
          globalThis.__qaStandaloneLog?.({ event: 'question.extracted', data: { type: question.type, titleLength: question.title.length, optionCount: question.options?.length, selectCount: question.selects?.length, fieldCount: question.fields?.length } });
          const result = await globalThis.__qaStandaloneSolve(question, singleModel ? 'single_model' : 'adaptive_debate');
          showAnswer(result?.answer);
        } catch (error) {
          const message = String(error?.message || error);
          globalThis.__qaStandaloneLog?.({ event: 'hotkey.failed', data: { key, url: location.href, message } });
          show(`Detect Question: ${message}`);
        }
      }, true);
    })
  ]);
}

async function launchStandaloneChrome({ profileCount = 1, profileIndex = 1 } = {}) {
  const count = Math.max(1, Math.min(5, Number.parseInt(profileCount, 10) || 1));
  if (count > 1 && profileIndex === 1) {
    const browsers = await Promise.all(Array.from({ length: count }, (_, offset) =>
      launchStandaloneChrome({ profileCount: 1, profileIndex: offset + 1, windowCount: count })
    ));
    return {
      close: () => Promise.allSettled(browsers.map(browser => browser.close?.()))
    };
  }
  const windowCount = Math.max(1, Math.min(5, Number.parseInt(arguments[0]?.windowCount, 10) || 1));
  const profileDirectory = profileDirectoryFor(Math.max(1, Number.parseInt(profileIndex, 10) || 1));
  const executablePath = findChromeExecutable();
  if (!executablePath) throw new Error('Google Chrome or Microsoft Edge was not found.');
  const token = String(process.env.ORCHESTRATOR_AUTH_TOKEN || '').trim();
  if (!token) throw new Error('ORCHESTRATOR_AUTH_TOKEN is not configured.');
  let reusedBrowser = await reconnectManagedBrowser(profileDirectory);
  const browser = reusedBrowser || await puppeteer.launch({
    executablePath,
    headless: false,
    // Do not emulate Puppeteer's 800x600 viewport. Let managed Chrome use the
    // actual monitor dimensions and start as a normal maximized browser.
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
    userDataDir: profileDirectory,
    args: [
      ...(windowCount === 1
        ? ['--start-maximized']
        : [`--window-size=${windowCount === 2 ? '960,900' : '800,850'}`, `--window-position=${(profileIndex - 1) * (windowCount === 2 ? 960 : 420)},40`]),
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-session-crashed-bubble',
      '--noerrdialogs',
      '--disable-features=Translate,OptimizationHints',
      // The machine's configured loopback DNS proxy is currently failing to
      // resolve the campus LMS hostname. Use DoH only inside managed Chrome;
      // this does not alter Windows or the user's other browsers.
      '--dns-over-https-mode=secure',
      '--dns-over-https-templates=https://cloudflare-dns.com/dns-query'
    ]
  });
  const requestSolve = async (question, mode = 'adaptive_debate') => {
    const requestId = crypto.randomUUID();
    log('solve.started', { requestId, mode, type: question.type, titleLength: question.title.length });
    const response = await fetch('http://127.0.0.1:8787/v1/solve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': requestId },
      body: JSON.stringify({ schemaVersion: 1, requestId, mode, question })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      log('solve.failed', { requestId, mode, status: response.status, error: result?.message || result?.error || null });
      throw new Error(result?.message || result?.error || `Backend error ${response.status}`);
    }
    log('solve.completed', { requestId, mode, status: result.status || null, hasAnswer: !!answerText(result, question) });
    return result;
  };
  const solve = async (question, mode = 'adaptive_debate') => {
    const result = await requestSolve(question, mode);
    return { answer: answerText(result, question) };
  };
  const extensionScripts = readExtensionParityScripts();
  const installOnPage = async candidate => {
    if (!candidate || candidate.isClosed() || candidate.__qaStandaloneInstalled) return;
    candidate.__qaStandaloneInstalled = true;
    try {
      const bridge = async request => {
        const action = String(request?.action || '');
        if (action === 'CALL_ADAPTIVE_DEBATE') {
          try {
            const result = await requestSolve(request.payload?.question, request.payload?.mode || 'adaptive_debate');
            return { success: true, data: result };
          } catch (error) {
            const message = String(error?.message || error);
            log('bridge.solve_failed', { message });
            return { success: false, error: message };
          }
        }
        if (action === 'CAPTURE_VISIBLE_TAB') {
          const image = await candidate.screenshot({ type: 'png', encoding: 'base64', captureBeyondViewport: false });
          return { success: true, dataUrl: `data:image/png;base64,${image}` };
        }
        if (action === 'READ_IMAGE_AS_BASE64') {
          try {
            return { success: true, image: await readRemoteImage(request.url) };
          } catch (error) {
            return { success: false, error: String(error?.message || error) };
          }
        }
        if (action === 'WRITE_ANSWER_CLIPBOARD') {
          await candidate.evaluate(value => navigator.clipboard?.writeText?.(value).catch?.(() => {}), String(request.text || ''));
          return { success: true };
        }
        if (action === 'ANSWER_CACHE_GET') {
          return { success: true, item: readAnswerCache(String(request.key || '')) };
        }
        if (action === 'ANSWER_CACHE_SET') {
          return { success: writeAnswerCache(String(request.key || ''), request.item) };
        }
        return { success: false, error: `Unsupported standalone bridge action: ${action}` };
      };
      await installPageHelper(candidate, solve, extensionScripts, {
        ORCHESTRATOR_URL: 'http://127.0.0.1:8787',
        ENABLE_REASONING: false,
        DIAGNOSTIC_LOGS: true
      }, bridge);
      log('page.installed', { url: candidate.url() });
    } catch (error) {
      candidate.__qaStandaloneInstalled = false;
      log('page.install_failed', { url: candidate.url(), message: String(error?.message || error) });
    }
  };

  // A browser tab has its own JavaScript world. Install the hotkey bridge on
  // every existing tab and every tab opened later, not only the first tab.
  await Promise.all((await browser.pages()).map(installOnPage));
  browser.on('targetcreated', target => {
    if (target.type() !== 'page') return;
    void (async () => {
      try { await installOnPage(await target.page()); } catch (error) {
        log('page.install_failed', { message: String(error?.message || error) });
      }
    })();
  });

  if (!reusedBrowser) {
    const page = (await browser.pages())[0] || await browser.newPage();
    // Use Chrome's own New Tab Page instead of navigating automation traffic
    // to google.com. Never navigate an adopted browser: it may be on an exam.
    await page.goto('chrome://newtab/');
  }
  log('browser.started', { executablePath, standaloneLogFile, reused: !!reusedBrowser, profileIndex, profileDirectory, windowCount });
  return browser;
}

module.exports = { findChromeExecutable, launchStandaloneChrome, writeStandaloneLog: log };
