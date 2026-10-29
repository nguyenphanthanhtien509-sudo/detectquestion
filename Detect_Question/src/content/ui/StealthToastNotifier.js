class StealthToastNotifier {
  static getElement() {
    if (typeof document === 'undefined' || !document.body) return null;
    let element = document.getElementById('qa-solver-status');
    if (!element) {
      element = document.createElement('div');
      element.id = 'qa-solver-status';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      document.body.appendChild(element);
    }
    return element;
  }

  static show(message, type = 'info', duration = 2800) {
    // Keep the quiz page visually silent. Results use showAnswer() below;
    // status, progress, warning, and error notifications deliberately do not
    // render a popup.
    return;

    const element = StealthToastNotifier.getElement();
    if (!element) return;
    Object.assign(element.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
      maxWidth: '360px', padding: '10px 12px', borderRadius: '8px',
      font: '13px/1.4 system-ui, sans-serif', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,.28)',
      letterSpacing: 'normal', whiteSpace: 'normal'
    });
    const colors = { success: '#166534', error: '#b91c1c', warning: '#a16207', info: '#1d4ed8' };
    element.style.background = colors[type] || colors.info;
    element.textContent = String(message || 'Đang xử lý');
    element.hidden = false;
    clearTimeout(StealthToastNotifier.hideTimer);
    StealthToastNotifier.hideTimer = setTimeout(() => { if (element) element.hidden = true; }, Math.max(1200, duration));
  }

  // Compact result badge: only the answer, never explanatory text.
  static showAnswer(answer, duration = 3000) {
    const element = StealthToastNotifier.getElement();
    if (!element) return;
    const text = Array.isArray(answer) ? answer.join(', ') : String(answer ?? '').trim();
    if (!text) return;
    Object.assign(element.style, {
      position: 'fixed', right: '6px', bottom: '6px', zIndex: '2147483647',
      maxWidth: '140px', padding: '0', margin: '0', border: '0', borderRadius: '0',
      font: '700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
      letterSpacing: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      color: '#000', background: 'transparent', boxShadow: 'none'
    });
    element.textContent = text;
    element.hidden = false;
    clearTimeout(StealthToastNotifier.hideTimer);
    StealthToastNotifier.hideTimer = setTimeout(() => { if (element) element.hidden = true; }, Math.max(1200, duration));
  }
}

globalThis.StealthToastNotifier = StealthToastNotifier;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StealthToastNotifier };
}
