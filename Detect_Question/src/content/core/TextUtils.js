class TextUtils {
  static QUESTION_HEADER_REGEX = /(?:^|\s)(?:câu|question|quest|q|bài|item|câu\s*hỏi)\s*(\d+)\b(?![\/:]\d)/i;
  static OPTION_PREFIX_REGEX = /^\s*([A-Za-zĐđ①-⑩❶-❿Ⓐ-Ⓗ0-9])[\.\)\/:\–—\-]\s*(.*)$/;

  static SYSTEM_SPAM_WORDS = [
    'clear my choice', 'xóa lựa chọn', 'chưa trả lời', 'not yet answered',
    'đạt điểm', 'marked out of', 'đặt cờ', 'flag question', 'đoạn văn câu hỏi',
    'question text', 'bảng câu hỏi', 'quiz navigation', 'trang tiếp', 'next page',
    'quay lại', 'làm xong', 'finish attempt', 'nộp bài', 'kết quả bài làm',
    'tổng hợp bài tập', 'bạn đang đăng nhập', 'logged in as', 'copyright',
    'mở chỉ số ngăn', 'khóa học', 'course', 'danh sách câu hỏi', 'danh sách câu',
    'phân nhóm'
  ];

  static isVisible(elem) {
    if (!elem) return false;
    if (elem.nodeType === 3) return elem.textContent.trim().length > 0;
    if (elem.nodeType !== 1) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(elem) : null;
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    const isInput = elem.tagName === 'INPUT' || elem.tagName === 'SELECT' || elem.tagName === 'TEXTAREA';
    if (!isInput && style.opacity === '0') {
      return false;
    }
    const rect = elem.getBoundingClientRect();
    if (!isInput && rect.width === 0 && rect.height === 0 && elem.offsetHeight === 0 && elem.offsetWidth === 0) {
      return false;
    }
    return true;
  }

  static cleanText(str) {
    if (!str) return '';
    return str
      .replace(/\u00a0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  static normalizeForMatch(str) {
    return (str || '')
      .toLowerCase()
      .replace(/\u00a0/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static hashQuestion(question, cacheContext = '') {
    const parts = [
      `cache:${typeof CACHE_KEY_VERSION !== 'undefined' ? CACHE_KEY_VERSION : '2'}`,
      `context:${cacheContext || ''}`,
      `type:${question?.type || 'single_choice'}`,
      question?.title || '',
      question?.passage || ''
    ];
    if (Array.isArray(question?.options)) {
      parts.push(...question.options.map(o => `${o.key}:${o.text}`));
    }
    if (Array.isArray(question?.items)) {
      parts.push(...question.items.map(o => `${o.key}:${o.text}`));
    }
    if (Array.isArray(question?.selects)) {
      question.selects.forEach(select => {
        parts.push(`select:${select.id || ''}:${select.label || ''}`);
        parts.push(...(select.options || []).map(option => `${option.value || ''}:${option.text || ''}`));
      });
    }
    if (Array.isArray(question?.fields)) {
      question.fields.forEach(field => {
        parts.push(`field:${field.id || ''}:${field.kind || ''}:${field.label || ''}`);
        parts.push(...(field.options || []).map(option => `${option.value || ''}:${option.text || ''}`));
      });
    }
    if (question?.image || question?.imageUrl) {
      parts.push(`image:${question.image || question.imageUrl}`);
    }
    // Cache keys deliberately preserve punctuation, case, and meaningful internal
    // whitespace. This is not answer matching: collapsing those characters can
    // make two code/math questions share an incorrect cached result.
    const input = parts.join('\n')
      .normalize('NFC')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .trim();
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  static isSpamText(text) {
    const lower = (text || '').toLowerCase().trim();
    if (!lower || lower.length < 2) return true;
    return TextUtils.SYSTEM_SPAM_WORDS.some(spam => lower.includes(spam));
  }

  static stripOptionPrefix(text, expectedKey) {
    if (!text) return '';
    let cleaned = text.trim();

    const inlinePattern = /^\s*([A-Za-zĐđ①-⑩❶-❿Ⓐ-Ⓗ0-9])[\.\)\/:\–—\-]\s*(.*)$/;
    const m = cleaned.match(inlinePattern);
    if (m) {
      if (!expectedKey || m[1].toUpperCase() === expectedKey.toUpperCase()) {
        return m[2].trim();
      }
    }

    if (expectedKey) {
      const startKeyRegex = new RegExp(`^\\s*${expectedKey}[\\.\\)\\/\\:\\–\\—\\-\\s]+(.*)$`, 'i');
      const startMatch = cleaned.match(startKeyRegex);
      if (startMatch) {
        return startMatch[1].trim();
      }
    }

    return cleaned;
  }

  static cleanOptionText(text, expectedKey) {
    return TextUtils.cleanText(TextUtils.stripOptionPrefix(text, expectedKey));
  }

  static extractRichText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    // MathJax 2 renders both visual and accessibility copies. Prefer its
    // original TeX before removing scripts, so negation/operators occur once.
    clone.querySelectorAll('.math-tex').forEach(math => {
      const tex = math.querySelector('script[type^="math/tex"]')?.textContent?.trim();
      if (!tex) return;
      const span = document.createElement('span');
      span.textContent = ` $${tex}$ `;
      math.replaceWith(span);
    });
    clone.querySelectorAll('.MJX_Assistive_MathML').forEach(el => el.remove());
    clone.querySelectorAll('script, style, noscript, .accesshide, .sr-only').forEach(el => el.remove());

    const mathBlocks = clone.querySelectorAll('.math, .katex, .MathJax, [data-mathml], math');
    mathBlocks.forEach(m => {
      const latex = m.getAttribute('data-latex') || m.getAttribute('alt') || m.getAttribute('title') || m.innerText || m.textContent;
      if (latex) {
        const span = document.createElement('span');
        span.textContent = ` $${latex.trim()}$ `;
        m.parentNode?.replaceChild(span, m);
      }
    });

    const tables = clone.querySelectorAll('table');
    tables.forEach(t => {
      const md = TextUtils.convertTableToMarkdown(t);
      if (md) {
        const textNode = document.createTextNode(`\n\n${md}\n\n`);
        t.parentNode?.replaceChild(textNode, t);
      }
    });

    return (clone.innerText || clone.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static getTableCellText(cell) {
    if (!cell) return '';
    return cell.innerText ? cell.innerText.replace(/[\r\n\t]+/g, ' ').trim() : cell.textContent.replace(/[\r\n\t]+/g, ' ').trim();
  }

  static convertTableToMarkdown(tbl) {
    if (!tbl) return '';
    try {
      const rows = Array.from(tbl.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      const tableData = [];
      let maxCols = 0;

      rows.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('th, td'));
        if (cells.length > 0) {
          const rowData = cells.map(c => TextUtils.getTableCellText(c).replace(/\|/g, '\\|'));
          tableData.push(rowData);
          if (rowData.length > maxCols) maxCols = rowData.length;
        }
      });

      if (tableData.length === 0 || maxCols === 0) return '';

      const normalized = tableData.map(row => {
        while (row.length < maxCols) row.push('');
        return row;
      });

      let md = '';
      const headerRow = normalized[0];
      md += '| ' + headerRow.join(' | ') + ' |\n';
      md += '| ' + new Array(maxCols).fill('---').join(' | ') + ' |\n';

      for (let i = 1; i < normalized.length; i++) {
        md += '| ' + normalized[i].join(' | ') + ' |\n';
      }

      return md.trim();
    } catch (e) {
      return '';
    }
  }

  static cleanQuestionTitle(rawTitle, passageText, qNum) {
    if (!rawTitle) return ('Câu hỏi ' + (qNum || '')).trim();
    let t = String(rawTitle).trim();

    if (t.includes('[NỘI DUNG CÂU HỎI]:')) {
      const parts = t.split('[NỘI DUNG CÂU HỎI]:');
      t = parts[parts.length - 1].trim();
    }

    t = t.replace(/^\[(?:ĐỌC HIỂU|TƯ LIỆU|READING PASSAGE)[^\]]*\]\s*:\s*/i, '').trim();

    if (passageText && typeof passageText === 'string') {
      const pTrim = passageText.trim();
      if (pTrim.length > 15) {
        if (t.startsWith(pTrim)) {
          t = t.slice(pTrim.length).trim();
        } else {
          const firstSentence = pTrim.slice(0, 40);
          const fIdx = t.indexOf(firstSentence);
          if (fIdx !== -1 && fIdx < 100) {
            const cutIdx = t.indexOf('\n', fIdx + 20);
            if (cutIdx !== -1) {
              t = t.slice(cutIdx).trim();
            }
          }
        }
      }
    }

    const groupMatch = t.match(/^((?:question|câu)\s*\d+\s*[\-\–]\s*\d+[\.\:\s\-]+[^\n]*)\n+([\s\S]*)$/i);
    if (groupMatch) {
      t = groupMatch[2].trim();
    }

    t = t.replace(/^(?:question|câu|câu\s*hỏi|bài|item|q)\s*\d+[\.\:\s\-]+/i, '').trim();

    if (!t) {
      t = rawTitle.includes('(') ? rawTitle : ('Dựa vào bài đọc hiểu/đoạn văn trên để trả lời câu hỏi ' + (qNum || '')).trim();
    }

    return t;
  }
}

globalThis.TextUtils = TextUtils;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TextUtils };
}
