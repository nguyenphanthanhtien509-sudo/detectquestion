class ExamDomScanner {
  static getMainScanRoot(root = (typeof document !== 'undefined' ? document : null)) {
    if (!root) return null;
    const candidateSelectors = [
      'form#responseform',
      '#region-main',
      'section#region-main',
      '#region-main-box',
      '#page-content',
      'main',
      '#main',
      '[role="main"]',
      '.quiz-content',
      '.exam-content',
      '.paper-container',
      '.ant-layout-content'
    ];

    for (const sel of candidateSelectors) {
      try {
        if (typeof root.matches === 'function' && root.matches(sel)) {
          return root;
        }
        const el = root.querySelector(sel);
        if (el && el.querySelector('.que, .yh-question-card, [class*="question"], [id^="q-"], [id^="question-"], input[type="radio"], input[type="checkbox"]')) {
          return el;
        }
      } catch (e) {}
    }

    return root.body || (root.documentElement || root);
  }

  static scanAll(root = null) {
    const doc = (typeof document !== 'undefined' ? document : null);
    const docRoot = doc?.body || doc;
    const scanRoot = ExamDomScanner.getMainScanRoot(root || doc);
    if (!scanRoot) return [];

    const passageMap = DomMediaExtractor.extractReadingPassages(scanRoot);

    // 1. Quét theo Moodle (.que)
    let questions = MoodleScanner.scan(scanRoot, passageMap);
    let valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    // 2. Quét theo QuizCard (.yh-question-card, .exam-question, ...)
    questions = QuizCardScanner.scan(scanRoot, passageMap);
    valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    // 3. Quét theo Anchor Grouping & LCA
    questions = AnchorBasedScanner.scan(scanRoot, passageMap);
    valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    // 4. Quét theo Generic DOM Header
    questions = GenericDomScanner.scan(scanRoot, passageMap);
    valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    // Modern quiz apps often use ordinary buttons rather than native radio
    // controls. This must run before generic form controls, otherwise a setup
    // dropdown such as “Test Mode” can be mistaken for the current question.
    questions = ExamDomScanner.scanButtonChoiceGroups(scanRoot, passageMap);
    valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    questions = ExamDomScanner.scanFormValueControls(scanRoot, passageMap);
    valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    // Fallback toàn trang nếu scanRoot bị thu hẹp
    if (docRoot && scanRoot !== docRoot) {
      questions = MoodleScanner.scan(docRoot, passageMap);
      valid = ExamDomScanner.filterValidQuestions(questions);
      if (valid.length > 0) return valid;

      questions = QuizCardScanner.scan(docRoot, passageMap);
      valid = ExamDomScanner.filterValidQuestions(questions);
      if (valid.length > 0) return valid;

      questions = AnchorBasedScanner.scan(docRoot, passageMap);
      valid = ExamDomScanner.filterValidQuestions(questions);
      if (valid.length > 0) return valid;

      questions = GenericDomScanner.scan(docRoot, passageMap);
      valid = ExamDomScanner.filterValidQuestions(questions);
      if (valid.length > 0) return valid;

      questions = ExamDomScanner.scanButtonChoiceGroups(docRoot, passageMap);
      valid = ExamDomScanner.filterValidQuestions(questions);
      if (valid.length > 0) return valid;

      questions = ExamDomScanner.scanFormValueControls(docRoot, passageMap);
      valid = ExamDomScanner.filterValidQuestions(questions);
      if (valid.length > 0) return valid;
    }

    // 5. Ultimate Fallback: Trực tiếp tìm mọi nhóm radio/checkbox trên DOM
    questions = ExamDomScanner.scanDirectInputGroups(doc || scanRoot, passageMap);
    valid = ExamDomScanner.filterValidQuestions(questions);
    if (valid.length > 0) return valid;

    return [];
  }

  // Invoked only by the user-triggered solve shortcut. It records the exact
  // DOM evidence used by the detector without enabling noisy global logging.
  static logDiagnostics(questions, { trigger = 'manual', root = null } = {}) {
    if (typeof globalThis === 'undefined' || globalThis.QA_DIAGNOSTICS_ENABLED === false) return null;

    const doc = typeof document !== 'undefined' ? document : null;
    const scanRoot = ExamDomScanner.getMainScanRoot(root || doc);
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const clip = (value, max = 500) => {
      const text = clean(value);
      return text.length > max ? `${text.slice(0, max)}…` : text;
    };
    const domHint = element => {
      if (!element) return null;
      const tag = String(element.tagName || '').toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList || []).slice(0, 4).map(name => `.${name}`).join('');
      return `${tag}${id}${classes}` || null;
    };
    const control = element => ({
      tag: String(element?.tagName || '').toLowerCase(),
      type: String(element?.type || '').toLowerCase() || null,
      id: element?.id || null,
      name: element?.name || null,
      value: element?.value ?? null,
      disabled: !!element?.disabled,
      readOnly: !!element?.readOnly
    });
    const list = Array.isArray(questions) ? questions : [];
    const rawCards = scanRoot?.querySelectorAll
      ? Array.from(scanRoot.querySelectorAll('.que, [class*="que "], div[id^="q"], div[id^="question-"]'))
      : [];
    const detectedElements = new Set(list.map(question => question.element).filter(Boolean));
    const inventory = list.map(question => {
      const element = question.element;
      return {
        id: question.id,
        number: question.num,
        type: question.type,
        dom: domHint(element),
        title: clip(question.title, 1200),
        titleLength: String(question.title || '').length,
        imagePresent: !!question.image,
        passagePresent: !!question.passage,
        controls: element?.querySelectorAll ? Array.from(element.querySelectorAll('input, select, textarea')).map(control) : [],
        options: Array.isArray(question.options)
          ? question.options.map(option => ({ key: option.key, text: clip(option.text, 350), input: control(option.input) }))
          : undefined,
        selects: Array.isArray(question.selects)
          ? question.selects.map(select => ({
            id: select.id,
            label: clip(select.label, 300),
            control: control(select.element),
            options: (select.options || []).map(option => ({ value: option.value, text: clip(option.text, 250) }))
          }))
          : undefined,
        inputs: Array.isArray(question.inputs) ? question.inputs.map(control) : question.input ? [control(question.input)] : undefined
      };
    });
    const unmatchedCandidateCards = rawCards.filter(card => !detectedElements.has(card)).map(card => ({
      dom: domHint(card),
      text: clip(card.querySelector?.('.qtext, .formulation, .content')?.innerText || card.innerText, 500),
      controls: Array.from(card.querySelectorAll?.('input, select, textarea') || []).map(control)
    }));
    const summary = {
      trigger,
      url: typeof location !== 'undefined' ? location.href : null,
      scanRoot: domHint(scanRoot),
      rawCandidateCards: rawCards.length,
      detectedQuestions: inventory.length,
      unmatchedCandidateCards: unmatchedCandidateCards.length,
      typeCounts: inventory.reduce((counts, question) => {
        counts[question.type] = (counts[question.type] || 0) + 1;
        return counts;
      }, {}),
      rawControls: scanRoot?.querySelectorAll ? {
        radio: scanRoot.querySelectorAll('input[type="radio"]').length,
        checkbox: scanRoot.querySelectorAll('input[type="checkbox"]').length,
        text: scanRoot.querySelectorAll('input[type="text"], input:not([type])').length,
        number: scanRoot.querySelectorAll('input[type="number"]').length,
        select: scanRoot.querySelectorAll('select').length,
        textarea: scanRoot.querySelectorAll('textarea').length
      } : {}
    };
    const payload = { summary, questions: inventory, unmatchedCandidateCards };
    globalThis.__qaLastScanDiagnostics = payload;

    const nativeConsole = globalThis.__qaNativeConsole;
    nativeConsole?.groupCollapsed?.(`[Question Detect] ${trigger}: ${summary.detectedQuestions} question(s) detected`);
    (globalThis.QA_DEBUG_LOG || (() => {}))('scan summary', summary);
    nativeConsole?.table?.(inventory.map(question => ({
      number: question.number,
      id: question.id,
      type: question.type,
      controlCount: question.controls.length,
      title: question.title
    })));
    (globalThis.QA_DEBUG_LOG || (() => {}))('full question inventory', inventory);
    if (unmatchedCandidateCards.length) (globalThis.QA_DEBUG_LOG || (() => {}))('candidate cards not returned by active scanner', unmatchedCandidateCards);
    (globalThis.QA_DEBUG_LOG || (() => {}))('Copyable object: window.__qaLastScanDiagnostics');
    nativeConsole?.groupEnd?.();
    return payload;
  }

  static scanButtonChoiceGroups(scanRoot, passageMap = {}) {
    if (!scanRoot?.querySelectorAll) return [];
    const buttons = Array.from(scanRoot.querySelectorAll('button')).filter(button => {
      if (button.disabled || !TextUtils.isVisible(button)) return false;
      const handler = button.getAttribute('onclick') || '';
      return /(?:select|choose|answer|option|quiz)[A-Za-z]*(?:Answer|Option|Choice)?\s*\(/i.test(handler) ||
        button.matches('[role="radio"], [role="checkbox"], [data-option], [data-answer], [data-choice]');
    });
    if (buttons.length < 2) return [];

    const grouped = new Map();
    buttons.forEach(button => {
      const handler = button.getAttribute('onclick') || '';
      const match = handler.match(/\((\d+)\s*,\s*[^)]/);
      const container = match ? `handler:${match[1]}` : `parent:${ExamDomScanner.buttonChoiceContainer(button)}`;
      if (!grouped.has(container)) grouped.set(container, []);
      grouped.get(container).push(button);
    });

    const questions = [];
    let fallbackNum = 1;
    grouped.forEach(group => {
      if (group.length < 2) return;
      const optionRoot = ExamDomScanner.lowestCommonAncestor(group);
      const card = ExamDomScanner.findButtonQuestionCard(optionRoot);
      if (!card) return;
      const questionText = ExamDomScanner.extractButtonQuestionText(card, optionRoot);
      if (!questionText || questionText.length < 3) return;
      const numberMatch = questionText.match(/(?:question|câu|câu hỏi|q)\s*(\d+)\b/i) || card.innerText?.match(/(?:question|câu|câu hỏi|q)\s*(\d+)\s*\//i);
      const qNum = numberMatch ? Number(numberMatch[1]) : fallbackNum++;
      const qId = `qa-detected-button-${qNum}`;
      const options = group.map((button, index) => {
        const raw = TextUtils.cleanText(button.innerText || button.textContent || '');
        const keyMatch = raw.match(/^\s*([A-Z])(?:\s|\.|\))/i) || button.getAttribute('data-option')?.match(/^([A-Z])/i);
        const key = keyMatch ? keyMatch[1].toUpperCase() : String.fromCharCode(65 + index);
        const text = TextUtils.cleanOptionText(raw, key);
        button.setAttribute('data-qa-for', qId);
        button.setAttribute('data-qa-opt', key);
        return { key, text, input: null, label: button, element: button };
      }).filter(option => option.text);
      if (options.length < 2) return;
      card.setAttribute('data-qa-id', qId);
      questions.push({
        id: qId, num: qNum, type: 'single_choice', title: questionText,
        options, passage: passageMap[qNum] || null,
        image: DomMediaExtractor.extractImageFromNode(card), element: card
      });
    });
    return questions;
  }

  static buttonChoiceContainer(button) {
    return button.parentElement || button;
  }

  static lowestCommonAncestor(elements) {
    if (!elements?.length) return null;
    let ancestors = [];
    for (let node = elements[0]; node; node = node.parentElement) ancestors.push(node);
    for (const element of elements.slice(1)) {
      const own = new Set();
      for (let node = element; node; node = node.parentElement) own.add(node);
      ancestors = ancestors.filter(node => own.has(node));
    }
    return ancestors[0] || null;
  }

  static findButtonQuestionCard(optionRoot) {
    let card = optionRoot;
    while (card && card !== document.body) {
      const text = TextUtils.cleanText(card.innerText || '');
      if (/(?:question|câu|câu hỏi)\s*\d+\s*(?:\/|\b)/i.test(text) && card.querySelectorAll('button').length >= 2) return card;
      card = card.parentElement;
    }
    return optionRoot?.parentElement || optionRoot;
  }

  static extractButtonQuestionText(card, optionRoot) {
    const candidates = Array.from(card.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6'))
      .filter(element => !optionRoot?.contains(element))
      .map(element => TextUtils.cleanText(element.innerText || element.textContent || ''))
      .filter(text => text.length >= 12 && text.length <= 2_000 && /[?？]$/.test(text));
    if (candidates.length) return candidates.sort((a, b) => a.length - b.length)[0];
    const clone = card.cloneNode(true);
    clone.querySelectorAll('button, input, select, textarea').forEach(element => element.remove());
    return TextUtils.extractRichText(clone);
  }

  static scanFormValueControls(scanRoot, passageMap = {}) {
    if (!scanRoot) return [];
    const controls = Array.from(scanRoot.querySelectorAll('select, textarea, input[type="text"], input:not([type])'))
      .filter(control => {
        if (control.disabled || control.readOnly || !TextUtils.isVisible(control)) return false;
        return !control.closest('header, nav, footer, .search, [role="search"]');
      });
    if (controls.length === 0) return [];

    const groups = new Map();
    controls.forEach(control => {
      const card = control.closest('.que, .question, [class*="question"], [data-question-id], fieldset, .form-group, tr, li, form > div') || control.parentElement;
      if (!card) return;
      if (!groups.has(card)) groups.set(card, []);
      groups.get(card).push(control);
    });

    const questions = [];
    let fallbackNum = 1;
    groups.forEach((groupControls, card) => {
      const clone = card.cloneNode(true);
      clone.querySelectorAll('input, textarea, select, button, label[for]').forEach(el => el.remove());
      const title = TextUtils.extractRichText(clone);
      if (!title || title.length < 3) return;

      const numberMatch = title.match(TextUtils.QUESTION_HEADER_REGEX) || card.id?.match(/(?:q|question)[^0-9]*(\d+)/i);
      const qNum = numberMatch ? Number(numberMatch[1]) : fallbackNum++;
      const qId = `qa-detected-value-${qNum}`;
      card.setAttribute('data-qa-id', qId);

      const selects = groupControls.filter(control => control.tagName === 'SELECT');
      if (selects.length > 0) {
        questions.push({
          id: qId,
          num: qNum,
          type: 'dropdown_select',
          title,
          selects: selects.map((select, index) => ({
            id: select.name || select.id || `select_${index + 1}`,
            label: TextUtils.cleanText(select.labels?.[0]?.innerText || select.closest('label, tr, p, div')?.innerText || `Item ${index + 1}`),
            element: select,
            options: Array.from(select.options).map(option => ({
              value: option.value,
              text: (option.dataset.qaAiOriginalText || option.text || '').trim()
            })).filter(option => option.text)
          })),
          passage: passageMap[qNum] || null,
          image: DomMediaExtractor.extractImageFromNode(card),
          element: card
        });
        return;
      }

      questions.push({
        id: qId,
        num: qNum,
        type: 'short_answer',
        title,
        input: groupControls[0],
        inputs: groupControls,
        passage: passageMap[qNum] || null,
        image: DomMediaExtractor.extractImageFromNode(card),
        element: card
      });
    });
    return questions;
  }

  static scanDirectInputGroups(scanRoot, passageMap = {}) {
    if (!scanRoot) return [];
    const allRadios = Array.from(scanRoot.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(inp => inp.value !== '-1' && !inp.closest('.clear-choice, .clearchoice, .clear'));

    if (allRadios.length < 2) return [];

    // Gom nhóm theo name attribute
    const nameMap = new Map();
    allRadios.forEach(inp => {
      const name = inp.name || '__anon__';
      if (!nameMap.has(name)) nameMap.set(name, []);
      nameMap.get(name).push(inp);
    });

    const groups = [];
    nameMap.forEach(list => {
      if (list.length >= 2) groups.push(list);
    });

    if (groups.length === 0) {
      let temp = [];
      for (let i = 0; i < allRadios.length; i++) {
        temp.push(allRadios[i]);
        if (temp.length === 4 || i === allRadios.length - 1) {
          if (temp.length >= 2) groups.push(temp);
          temp = [];
        }
      }
    }

    const questions = [];
    groups.forEach((group, idx) => {
      const qNum = idx + 1;
      const qId = `qa-detected-direct-${qNum}`;
      const lca = AnchorBasedScanner.getLowestCommonAncestor(group);
      if (!lca) return;

      const card = lca.closest('.que, .formulation, .card, [class*="question"], [id^="q"], form > div') || lca.parentElement || lca;
      card.setAttribute('data-qa-id', qId);

      const clone = card.cloneNode(true);
      clone.querySelectorAll('input, label, .answer, button, .info').forEach(el => el.remove());
      let questionText = TextUtils.extractRichText(clone);
      if (!questionText) {
        questionText = `Câu hỏi ${qNum}`;
      }

      const options = [];
      group.forEach((inp, optIdx) => {
        let key = String.fromCharCode(65 + optIdx);
        const row = inp.closest('label, .r0, .r1, .form-check, .custom-control, .d-flex, li, tr, div') || inp.parentElement;
        const label = (inp.id ? card.querySelector(`label[for="${inp.id}"]`) : null) || inp.closest('label') || row;

        const numSpan = label?.querySelector('.answernumber, .option-letter, .choice-label');
        if (numSpan) {
          const spanTxt = (numSpan.innerText || numSpan.textContent || '').trim();
          const sm = spanTxt.match(/([A-Za-zĐđ0-9])/);
          if (sm) key = sm[1].toUpperCase();
        } else {
          const rawOptText = TextUtils.cleanText(label?.innerText || row?.innerText || '');
          const m = rawOptText.match(TextUtils.OPTION_PREFIX_REGEX);
          if (m) key = m[1].toUpperCase();
        }

        const rawOptText = TextUtils.cleanText(label?.innerText || row?.innerText || '');
        const optText = TextUtils.cleanOptionText(rawOptText, key);

        inp.setAttribute('data-qa-for', qId);
        inp.setAttribute('data-qa-opt', key);
        if (row) {
          row.setAttribute('data-qa-for', qId);
          row.setAttribute('data-qa-opt', key);
        }
        if (label && label !== row) {
          label.setAttribute('data-qa-for', qId);
          label.setAttribute('data-qa-opt', key);
        }

        options.push({
          key: key,
          text: optText,
          input: inp,
          label: label,
          element: row
        });
      });

      const isMultiple = group.some(inp => inp.type === 'checkbox') ||
        /select one or more|chọn một hoặc nhiều|chọn các|chọn những|choose all that apply/i.test(card.innerText || '');

      if (options.length >= 2) {
        questions.push({
          id: qId,
          num: qNum,
          type: isMultiple ? 'multiple_choice' : 'single_choice',
          title: questionText,
          options: options,
          passage: passageMap[qNum] || null,
          image: DomMediaExtractor.extractImageFromNode(card),
          element: card
        });
      }
    });

    return questions;
  }

  static filterValidQuestions(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(q => {
      if (!q || !q.title) return false;
      if (q.type === 'true_false_group') {
        return Array.isArray(q.items) && q.items.length > 0;
      }
      if (q.type === 'short_answer') {
        return !!(q.input || (Array.isArray(q.inputs) && q.inputs.length > 0));
      }
      if (q.type === 'dropdown_select') {
        return Array.isArray(q.selects) && q.selects.length > 0;
      }
      if (q.type === 'multi_input') {
        return Array.isArray(q.fields) && q.fields.length >= 2 && q.fields.every(field => field?.id && field?.element);
      }
      return Array.isArray(q.options) && q.options.length >= 2;
    });
  }

  static buildExtractionStats(questions) {
    if (!Array.isArray(questions)) return { total: 0, singleChoice: 0, trueFalse: 0 };
    let single = 0;
    let tf = 0;
    questions.forEach(q => {
      if (q.type === 'true_false_group') tf++;
      else single++;
    });
    return {
      total: questions.length,
      singleChoice: single,
      trueFalse: tf
    };
  }
}

globalThis.ExamDomScanner = ExamDomScanner;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExamDomScanner };
}
