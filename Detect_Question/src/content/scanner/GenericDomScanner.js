class GenericDomScanner {
  static scan(scanRoot, passageMap = {}) {
    if (!scanRoot) return [];
    const questions = [];
    const headerElements = Array.from(scanRoot.querySelectorAll('h1, h2, h3, h4, h5, p, b, strong, span, div')).filter(el => {
      if (el.closest('header, nav, footer, #page-header, #header, .breadcrumb, [class*="breadcrumb"], [class*="banner"]')) {
        return false;
      }
      const txt = (el.innerText || el.textContent || '').trim();
      if (txt.length > 200 || txt.length < 3) return false;
      return TextUtils.QUESTION_HEADER_REGEX.test(txt);
    });

    headerElements.forEach((header, index) => {
      const txt = (header.innerText || header.textContent || '').trim();
      const m = txt.match(TextUtils.QUESTION_HEADER_REGEX);
      const qNum = m ? parseInt(m[1], 10) : (index + 1);
      const qId = `qa-detected-generic-${qNum}`;

      // Tìm container bao bọc có chứa options
      let container = header;
      while (container && container !== document.body) {
        const inps = Array.from(container.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
          .filter(inp => inp.value !== '-1' && !inp.closest('.clear-choice, .clearchoice, .clear'));
        if (inps.length >= 2) break;
        container = container.parentElement;
      }

      if (!container || container === document.body) return;
      container.setAttribute('data-qa-id', qId);

      // Trích xuất nội dung câu hỏi (stem) từ container, loại trừ các đáp án
      let questionText = '';
      const clone = container.cloneNode(true);
      clone.querySelectorAll('input, label, .answer, [class*="option"], [class*="choice"], button').forEach(el => el.remove());
      questionText = TextUtils.extractRichText(clone);
      if (!questionText || questionText.length < 3) {
        questionText = TextUtils.extractRichText(header);
      }

      const image = DomMediaExtractor.extractImageFromNode(container);

      const options = [];
      const inputs = Array.from(container.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .filter(inp => inp.value !== '-1' && !inp.closest('.clear-choice, .clearchoice, .clear'));

      inputs.forEach((input, optIdx) => {
        let key = String.fromCharCode(65 + optIdx);
        const optCont = input.closest('label, .r0, .r1, .form-check, .custom-control, .d-flex, li, tr, p, div') || input.parentElement;
        const label = (input.id ? container.querySelector(`label[for="${input.id}"]`) : null) || input.closest('label') || optCont;

        const numSpan = label?.querySelector('.answernumber, .option-letter, .choice-label');
        if (numSpan) {
          const spanTxt = (numSpan.innerText || numSpan.textContent || '').trim();
          const sm = spanTxt.match(/([A-Za-zĐđ0-9])/);
          if (sm) key = sm[1].toUpperCase();
        } else {
          const rawOptText = TextUtils.cleanText(label?.innerText || optCont?.innerText || '');
          const match = rawOptText.match(TextUtils.OPTION_PREFIX_REGEX);
          if (match) key = match[1].toUpperCase();
        }

        const rawOptText = TextUtils.cleanText(label?.innerText || optCont?.innerText || '');
        const optText = TextUtils.cleanOptionText(rawOptText, key);

        input.setAttribute('data-qa-for', qId);
        input.setAttribute('data-qa-opt', key);
        if (optCont) {
          optCont.setAttribute('data-qa-for', qId);
          optCont.setAttribute('data-qa-opt', key);
        }
        if (label && label !== optCont) {
          label.setAttribute('data-qa-for', qId);
          label.setAttribute('data-qa-opt', key);
        }

        options.push({
          key: key,
          text: optText,
          input: input,
          label: label,
          element: optCont
        });
      });

      const isMultiple = inputs.some(inp => inp.type === 'checkbox') ||
        /select one or more|chọn một hoặc nhiều|chọn các|chọn những/i.test(container.innerText || '');

      if (options.length >= 2) {
        questions.push({
          id: qId,
          num: qNum,
          type: isMultiple ? 'multiple_choice' : 'single_choice',
          title: questionText,
          options: options,
          passage: passageMap[qNum] || null,
          image: image,
          element: container
        });
      }
    });

    return questions;
  }
}

globalThis.GenericDomScanner = GenericDomScanner;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GenericDomScanner };
}
