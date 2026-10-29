class DomAnswerClicker {
  // The caller decides whether a result may be applied. This class only
  // performs an interaction after the backend acceptance contract passes.
  static MANUAL_REVIEW_MODE = false;

  static clearSuggestedMarkers(container) {
    if (!container?.querySelectorAll) return;
    container.querySelectorAll('.qa-ai-answer-period').forEach(marker => marker.remove());
    container.querySelectorAll('[data-qa-ai-suggested]').forEach(element => element.removeAttribute('data-qa-ai-suggested'));
    container.querySelectorAll('option[data-qa-ai-original-text]').forEach(option => {
      option.text = option.dataset.qaAiOriginalText;
      option.style.removeProperty('color');
      delete option.dataset.qaAiOriginalText;
    });
  }

  static markSuggestedAnswer(targetInput, wrapperEl) {
    // Suggestions are intentionally non-invasive: do not select, decorate,
    // or otherwise modify any answer control on the quiz page.
    return false;
  }

  static isOptionSelected(opt) {
    if (!opt) return false;
    const input = opt.input || (opt.element?.tagName === 'INPUT' ? opt.element : opt.element?.querySelector?.('input'));
    if (input && (input.type === 'radio' || input.type === 'checkbox')) {
      if (input.checked) return true;
    }
    const el = opt.element || opt.label || input;
    if (!el) return false;
    if (el.classList?.contains('selected') || el.classList?.contains('active') || el.classList?.contains('checked')) {
      return true;
    }
    if (el.getAttribute?.('aria-checked') === 'true') {
      return true;
    }
    if (el.querySelector?.('input[type="radio"]:checked, input[type="checkbox"]:checked, .ant-checkbox-checked, .ant-radio-checked')) {
      return true;
    }
    const className = String(el.className || '');
    if (className.includes('border-blue-600') || className.includes('border-purple-600') || className.includes('ring-1') || className.includes('ring-emerald-500')) {
      return true;
    }
    return false;
  }

  static forceClickTarget(targetInput, wrapperEl) {
    const input = (targetInput && targetInput.tagName === 'INPUT') 
      ? targetInput 
      : (wrapperEl?.querySelector?.('input:not([disabled])') || targetInput?.querySelector?.('input:not([disabled])') || targetInput);
    
    const row = wrapperEl || input?.closest?.('.r0, .r1, .form-check, .custom-control, .d-flex, label, tr, li, div') || input?.parentElement || input;
    const doc = input?.ownerDocument || (typeof document !== 'undefined' ? document : null);

    if (input && (input.disabled || input.getAttribute?.('aria-disabled') === 'true')) return false;
    if (row && (row.disabled || row.getAttribute?.('aria-disabled') === 'true')) return false;

    if (input && (input.type === 'radio' || input.type === 'checkbox') && input.checked) return true;

    // Tìm thẻ label liên kết
    const label = (input?.id && doc ? doc.querySelector(`label[for="${input.id}"]`) : null)
      || input?.closest?.('label')
      || row?.querySelector?.('label')
      || (row?.tagName === 'LABEL' ? row : null);

    const mainTarget = label || input || row;

    try {
      mainTarget?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch (e) {}

    // 1. Kích hoạt chuỗi sự kiện chuột chuẩn xác trên target chính (label hoặc input)
    const clickElement = label || input || row;
    if (typeof MouseEvent !== 'undefined') {
      const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
      mouseEvents.forEach(type => {
        try {
          const evt = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: typeof window !== 'undefined' ? window : null,
            buttons: 1
          });
          clickElement?.dispatchEvent?.(evt);
          if (input && input !== clickElement) {
            input?.dispatchEvent?.(evt);
          }
        } catch (e) {}
      });
    }

    // 2. Kích hoạt Native Click
    try {
      if (typeof clickElement?.click === 'function') {
        clickElement.click();
      }
    } catch (e) {}

    if (input && input !== clickElement) {
      try {
        if (typeof input?.click === 'function') {
          input.click();
        }
      } catch (e) {}
    }

    if (row && row !== clickElement && row !== input) {
      try {
        if (typeof row?.click === 'function') {
          row.click();
        }
      } catch (e) {}
    }

    // 3. Cập nhật thuộc tính checked qua prototype setter nếu click chưa kích hoạt được (vượt qua mọi override của framework)
    if (input && (input.type === 'radio' || input.type === 'checkbox') && !input.checked) {
      try {
        const proto = typeof window !== 'undefined' && window.HTMLInputElement?.prototype;
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'checked')?.set : null;
        if (nativeSetter) {
          nativeSetter.call(input, true);
        } else {
          input.checked = true;
        }
      } catch (e) {
        input.checked = true;
      }
    }

    // 4. Kích hoạt Input & Change Events trên input và form
    if (input && typeof Event !== 'undefined') {
      try {
        input.dispatchEvent?.(new Event('input', { bubbles: true, cancelable: true, composed: true }));
        input.dispatchEvent?.(new Event('change', { bubbles: true, cancelable: true, composed: true }));
      } catch (e) {}

      try {
        const form = input.closest?.('form');
        if (form) {
          form.dispatchEvent?.(new Event('input', { bubbles: true, cancelable: true }));
          form.dispatchEvent?.(new Event('change', { bubbles: true, cancelable: true }));
        }
      } catch (e) {}
    }

    // 5. Cập nhật các class trạng thái nếu trang web dùng custom visual state
    try {
      if (row?.classList?.add) {
        row.classList.add('active', 'selected', 'checked');
        row.setAttribute?.('aria-checked', 'true');
      }
      if (label?.classList?.add) {
        label.classList.add('active', 'selected', 'checked');
        label.setAttribute?.('aria-checked', 'true');
      }
    } catch (e) {}

    return !input || !['radio', 'checkbox'].includes(input.type) || input.checked === true;
  }

  static autoSelectAnswerOnPage(qaId, targetKey, optionText = '') {
    if (!targetKey && !optionText) return false;
    const cleanKey = (targetKey || '').toUpperCase().trim();
    const cleanOpt = TextUtils.normalizeForMatch(optionText);

    // 1. Tìm chính xác theo data-qa-for và data-qa-opt
    if (qaId && cleanKey) {
      const exactInput = document.querySelector(`input[data-qa-for="${qaId}"][data-qa-opt="${cleanKey}"]`);
      if (exactInput) {
        const row = document.querySelector(`[data-qa-for="${qaId}"][data-qa-opt="${cleanKey}"]:not(input)`) || exactInput.parentElement;
        return DomAnswerClicker.forceClickTarget(exactInput, row);
      }
      const exactWrapper = document.querySelector(`[data-qa-for="${qaId}"][data-qa-opt="${cleanKey}"]`);
      if (exactWrapper) {
        const inp = exactWrapper.querySelector('input') || exactWrapper;
        return DomAnswerClicker.forceClickTarget(inp, exactWrapper);
      }
    }

    // 2. Tìm trong container câu hỏi nếu có qaId
    if (qaId) {
      const card = document.querySelector(`[data-qa-id="${qaId}"]`);
      if (card) {
        const selected = DomAnswerClicker.selectInCard(card, cleanKey, cleanOpt);
        if (selected) return true;
      }
    }

    // 3. Quét các thẻ câu hỏi trên trang
    const allCards = Array.from(document.querySelectorAll('.que, .yh-question-card, [data-qa-id], [class*="question-card"], [id^="q-"], [id^="question-"]'));
    for (const card of allCards) {
      const selected = DomAnswerClicker.selectInCard(card, cleanKey, cleanOpt);
      if (selected) return true;
    }

    // 4. Fallback quét toàn bộ radio/checkbox trên trang
    const allInputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(inp => inp.value !== '-1' && !inp.closest('.clear-choice, .clearchoice, .clear'));

    for (const inp of allInputs) {
      const cont = inp.closest('label, div, li, tr') || inp.parentElement;
      const txt = TextUtils.normalizeForMatch(cont?.innerText || '');
      if (cleanOpt && txt && (txt === cleanOpt || txt.includes(cleanOpt) || cleanOpt.includes(txt))) {
        return DomAnswerClicker.forceClickTarget(inp, cont);
      }
    }

    return false;
  }

  static selectInCard(card, targetKey, optionText = '') {
    if (!card) return false;
    const cleanKey = (targetKey || '').toUpperCase().trim();
    const cleanOpt = TextUtils.normalizeForMatch(optionText);

    // 1. Thử theo data-qa-opt đã được gán trước đó
    if (cleanKey) {
      const optEl = card.querySelector(`input[data-qa-opt="${cleanKey}"], [data-qa-opt="${cleanKey}"]`);
      if (optEl) {
        const inp = optEl.tagName === 'INPUT' ? optEl : optEl.querySelector('input') || optEl;
        const row = optEl.tagName === 'INPUT' ? optEl.parentElement : optEl;
        return DomAnswerClicker.forceClickTarget(inp, row);
      }
    }

    // Lọc danh sách radio/checkbox hợp lệ của câu hỏi (loại trừ Xóa lựa chọn của Moodle)
    const validInputs = Array.from(card.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(inp => {
        if (inp.value === '-1') return false;
        if (inp.closest('.clear-choice, .clearchoice, .clear, .clear-choice-option')) return false;
        const label = card.querySelector(`label[for="${inp.id}"]`) || inp.closest('label');
        const txt = (label?.innerText || label?.textContent || '').toLowerCase();
        if (txt.includes('xóa lựa chọn') || txt.includes('clear my choice')) return false;
        return true;
      });

    // 2. Thử theo cấu trúc answernumber / prefix chữ cái A, B, C, D
    for (const inp of validInputs) {
      const row = inp.closest('.r0, .r1, .form-check, .custom-control, .d-flex, tr, li, div, label') || inp.parentElement;
      const label = (inp.id ? card.querySelector(`label[for="${inp.id}"]`) : null) || inp.closest('label') || row;

      const numSpan = label?.querySelector('.answernumber, .option-letter, .choice-label');
      if (numSpan) {
        const spanTxt = (numSpan.innerText || numSpan.textContent || '').trim().toUpperCase();
        const sm = spanTxt.match(/([A-Za-zĐđ0-9])/);
        if (sm && sm[1] === cleanKey) {
          return DomAnswerClicker.forceClickTarget(inp, row);
        }
      }

      const rawTxt = label?.innerText || label?.textContent || row?.innerText || '';
      const m = rawTxt.match(TextUtils.OPTION_PREFIX_REGEX);
      if (m && m[1].toUpperCase() === cleanKey) {
        return DomAnswerClicker.forceClickTarget(inp, row);
      }
    }

    // 3. Thử theo nội dung text tương đồng
    if (cleanOpt) {
      for (const inp of validInputs) {
        const row = inp.closest('.r0, .r1, .form-check, .custom-control, .d-flex, tr, li, div, label') || inp.parentElement;
        const label = (inp.id ? card.querySelector(`label[for="${inp.id}"]`) : null) || inp.closest('label') || row;
        const rawTxt = label?.innerText || label?.textContent || row?.innerText || '';
        const normTxt = TextUtils.normalizeForMatch(rawTxt);
        if (normTxt && (normTxt === cleanOpt || normTxt.includes(cleanOpt) || cleanOpt.includes(normTxt))) {
          return DomAnswerClicker.forceClickTarget(inp, row);
        }
      }
    }

    // 4. BÁM SÁT CẤU TRÚC THỨ TỰ (Index structural fallback):
    // A -> 0, B -> 1, C -> 2, D -> 3, E -> 4
    if (cleanKey && cleanKey.length === 1 && validInputs.length >= 2) {
      const keyIndex = cleanKey.charCodeAt(0) - 65;
      if (keyIndex >= 0 && keyIndex < validInputs.length) {
        const targetInp = validInputs[keyIndex];
        const row = targetInp.closest('.r0, .r1, .form-check, .custom-control, .d-flex, tr, li, div') || targetInp.parentElement;
        return DomAnswerClicker.forceClickTarget(targetInp, row);
      }
    }

    // 5. Thử các option tuỳ chỉnh trên card (div.cursor-pointer, ant-radio, card buttons)
    const customOptions = Array.from(card.querySelectorAll('div.cursor-pointer, .ant-radio-wrapper, .ant-checkbox-wrapper, label.cursor-pointer, [class*="option-item"]'));
    if (customOptions.length >= 2) {
      if (cleanOpt) {
        for (const optEl of customOptions) {
          const norm = TextUtils.normalizeForMatch(optEl.innerText || optEl.textContent || '');
          if (norm && (norm === cleanOpt || norm.includes(cleanOpt) || cleanOpt.includes(norm))) {
            return DomAnswerClicker.forceClickTarget(optEl.querySelector('input') || optEl, optEl);
          }
        }
      }
      if (cleanKey && cleanKey.length === 1) {
        const keyIndex = cleanKey.charCodeAt(0) - 65;
        if (keyIndex >= 0 && keyIndex < customOptions.length) {
          const optEl = customOptions[keyIndex];
          return DomAnswerClicker.forceClickTarget(optEl.querySelector('input') || optEl, optEl);
        }
      }
    }

    return false;
  }

  static applyCaptureSolveResults(items) {
    if (!Array.isArray(items) || items.length === 0) return;

    items.forEach(item => {
      const qNum = item.num || 1;

      // 1. Đúng / Sai
      if (item.type === 'true_false_group' && item.answers) {
        const qCard = document.querySelector(
          `[data-qa-id="qa-detected-card-${qNum}"], ` +
          `[data-qa-id="qa-detected-moodle-${qNum}"], ` +
          `[data-qa-id="qa-detected-generic-${qNum}"], ` +
          `[data-qa-id="qa-detected-anchor-${qNum}"], ` +
          `[data-qa-id="qa-detected-direct-${qNum}"]`
        );
        const scope = qCard || document;
        Object.entries(item.answers).forEach(([key, val]) => {
          const isTrue = /đúng|true/i.test(val);
          const optCode = `${key.toUpperCase()}_${isTrue ? 'TRUE' : 'FALSE'}`;
          const target = scope.querySelector(`[data-qa-opt="${optCode}"]`);
          if (target) {
            DomAnswerClicker.forceClickTarget(target.tagName === 'INPUT' ? target : target.querySelector('input') || target, target);
          }
        });
        return;
      }

      // 2. Trắc nghiệm 1 đáp án A, B, C, D
      const answerKey = (item.answer || '').toUpperCase().trim();
      const optionText = (item.optionText || '').trim();
      if (!answerKey && !optionText) return;

      let selected = false;
      if (window.__qaLastSnippedCard && document.body.contains(window.__qaLastSnippedCard)) {
        selected = DomAnswerClicker.selectInCard(window.__qaLastSnippedCard, answerKey, optionText);
      }

      if (!selected) {
        let qCard = document.querySelector(
          `[data-qa-id="qa-detected-card-${qNum}"], ` +
          `[data-qa-id="qa-detected-moodle-${qNum}"], ` +
          `[data-qa-id="qa-detected-generic-${qNum}"], ` +
          `[data-qa-id="qa-detected-anchor-${qNum}"], ` +
          `[data-qa-id="qa-detected-direct-${qNum}"]`
        );
        if (!qCard) {
          const allCards = Array.from(document.querySelectorAll('.que, .yh-question-card, [class*="question-card"], [id^="q-"], [id^="question-"]'));
          for (const card of allCards) {
            const numElem = card.querySelector('.yh-question-stem__label, .qno, .no, h3, h4, h5') || card;
            const numTxt = (numElem.innerText || numElem.textContent || '').trim();
            const m = numTxt.match(/(?:question|câu|câu\s*hỏi|quest|q|bài)\s*(\d+)\b/i);
            if (m && parseInt(m[1], 10) === qNum) {
              qCard = card;
              break;
            }
          }
        }
        if (qCard) {
          selected = DomAnswerClicker.selectInCard(qCard, answerKey, optionText);
        }
      }

      if (!selected) {
        DomAnswerClicker.autoSelectAnswerOnPage(`qa-detected-moodle-${qNum}`, answerKey, optionText) ||
        DomAnswerClicker.autoSelectAnswerOnPage(`qa-detected-card-${qNum}`, answerKey, optionText) ||
        DomAnswerClicker.autoSelectAnswerOnPage(`qa-detected-direct-${qNum}`, answerKey, optionText) ||
        DomAnswerClicker.autoSelectAnswerOnPage(null, answerKey, optionText);
      }
    });
  }

  static fillTextInput(targetInput, text) {
    if (!targetInput) return false;
    const input = targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA'
      ? targetInput
      : targetInput.querySelector?.('input[type="text"], input[type="number"], input:not([type]), textarea');
    if (!input) return false;

    // Do not write to disabled, readonly, or Ant Design combobox inputs
    if (input.disabled || input.readOnly || input.getAttribute?.('role') === 'combobox' || input.classList?.contains?.('ant-select-input')) {
      return false;
    }

    try {
      input.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      input.focus?.();
      const valStr = String(text != null ? text : '').trim();

      const proto = typeof window !== 'undefined'
        ? (input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype)
        : null;
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      if (nativeSetter) {
        nativeSetter.call(input, valStr);
      } else {
        input.value = valStr;
      }

      if (typeof Event !== 'undefined') {
        input.dispatchEvent?.(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent?.(new Event('change', { bubbles: true, composed: true }));
      } else {
        input.dispatchEvent?.({ type: 'input', bubbles: true });
        input.dispatchEvent?.({ type: 'change', bubbles: true });
      }
      input.blur?.();
      return input.value === valStr;
    } catch (_) {
      try {
        input.value = String(text != null ? text : '').trim();
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  static selectDropdownOption(selectEl, valueOrText) {
    if (!selectEl) return false;

    // 1. Ant Design Select (role="combobox" or container with .ant-select)
    const isAntSelect = selectEl.classList?.contains?.('ant-select') ||
      selectEl.closest?.('.ant-select') ||
      selectEl.getAttribute?.('role') === 'combobox' ||
      selectEl.classList?.contains?.('ant-select-input');
    if (isAntSelect) {
      return DomAnswerClicker.selectAntDesignOption(selectEl, valueOrText);
    }

    // 2. Native HTML <select>
    const select = selectEl.tagName === 'SELECT' ? selectEl : selectEl.querySelector?.('select');
    if (!select || select.disabled) return false;

    try {
      select.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      const targetStr = String(valueOrText || '').trim().toLowerCase();
      let matchedIndex = -1;

      for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        const optVal = String(opt.value ?? '').trim().toLowerCase();
        const optTxt = (opt.dataset?.qaAiOriginalText || opt.text || '').trim().toLowerCase();
        if (optVal === targetStr || optTxt === targetStr) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) {
        for (let i = 0; i < select.options.length; i++) {
          const opt = select.options[i];
          const optTxt = (opt.dataset?.qaAiOriginalText || opt.text || '').trim().toLowerCase();
          if (optTxt && (optTxt.includes(targetStr) || targetStr.includes(optTxt))) {
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        const option = select.options[matchedIndex];
        if (DomAnswerClicker.MANUAL_REVIEW_MODE) {
          const originalText = option.dataset.qaAiOriginalText || option.text;
          option.dataset.qaAiOriginalText = originalText;
          option.text = `${originalText}.`;
          option.style.color = '#000';
          select.setAttribute('data-qa-ai-suggested', 'true');
          return true;
        }

        const proto = typeof window !== 'undefined' ? window.HTMLSelectElement?.prototype : null;
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'selectedIndex')?.set : null;
        if (nativeSetter) nativeSetter.call(select, matchedIndex);
        else select.selectedIndex = matchedIndex;
        select.value = option.value;
        if (typeof Event !== 'undefined') {
          select.dispatchEvent?.(new Event('input', { bubbles: true }));
          select.dispatchEvent?.(new Event('change', { bubbles: true }));
        } else {
          select.dispatchEvent?.({ type: 'input', bubbles: true });
          select.dispatchEvent?.({ type: 'change', bubbles: true });
        }
        select.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        return select.value === option.value || select.selectedIndex === matchedIndex;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  static selectAntDesignOption(selectEl, valueOrText) {
    if (!selectEl) return false;
    const container = selectEl.closest?.('.ant-select') || (selectEl.classList?.contains?.('ant-select') ? selectEl : selectEl.parentElement?.closest?.('.ant-select')) || selectEl;
    const targetStr = String(valueOrText || '').trim().toLowerCase();

    // Strategy 1: React Component Props / Fiber onChange synchronization
    const reactHosts = [container, selectEl, container.querySelector?.('input')].filter(Boolean);
    for (const host of reactHosts) {
      for (const key of Object.keys(host)) {
        if (key.startsWith('__reactProps$') && host[key]) {
          const props = host[key];
          if (typeof props.onChange === 'function') {
            const options = props.options || [];
            const matched = options.find(o => {
              const val = String(o?.value ?? '').trim().toLowerCase();
              const txt = String(o?.label ?? o?.text ?? '').trim().toLowerCase();
              return val === targetStr || txt === targetStr || (txt && (txt.includes(targetStr) || targetStr.includes(txt)));
            });
            if (matched) {
              props.onChange(matched.value, matched);
              return true;
            } else if (valueOrText) {
              props.onChange(valueOrText, { value: valueOrText, label: valueOrText });
              return true;
            }
          }
        }
      }
    }

    // Strategy 2: Standard DOM simulation (click selector -> open dropdown -> click matching option)
    try {
      const selector = container.querySelector?.('.ant-select-selector') || container;
      selector.dispatchEvent?.(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      selector.click?.();

      const doc = container.ownerDocument || document;
      const dropdowns = Array.from(doc.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-select-dropdown'));
      const activeDropdown = dropdowns[dropdowns.length - 1];
      if (activeDropdown) {
        const optionNodes = Array.from(activeDropdown.querySelectorAll('.ant-select-item-option, [role="option"]'));
        let targetNode = optionNodes.find(node => {
          const title = (node.getAttribute?.('title') || node.getAttribute?.('aria-label') || '').trim().toLowerCase();
          const text = (node.innerText || node.textContent || '').trim().toLowerCase();
          return title === targetStr || text === targetStr;
        });
        if (!targetNode) {
          targetNode = optionNodes.find(node => {
            const text = (node.innerText || node.textContent || '').trim().toLowerCase();
            return text && (text.includes(targetStr) || targetStr.includes(text));
          });
        }
        if (targetNode) {
          targetNode.dispatchEvent?.(new MouseEvent('mouseenter', { bubbles: true }));
          targetNode.dispatchEvent?.(new MouseEvent('mousedown', { bubbles: true }));
          targetNode.dispatchEvent?.(new MouseEvent('mouseup', { bubbles: true }));
          targetNode.click?.();
          return true;
        }
      }
    } catch (_) {}

    return false;
  }

}

globalThis.DomAnswerClicker = DomAnswerClicker;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DomAnswerClicker };
}
