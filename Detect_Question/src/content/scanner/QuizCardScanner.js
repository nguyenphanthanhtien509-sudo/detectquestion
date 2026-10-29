class QuizCardScanner {
  static scan(scanRoot, passageMap = {}) {
    if (!scanRoot) return [];
    const questions = [];
    const candidateCards = Array.from(scanRoot.querySelectorAll(
      '.yh-question-card, [class*="question-card"], [id^="question-"], [id^="q-card-"], .exam-question, .quiz-item, .test-question, .question-item, .question-holder, .ques-item, [data-question-id]'
    )).filter(card => !card.matches('[id$="_question-name"]'));

    candidateCards.forEach((card, index) => {
      const qNum = QuizCardScanner.extractQuestionNumber(card, index + 1);
      const qId = `qa-detected-card-${qNum}`;
      card.setAttribute('data-qa-id', qId);

      const isTrueFalse = card.querySelectorAll('.yh-tf4-row').length > 0;

      // Semantic stems take priority over an earlier paragraph containing
      // only the question number. Preserve all paragraphs in the stem.
      const stemEl = card.querySelector('[id$="_question-name"], .yh-question-stem, .question-text, .stem') ||
        card.querySelector('.title, .content, div.prose, div.whitespace-pre-line') || card;
      let questionText = TextUtils.extractRichText(stemEl);
      if (!questionText || stemEl === card) {
        const clone = card.cloneNode(true);
        clone.querySelectorAll('label, input, [class*="option"], [class*="choice"], button').forEach(el => el.remove());
        questionText = TextUtils.extractRichText(clone);
      }

      const image = DomMediaExtractor.extractImageFromNode(card);

      if (isTrueFalse) {
        const tfRows = Array.from(card.querySelectorAll('.yh-tf4-row'));
        const tfItems = [];

        tfRows.forEach((row, rIdx) => {
          let key = String.fromCharCode(65 + rIdx);
          const stem = row.querySelector('.yh-tf4-stem, td:first-child, span');
          if (stem) {
            const m = (stem.innerText || '').match(/^([A-Da-d])[.\:\)]/);
            if (m) key = m[1].toUpperCase();
          }

          const rowText = TextUtils.cleanText(stem?.innerText || '');

          const trueCont = row.querySelector('.yh-tf4-true') || Array.from(row.querySelectorAll('label, div, span')).find(el => /\bđúng\b|\btrue\b/i.test(el.innerText || ''));
          const trueInp = trueCont ? (trueCont.tagName === 'INPUT' ? trueCont : trueCont.querySelector('input')) : row.querySelectorAll('input')[0];
          if (trueInp) {
            trueInp.setAttribute('data-qa-for', qId);
            trueInp.setAttribute('data-qa-opt', `${key}_TRUE`);
          }

          const falseCont = row.querySelector('.yh-tf4-false') || Array.from(row.querySelectorAll('label, div, span')).find(el => /\bsai\b|\bfalse\b/i.test(el.innerText || ''));
          const falseInp = falseCont ? (falseCont.tagName === 'INPUT' ? falseCont : falseCont.querySelector('input')) : row.querySelectorAll('input')[1];
          if (falseInp) {
            falseInp.setAttribute('data-qa-for', qId);
            falseInp.setAttribute('data-qa-opt', `${key}_FALSE`);
          }

          tfItems.push({
            key: key,
            text: rowText,
            trueInput: trueInp,
            falseInput: falseInp
          });
        });

        if (tfItems.length > 0) {
          questions.push({
            id: qId,
            num: qNum,
            type: 'true_false_group',
            title: questionText,
            items: tfItems,
            passage: passageMap[qNum] || null,
            image: image,
            element: card
          });
        }
      } else {
        const options = [];
        // Modern React cards normally use one clickable row per choice. Scan
        // those rows first: including both the row and its nested Ant Design
        // label used to create duplicate/blank choices and made validation
        // reject an otherwise valid card.
        const clickableRows = Array.from(card.querySelectorAll('div.cursor-pointer'));
        const optionRows = clickableRows.length >= 2
          ? clickableRows
          : Array.from(card.querySelectorAll('.yh-option, .option, .choice, .form-check, .ant-radio-wrapper, .ant-checkbox-wrapper, label, [class*="option-item"]'));

        optionRows.forEach((row, optIdx) => {
          const input = row.querySelector('input[type="radio"], input[type="checkbox"]') || (row.tagName === 'INPUT' ? row : null);
          let key = String.fromCharCode(65 + optIdx);
          const rawOptText = TextUtils.extractRichText(row);

          const numSpan = row.querySelector('.answernumber, .option-letter, .choice-label, [class*="prefix"], [class*="letter"]');
          if (numSpan) {
            const spanTxt = (numSpan.innerText || numSpan.textContent || '').trim();
            const sm = spanTxt.match(/([A-Za-zĐđ0-9])/);
            if (sm) key = sm[1].toUpperCase();
          } else {
            const m = rawOptText.match(TextUtils.OPTION_PREFIX_REGEX);
            if (m) key = m[1].toUpperCase();
          }

          const optText = TextUtils.cleanOptionText(rawOptText, key);

          if (input) {
            input.setAttribute('data-qa-for', qId);
            input.setAttribute('data-qa-opt', key);
          }
          row.setAttribute('data-qa-for', qId);
          row.setAttribute('data-qa-opt', key);

          if (optText) {
            options.push({
              key: key,
              text: optText,
              input: input,
              label: row.tagName === 'LABEL' ? row : row.querySelector('label') || row,
              element: row
            });
          }
        });

        const isMultiple = Array.from(card.querySelectorAll('input[type="checkbox"]')).length > 0 ||
          /select one or more|chọn một hoặc nhiều|chọn các|chọn những|choose all that apply/i.test(card.innerText || '');

        if (questionText && options.length >= 2) {
          questions.push({
            id: qId,
            num: qNum,
            type: isMultiple ? 'multiple_choice' : 'single_choice',
            title: questionText,
            options: options,
            passage: passageMap[qNum] || null,
            image: image,
            element: card
          });
          return;
        }

        // `question-detect.vercel.app` renders matching questions with Ant
        // Design Select. The real control is a readonly text input with
        // role=combobox, not a native <select>; recognise it as a multi-field
        // answer instead of silently returning zero questions. Options are
        // virtualized when closed, so extract them from React when available;
        // otherwise retain a text field rather than inventing choices. The
        // field label retains the left-side key (for example "CX:").
        const comboInputs = Array.from(card.querySelectorAll('input[role="combobox"].ant-select-input, .ant-select input[role="combobox"]'))
          .filter((input, index, list) => list.indexOf(input) === index && !input.disabled);
        if (questionText && comboInputs.length > 0) {
          const fields = comboInputs.map((input, fieldIndex) => {
            const row = input.closest('.ant-select')?.parentElement?.parentElement || input.closest('div') || card;
            const rawLabel = TextUtils.cleanText(row?.innerText || '');
            const label = rawLabel
              .replace(/--\s*chọn đáp án tương ứng\s*--/gi, '')
              .replace(/^\s*\d+\s*/, '')
              .trim() || `Field ${fieldIndex + 1}`;
            const id = input.id || `select_${fieldIndex + 1}`;
            const options = QuizCardScanner.extractAntSelectOptions(input);
            input.setAttribute('data-qa-for', qId);
            input.setAttribute('data-qa-opt', id);
            return {
              id,
              label,
              // When React exposes the Select options, preserve the real
              // choice list and its on-screen order. This lets both the model
              // and the compact answer display use 1-based positions (e.g.
              // FE67/67FE becomes 54 for a six-item dropdown). Fall back to
              // text only on an unknown virtual Select implementation.
              kind: options.length > 0 ? 'select' : 'text',
              ...(options.length > 0 ? { options } : {}),
              element: input
            };
          });
          const singleSelect = fields.length === 1 && fields[0].kind === 'select';
          questions.push({
            id: qId,
            num: qNum,
            // One Ant Select is a dropdown question, not a short-answer: its
            // backing input is readonly and cannot accept free text. Keeping
            // the structured select schema lets the solver validate against
            // the real option list and lets the answer badge show its ordinal.
            type: singleSelect ? 'dropdown_select' : (fields.length === 1 ? 'short_answer' : 'multi_input'),
            title: questionText,
            ...(singleSelect
              ? { selects: [{ id: fields[0].id, label: fields[0].label, options: fields[0].options, element: fields[0].element }] }
              : (fields.length === 1 ? { input: fields[0].element, inputs: [fields[0].element] } : { fields })),
            passage: passageMap[qNum] || null,
            image: image,
            element: card
          });
          return;
        }

        // Normal short-answer cards often use a standard text/number input.
        // Exclude readonly Ant Select backing inputs handled above.
        const textInputs = Array.from(card.querySelectorAll('textarea, input[type="text"], input[type="number"], input:not([type])'))
          .filter(input => !input.disabled && !input.readOnly && !input.matches('.ant-select-input, [role="combobox"]'));
        if (questionText && textInputs.length > 0) {
          textInputs.forEach(input => input.setAttribute('data-qa-for', qId));
          questions.push({
            id: qId,
            num: qNum,
            type: textInputs.length === 1 ? 'short_answer' : 'multi_input',
            title: questionText,
            ...(textInputs.length === 1
              ? { input: textInputs[0], inputs: textInputs }
              : { fields: textInputs.map((input, fieldIndex) => ({ id: input.id || `text_${fieldIndex + 1}`, label: input.getAttribute('aria-label') || `Field ${fieldIndex + 1}`, kind: 'text', element: input })) }),
            passage: passageMap[qNum] || null,
            image: image,
            element: card
          });
        }
      }
    });

    return questions;
  }

  static extractAntSelectOptions(input) {
    if (!input) return [];
    const normalize = values => {
      if (!Array.isArray(values)) return [];
      const options = values.map(value => {
        if (value == null) return null;
        if (typeof value === 'string' || typeof value === 'number') {
          const text = String(value).trim();
          return text ? { value: text, text } : null;
        }
        if (typeof value === 'object') {
          const rawValue = value.value ?? value.key ?? value.label;
          const rawText = value.text ?? value.label ?? value.children ?? rawValue;
          const optionValue = String(rawValue ?? '').trim();
          const text = String(rawText ?? '').replace(/\s+/g, ' ').trim();
          return optionValue && text ? { value: optionValue, text } : null;
        }
        return null;
      }).filter(Boolean);
      const unique = [];
      const seen = new Set();
      options.forEach(option => {
        if (!seen.has(option.value)) {
          seen.add(option.value);
          unique.push(option);
        }
      });
      return unique;
    };

    // If the user has the dropdown open, its mounted options are the most
    // direct and framework-independent source.
    const listId = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
    const mountedList = listId && typeof document !== 'undefined' ? document.getElementById(listId) : null;
    const mounted = normalize(Array.from(mountedList?.querySelectorAll?.('[role="option"]') || []).map(option => ({
      value: option.getAttribute('aria-label') || option.textContent,
      text: option.textContent
    })));
    if (mounted.length > 0) return mounted;

    // Ant Design virtualises closed dropdown menus. Its public DOM therefore
    // contains no <option> nodes, but the current React fiber keeps the exact
    // `options` prop. Inspect only the closest Select fiber and its short
    // component chain; this avoids walking unrelated page/application state.
    const select = input.closest?.('.ant-select') || input;
    // Depending on the Ant Design/React version the host fiber is attached
    // either to the Select wrapper or its hidden input. Start from both.
    const reactHosts = [select, input].filter((node, index, list) => node && list.indexOf(node) === index);
    const queue = [];
    for (const host of reactHosts) {
      for (const key of Object.keys(host)) {
        if (key.startsWith('__reactFiber$') && host[key]) queue.push(host[key]);
        // Some React builds retain the public props directly on the DOM node.
        if (key.startsWith('__reactProps$')) {
          const found = normalize(host[key]?.options);
          if (found.length > 0) return found;
        }
      }
    }
    const visited = new Set();
    while (queue.length > 0 && visited.size < 96) {
      const fiber = queue.shift();
      if (!fiber || visited.has(fiber)) continue;
      visited.add(fiber);
      for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
        const found = normalize(props?.options);
        if (found.length > 0) return found;
      }
      // `return` leads from the rendered Ant DOM node to the React <Select>
      // component whose props carry the data; children/siblings cover version
      // differences in Ant Design's internal structure.
      if (fiber.return) queue.push(fiber.return);
      if (fiber.child) queue.push(fiber.child);
      if (fiber.sibling) queue.push(fiber.sibling);
    }
    return [];
  }

  static extractQuestionNumber(card, fallback) {
    if (!card) return fallback;
    const numEl = card.querySelector('.yh-question-stem__label, [class*="question-num"], [class*="q-num"], .question-number, h3, h4, h5, span');
    if (numEl) {
      const txt = (numEl.innerText || numEl.textContent || '').trim();
      const m = txt.match(/(?:question|câu|câu\s*hỏi|quest|q|bài)\s*(\d+)\b/i);
      if (m) return parseInt(m[1], 10);
    }
    return fallback;
  }
}

globalThis.QuizCardScanner = QuizCardScanner;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuizCardScanner };
}
