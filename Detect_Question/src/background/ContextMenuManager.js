class ContextMenuManager {
  constructor({ onTriggerAction } = {}) {
    this.onTriggerAction = onTriggerAction || (() => {});
  }

  setupMenus() {
    if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'qa-menu-root', title: 'Question Detect', contexts: ['all'] });
      chrome.contextMenus.create({ parentId: 'qa-menu-root', id: 'qa-solve-single', title: 'Giải câu hiện tại (N)', contexts: ['all'] });
      chrome.contextMenus.create({ parentId: 'qa-menu-root', id: 'qa-solve-continuous', title: 'Giải liên tiếp (Alt + K)', contexts: ['all'] });
    });
  }

  registerListeners() {
    if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
    chrome.runtime?.onInstalled?.addListener(() => this.setupMenus());
    chrome.runtime?.onStartup?.addListener(() => this.setupMenus());
    this.setupMenus();
    chrome.contextMenus.onClicked.addListener((_info, tab) => {
      if (!tab?.id) return;
      this.onTriggerAction(tab, _info.menuItemId === 'qa-solve-continuous' ? 'TRIGGER_CONTINUOUS_SOLVE' : 'TRIGGER_SINGLE_SOLVE');
    });
  }
}

globalThis.ContextMenuManager = ContextMenuManager;
if (typeof module !== 'undefined' && module.exports) module.exports = { ContextMenuManager };
