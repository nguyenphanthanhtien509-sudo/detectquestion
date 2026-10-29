importScripts(
  '../config/runtime-config.js',
  '../shared/MessageActions.js',
  'ContextMenuManager.js'
);

const CONTENT_SCRIPT_FILES = [
  'src/config/runtime-config.js',
  'src/shared/MessageActions.js',
  'src/content/core/TextUtils.js',
  'src/content/core/DomMediaExtractor.js',
  'src/content/scanner/MoodleScanner.js',
  'src/content/scanner/QuizCardScanner.js',
  'src/content/scanner/AnchorBasedScanner.js',
  'src/content/scanner/GenericDomScanner.js',
  'src/content/scanner/ExamDomScanner.js',
  'src/content/clicker/DomAnswerClicker.js',
  'src/content/solver/AdaptiveDebateApiClient.js',
  'src/content/solver/ContinuousSolveRunner.js',
  'src/content/ui/StealthToastNotifier.js',
  'src/content/ui/CaptureSelectionOverlay.js',
  'src/content/navigation/MoodleNavigationHandler.js',
  'src/content/controller/HotKeyManager.js',
  'src/content/index.js'
];

function isAllowedLocalEndpoint(endpoint) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(String(endpoint || '').replace(/\/$/, ''));
}

async function callAdaptiveDebateBackend({ endpoint, token, requestId, payload }) {
  const baseUrl = String(endpoint || '').replace(/\/$/, '');
  if (!isAllowedLocalEndpoint(baseUrl)) throw new Error('Adaptive Debate endpoint is not an allowed local endpoint.');
  if (!token || !requestId || !payload) throw new Error('Adaptive debate backend is not configured.');
  const response = await fetch(`${baseUrl}/v1/solve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'idempotency-key': requestId
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.message || body?.error || `Adaptive debate request failed (${response.status}).`);
  return body;
}

function isRemoteImageUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function toBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function readImageAsBase64(url) {
  if (!isRemoteImageUrl(url)) throw new Error('Image URL must use http or https.');
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Unable to fetch image (HTTP ${response.status}).`);
  const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) throw new Error(`Unsupported image MIME type: ${mimeType || 'unknown'}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 1_000_000) throw new Error('Image must be between 1 byte and 1 MB.');
  return { mimeType, data: toBase64(bytes) };
}

async function injectAndTrigger(tabId, action) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { action }, async () => {
    if (!chrome.runtime.lastError) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_SCRIPT_FILES });
      chrome.tabs.sendMessage(tabId, { action }, () => {});
    } catch (_) {}
  });
}

let clipboardDocumentCreating = null;
async function ensureClipboardDocument() {
  const url = 'src/background/clipboard.html';
  const contexts = await chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(url)] }) || [];
  if (contexts.length) return;
  if (!clipboardDocumentCreating) {
    clipboardDocumentCreating = chrome.offscreen.createDocument({
      url,
      reasons: ['CLIPBOARD'],
      justification: 'Copy the explicitly requested AI answer so the user can paste it manually.'
    }).finally(() => { clipboardDocumentCreating = null; });
  }
  await clipboardDocumentCreating;
}

async function copyAnswerToClipboard(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  await ensureClipboardDocument();
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'WRITE_ANSWER_CLIPBOARD_OFFSCREEN', text }, response => resolve(response?.success === true));
  });
}

function activeTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab || null);
}

const contextMenuManager = new ContextMenuManager({
  onTriggerAction: (tab, action) => injectAndTrigger(tab?.id, action)
});
contextMenuManager.registerListeners();

chrome.commands?.onCommand?.addListener(async command => {
  const tab = await activeTab();
  if (!tab?.id) return;
  if (command === 'solve-single-question' || command === 'solve-all-questions') return injectAndTrigger(tab.id, 'TRIGGER_SINGLE_SOLVE');
  if (command === 'solve-single-model') return injectAndTrigger(tab.id, 'TRIGGER_SINGLE_MODEL_SOLVE');
  if (command === 'solve-continuous') return injectAndTrigger(tab.id, 'TRIGGER_CONTINUOUS_SOLVE');
});

chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
  const action = globalThis.MessageActions || {};
  if (request.action === (action.REQUEST_TOP_FRAME_SINGLE_SOLVE || 'REQUEST_TOP_FRAME_SINGLE_SOLVE')) {
    if (!sender?.tab?.id) { sendResponse({ success: false }); return false; }
    chrome.tabs.sendMessage(sender.tab.id, { action: action.TRIGGER_SINGLE_SOLVE || 'TRIGGER_SINGLE_SOLVE' }, { frameId: 0 }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }
  if (request.action === (action.REQUEST_TOP_FRAME_SINGLE_MODEL_SOLVE || 'REQUEST_TOP_FRAME_SINGLE_MODEL_SOLVE')) {
    if (!sender?.tab?.id) { sendResponse({ success: false }); return false; }
    chrome.tabs.sendMessage(sender.tab.id, { action: action.TRIGGER_SINGLE_MODEL_SOLVE || 'TRIGGER_SINGLE_MODEL_SOLVE' }, { frameId: 0 }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }
  if (request.action === (action.REQUEST_TOP_FRAME_REVIEW_CACHE || 'REQUEST_TOP_FRAME_REVIEW_CACHE')) {
    if (!sender?.tab?.id) { sendResponse({ success: false }); return false; }
    chrome.tabs.sendMessage(sender.tab.id, { action: action.TRIGGER_REVIEW_CACHE || 'TRIGGER_REVIEW_CACHE' }, { frameId: 0 }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }
  if (request.action === (action.CAPTURE_VISIBLE_TAB || 'CAPTURE_VISIBLE_TAB')) {
    if (!sender?.tab?.windowId) { sendResponse({ success: false, error: 'Capture is only available from an open tab.' }); return false; }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 92 })
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(error => sendResponse({ success: false, error: error?.message || 'Unable to capture screen.' }));
    return true;
  }
  if (request.action === (action.READ_IMAGE_AS_BASE64 || 'READ_IMAGE_AS_BASE64')) {
    readImageAsBase64(request.url)
      .then(image => sendResponse({ success: true, image }))
      .catch(error => sendResponse({ success: false, error: error?.message || 'Unable to read image bytes.' }));
    return true;
  }
  if (request.action === (action.WRITE_ANSWER_CLIPBOARD || 'WRITE_ANSWER_CLIPBOARD')) {
    copyAnswerToClipboard(request.text).then(success => sendResponse({ success })).catch(() => sendResponse({ success: false }));
    return true;
  }
  if (request.action === (action.ANSWER_CACHE_GET || 'ANSWER_CACHE_GET')) {
    chrome.storage.local.get([request.key], values => {
      sendResponse({ success: true, item: values?.[request.key] || null });
    });
    return true;
  }
  if (request.action === (action.ANSWER_CACHE_SET || 'ANSWER_CACHE_SET')) {
    if (!request.key || !request.item || typeof request.item !== 'object') {
      sendResponse({ success: false, error: 'Invalid answer cache entry.' });
      return false;
    }
    chrome.storage.local.set({ [request.key]: request.item }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }
  if (request.action !== (action.CALL_ADAPTIVE_DEBATE || 'CALL_ADAPTIVE_DEBATE')) return false;
  callAdaptiveDebateBackend(request)
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONTENT_SCRIPT_FILES, callAdaptiveDebateBackend, isAllowedLocalEndpoint, isRemoteImageUrl, readImageAsBase64 };
}
