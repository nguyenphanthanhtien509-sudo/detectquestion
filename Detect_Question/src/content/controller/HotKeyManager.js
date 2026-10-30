class HotKeyManager {
  constructor({ onSingleSolve, onSingleModelSolve, onContinuousSolve, onCaptureSolve, onCaptureSingleModelSolve, onShowCachedAnswer, onStop } = {}) {
    this.onSingleSolve = onSingleSolve || (() => {});
    this.onSingleModelSolve = onSingleModelSolve || (() => {});
    this.onContinuousSolve = onContinuousSolve || (() => {});
    this.onCaptureSolve = onCaptureSolve || (() => {});
    this.onCaptureSingleModelSolve = onCaptureSingleModelSolve || (() => {});
    this.onShowCachedAnswer = onShowCachedAnswer || (() => {});
    this.onStop = onStop || (() => {});
  }

  register() {
    if (typeof window === 'undefined') return;
    const isTypingTarget = target => target && (target.tagName === 'TEXTAREA' || target.isContentEditable || target.getAttribute?.('contenteditable') === 'true');
    const isSingleModelKey = e => e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM');
    const isCaptureKey = e => e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'y' || e.key === 'Y' || e.code === 'KeyY') && !isTypingTarget(e.target);
    const isCaptureSingleModelKey = e => e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'u' || e.key === 'U' || e.code === 'KeyU') && !isTypingTarget(e.target);
    const isCacheKey = e => e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB');
    const stopEvent = e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
    };
    const handleKeyDown = (e) => {
      const isEsc = e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27;
      // The active selection owns Escape; let its listener remove the overlay.
      if (isEsc && document.getElementById('qa-capture-selection-overlay')) return;
      if (isEsc) { stopEvent(e); this.onStop(); return; }
      if (e.repeat) return;
      if (isSingleModelKey(e)) {
        stopEvent(e);
        if (window.top !== window && globalThis.chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: globalThis.MessageActions?.REQUEST_TOP_FRAME_SINGLE_MODEL_SOLVE || 'REQUEST_TOP_FRAME_SINGLE_MODEL_SOLVE' });
        } else {
          this.onSingleModelSolve();
        }
        return;
      }
      if (isCacheKey(e)) {
        stopEvent(e);
        if (window.top !== window && globalThis.chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: globalThis.MessageActions?.REQUEST_TOP_FRAME_REVIEW_CACHE || 'REQUEST_TOP_FRAME_REVIEW_CACHE' });
        } else {
          this.onShowCachedAnswer();
        }
        return;
      }
      const isAltK = e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK');
      if (isAltK) { stopEvent(e); this.onContinuousSolve(); return; }
      if (isCaptureKey(e)) { stopEvent(e); this.onCaptureSolve(); return; }
      if (isCaptureSingleModelKey(e)) { stopEvent(e); this.onCaptureSingleModelSolve(); }
    };

    // Some host pages attach their navigation shortcut to keypress/keyup
    // rather than keydown. These listeners swallow only the solve key after
    // the keydown handler has started the request; typing in text fields is
    // intentionally left untouched.
    const suppressSolveKeyFollowups = e => {
      if (isSingleModelKey(e) || isCaptureKey(e) || isCaptureSingleModelKey(e) || isCacheKey(e)) stopEvent(e);
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    window.addEventListener('keypress', suppressSolveKeyFollowups, { capture: true, passive: false });
    window.addEventListener('keyup', suppressSolveKeyFollowups, { capture: true, passive: false });
    if (typeof document !== 'undefined') {
      document.addEventListener('keypress', suppressSolveKeyFollowups, { capture: true, passive: false });
      document.addEventListener('keyup', suppressSolveKeyFollowups, { capture: true, passive: false });
    }
  }
}

globalThis.HotKeyManager = HotKeyManager;
if (typeof module !== 'undefined' && module.exports) module.exports = { HotKeyManager };
