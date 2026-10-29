class MoodleScanner {
  static scan(scanRoot, passageMap = {}) {
    if (!scanRoot) return [];
    const questions = [];

    // Tìm tất cả các thẻ câu hỏi Moodle
    const rootMatches = (typeof scanRoot.matches === 'function' && scanRoot.matches('.que, [id^="question-"]')) ? [scanRoot] : [];
    const childCards = Array.from(scanRoot.querySelectorAll('.que, #responseform [id^="question-"]'));
    const candidateCards = Array.from(new Set([...rootMatches, ...childCards])).filter(card => {
      if (!card || card.nodeType !== 1) return false;
      if (typeof TextUtils !== 'undefined' && !TextUtils.isVisible(card)) return false;
      return !!card.querySelector('.formulation, .qtext, .answer, .ablock, .absubpart');
    });

    candidateCards.forEach((card, index) => {
      const qNum = MoodleScanner.extractQuestionNumber(card, index + 1);
      const qId = `qa-detected-moodle-${qNum}`;
      card.setAttribute('data-qa-id', qId);

      // 1. Trích xuất nội dung câu hỏi (Stem/Title)
      let qTextEl = card.querySelector('.qtext, .formulation .qtext, .formulation .text, [class*="qtext"], .questiontext');
      let questionText = '';

      if (qTextEl) {
        questionText = TextUtils.extractRichText(qTextEl);
      } else {
        const formulation = card.querySelector('.formulation, .content') || card;
        const clone = formulation.cloneNode(true);
        clone.querySelectorAll('.answer, .absubpart, .prompt, .im-controls, .feedback, .validationerror, .info').forEach(el => el.remove());
        questionText = TextUtils.extractRichText(clone);
      }

      const image = DomMediaExtractor.extractImageFromNode(qTextEl || card.querySelector('.formulation') || card);
      const formulation = card.querySelector('.formulation, .content') || card;

      // 2. Kiểm tra câu hỏi dạng Dropdown / Sổ xuống (<select>)
      const selectEls = Array.from(formulation.querySelectorAll('select')).filter(select => !select.disabled);
      if (selectEls.length > 0) {
        const mixedTextInputs = MoodleScanner.textEntryControls(formulation);
        const selects = selectEls.map((sel, sIdx) => {
          let labelText = '';
          const row = sel.closest('tr, p, div, li') || sel.parentElement;
          if (row) {
            const clone = row.cloneNode(true);
            clone.querySelectorAll('select').forEach(s => s.remove());
            labelText = TextUtils.cleanText(clone.innerText || clone.textContent || '');
          }
          if (!labelText) labelText = `Item ${sIdx + 1}`;
          labelText = labelText.replace(/[:=]+$/, '').trim();

          const opts = Array.from(sel.options)
            .filter(o => !o.disabled && String(o.value ?? '') !== '')
            .map(o => ({
              value: o.value,
              text: (o.dataset.qaAiOriginalText || o.text || o.innerText || '').trim()
            }))
            .filter(o => o.text && o.text !== 'Choose...' && o.text !== 'Chọn...');

          return {
            id: sel.name || sel.id || `select_${sIdx + 1}`,
            label: labelText,
            element: sel,
            options: opts
          };
        });

        // Moodle numerical/fill-in questions can pair a free-text value with
        // one or more selects (for example: `Answer: [  ] [ms]`).  Treating
        // the card as dropdown-only loses the numeric field entirely.
        if (mixedTextInputs.length > 0) {
          const textFields = mixedTextInputs.map((input, inputIndex) => {
            const label = MoodleScanner.controlLabel(input, card);
            const row = input.closest('tr, p, div, li') || input.parentElement;
            const rowText = TextUtils.cleanText(label?.innerText || label?.textContent || row?.innerText || row?.textContent || '');
            return {
              id: input.name || input.id || `text_${inputIndex + 1}`,
              label: rowText || `Answer ${inputIndex + 1}`,
              kind: 'text',
              element: input
            };
          });
          questions.push({
            id: qId,
            num: qNum,
            type: 'multi_input',
            title: questionText,
            fields: [
              ...textFields,
              ...selects.map(select => ({ id: select.id, label: select.label, kind: 'select', element: select.element, options: select.options }))
            ],
            inputs: mixedTextInputs,
            selects,
            passage: passageMap[qNum] || null,
            image,
            element: card
          });
          return;
        }

        if (selects.length > 0) {
          questions.push({
            id: qId,
            num: qNum,
            type: 'dropdown_select',
            title: questionText,
            selects: selects,
            passage: passageMap[qNum] || null,
            image: image,
            element: card
          });
          return;
        }
      }

      // 3. Kiểm tra câu hỏi dạng Short Answer / Điền text (input[type="text"])
      const allRadioCheckboxes = Array.from(formulation.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .filter(inp => {
          if (inp.value === '-1') return false;
          if (inp.closest('.clear-choice, .clearchoice, .clear, .clear-choice-option')) return false;
          const id = (inp.id || '').toLowerCase();
          const name = (inp.name || '').toLowerCase();
          return !id.includes('clearchoice') && !name.includes('clearchoice');
        });

      if (allRadioCheckboxes.length === 0) {
        const textInputs = MoodleScanner.textEntryControls(formulation);
        if (textInputs.length > 0) {
          questions.push({
            id: qId,
            num: qNum,
            type: 'short_answer',
            title: questionText,
            input: textInputs[0],
            inputs: textInputs,
            passage: passageMap[qNum] || null,
            image: image,
            element: card
          });
          return;
        }
      }

      // 4. Trắc nghiệm Radio / Checkbox
      const options = [];
      if (allRadioCheckboxes.length >= 2) {
        allRadioCheckboxes.forEach((input, optIdx) => {
          let key = String.fromCharCode(65 + optIdx);
          const row = input.closest('.r0, .r1, .form-check, .custom-control, .d-flex, tr, li, div') || input.parentElement;
          const label = MoodleScanner.controlLabel(input, card) || row;

          const numSpan = label?.querySelector('.answernumber, .option-letter, .choice-label');
          if (numSpan) {
            const spanTxt = (numSpan.innerText || numSpan.textContent || '').trim();
            const sm = spanTxt.match(/([A-Za-zĐđ0-9])/);
            if (sm) key = sm[1].toUpperCase();
          } else {
            const rawOptText = TextUtils.cleanText(label?.innerText || label?.textContent || row?.innerText || '');
            const m = rawOptText.match(TextUtils.OPTION_PREFIX_REGEX);
            if (m) key = m[1].toUpperCase();
          }

          const rawOptText = TextUtils.cleanText(label?.innerText || label?.textContent || row?.innerText || '');
          const optText = TextUtils.cleanOptionText(rawOptText, key);

          input.setAttribute('data-qa-for', qId);
          input.setAttribute('data-qa-opt', key);
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
            input: input,
            label: label,
            element: row
          });
        });
      }

      const isMultiple = allRadioCheckboxes.some(inp => inp.type === 'checkbox') ||
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
      }
    });

    return questions;
  }

  static extractQuestionNumber(card, fallback) {
    if (!card) return fallback;
    const numEl = card.querySelector('.qno, .no, .info .no, .info .header, h3.no, .info h3, [class*="question-number"]');
    if (numEl) {
      const txt = (numEl.innerText || numEl.textContent || '').trim();
      const m = txt.match(/\b(\d+)\b/);
      if (m) return parseInt(m[1], 10);
    }
    if (card.id) {
      const m = card.id.match(/[:-_\s](\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
    return fallback;
  }

  // Moodle themes may associate an option with a div/span through
  // aria-labelledby instead of a literal label[for]. Resolve the semantic
  // association first, then fall back to the native/visual relation.
  static controlLabel(input, card) {
    if (!input || !card) return null;
    const ids = String(input.getAttribute?.('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const labelled = Array.from(card.querySelectorAll?.('[id]') || []).find(node => node.id === id);
      if (labelled) return labelled;
    }
    if (input.getAttribute?.('aria-label')) return input;
    const byFor = input.id ? card.querySelector(`label[for="${input.id}"]`) : null;
    return byFor || input.closest?.('label') || null;
  }

  static textEntryControls(root) {
    if (!root?.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], input:not([type]), textarea'))
      .filter(input => !input.disabled && !input.readOnly && !input.classList.contains('select2-input') && !/search/i.test(input.id || input.name || '') && !input.closest('.questionflag, .search, [role="search"]'));
  }
}

globalThis.MoodleScanner = MoodleScanner;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MoodleScanner };
}
