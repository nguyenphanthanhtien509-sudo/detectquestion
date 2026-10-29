chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action !== 'WRITE_ANSWER_CLIPBOARD_OFFSCREEN') return false;
  const text = typeof request.text === 'string' ? request.text : '';
  if (!text) { sendResponse({ success: false }); return false; }
  navigator.clipboard.writeText(text)
    .then(() => sendResponse({ success: true }))
    .catch(error => sendResponse({ success: false, error: error?.message || 'Clipboard write failed.' }));
  return true;
});
