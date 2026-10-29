class AnchorBasedScanner {
  static scan(scanRoot, passageMap = {}) {
    if (!scanRoot) return [];
    const anchors = Array.from(scanRoot.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(inp => inp.value !== '-1' && !inp.closest('.clear-choice, .clearchoice, .clear'));
    if (anchors.length < 2) return [];

    const grouped = AnchorBasedScanner.groupAnchors(anchors);
    const questions = [];

    grouped.forEach((group, index) => {
      if (group.length < 2) return;
      const lca = AnchorBasedScanner.getLowestCommonAncestor(group);
      if (!lca) return;

      const qNum = index + 1;
      const qId = `qa-detected-anchor-${qNum}`;
      
      // Tìm container câu hỏi bao trùm (thường là card hoặc formulation hoặc cha của lca)
      const qCard = lca.closest('.que, .formulation, .card, [class*="question"], [id^="q"], form > div') || lca.parentElement || lca;
      qCard.setAttribute('data-qa-id', qId);

      // Trích xuất nội dung câu hỏi (loại bỏ phần đáp án để không bị trùng)
      let questionText = '';
      const qTextEl = qCard.querySelector('.qtext, .formulation .qtext, [class*="question-text"], [class*="stem"], p, h3, h4');
      if (qTextEl && !lca.contains(qTextEl)) {
        questionText = TextUtils.extractRichText(qTextEl);
      } else {
        const clone = qCard.cloneNode(true);
        // Xóa phần đáp án khỏi clone để lấy stem câu hỏi
        clone.querySelectorAll('input, label, .answer, .absubpart, [class*="option"], [class*="choice"], .info, button').forEach(el => el.remove());
        questionText = TextUtils.extractRichText(clone);
      }

      if (!questionText || questionText.length < 3) {
        // Thử lấy text trước LCA
        let prev = lca.previousElementSibling;
        while (prev && !questionText) {
          questionText = TextUtils.extractRichText(prev);
          prev = prev.previousElementSibling;
        }
      }

      const image = DomMediaExtractor.extractImageFromNode(qCard);

      const options = [];
      group.forEach((input, optIdx) => {
        let key = String.fromCharCode(65 + optIdx);
        const container = input.closest('label, .r0, .r1, .form-check, .custom-control, .d-flex, li, tr, p, div') || input.parentElement;
        const label = (input.id ? qCard.querySelector(`label[for="${input.id}"]`) : null) || input.closest('label') || container;

        const numSpan = label?.querySelector('.answernumber, .option-letter, .choice-label');
        if (numSpan) {
          const spanTxt = (numSpan.innerText || numSpan.textContent || '').trim();
          const sm = spanTxt.match(/([A-Za-zĐđ0-9])/);
          if (sm) key = sm[1].toUpperCase();
        } else {
          const rawOptText = TextUtils.cleanText(label?.innerText || container?.innerText || '');
          const m = rawOptText.match(TextUtils.OPTION_PREFIX_REGEX);
          if (m) key = m[1].toUpperCase();
        }

        const rawOptText = TextUtils.cleanText(label?.innerText || container?.innerText || '');
        const optText = TextUtils.cleanOptionText(rawOptText, key);

        input.setAttribute('data-qa-for', qId);
        input.setAttribute('data-qa-opt', key);
        if (container) {
          container.setAttribute('data-qa-for', qId);
          container.setAttribute('data-qa-opt', key);
        }
        if (label && label !== container) {
          label.setAttribute('data-qa-for', qId);
          label.setAttribute('data-qa-opt', key);
        }

        options.push({
          key: key,
          text: optText,
          input: input,
          label: label,
          element: container
        });
      });

      const isMultiple = group.some(inp => inp.type === 'checkbox') ||
        /select one or more|chọn một hoặc nhiều|chọn các|chọn những/i.test(qCard?.innerText || '');

      if (options.length >= 2) {
        questions.push({
          id: qId,
          num: qNum,
          type: isMultiple ? 'multiple_choice' : 'single_choice',
          title: questionText || `Câu hỏi ${qNum}`,
          options: options,
          passage: passageMap[qNum] || null,
          image: image,
          element: qCard
        });
      }
    });

    return questions;
  }

  static groupAnchors(anchors) {
    const groups = [];
    const nameMap = new Map();

    anchors.forEach(a => {
      const name = a.name;
      if (name) {
        if (!nameMap.has(name)) {
          nameMap.set(name, []);
        }
        nameMap.get(name).push(a);
      }
    });

    if (nameMap.size > 0) {
      nameMap.forEach(list => groups.push(list));
    } else {
      let current = [];
      for (let i = 0; i < anchors.length; i++) {
        current.push(anchors[i]);
        if (current.length === 4 || i === anchors.length - 1) {
          groups.push(current);
          current = [];
        }
      }
    }

    return groups;
  }

  static getLowestCommonAncestor(elements) {
    if (!elements || elements.length === 0) return null;
    if (elements.length === 1) return elements[0].parentElement;

    let ancestors = AnchorBasedScanner.getAncestors(elements[0]);
    for (let i = 1; i < elements.length; i++) {
      const currentAncestors = new Set(AnchorBasedScanner.getAncestors(elements[i]));
      ancestors = ancestors.filter(a => currentAncestors.has(a));
    }
    return ancestors[0] || document.body;
  }

  static getAncestors(el) {
    const list = [];
    let curr = el?.parentElement;
    while (curr && curr !== document.body) {
      list.push(curr);
      curr = curr.parentElement;
    }
    return list;
  }
}

globalThis.AnchorBasedScanner = AnchorBasedScanner;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnchorBasedScanner };
}
