class ContinuousSolveRunner {
  constructor(solverEngineOrOptions = {}, options = {}) {
    // Accept both constructor forms used across the extension:
    // new ContinuousSolveRunner(engine, options)
    // new ContinuousSolveRunner({ solverEngine: engine, onAutoAdvance })
    const config = solverEngineOrOptions?.solverEngine
      ? solverEngineOrOptions
      : options;
    this.solverEngine = solverEngineOrOptions?.solverEngine || solverEngineOrOptions;
    this.isSolvingProcess = false;
    this.requestSequence = 0;
    this.activeRequestId = 0;
    this.onAutoAdvance = config.onAutoAdvance || this.defaultAutoAdvance.bind(this);
    // This extension only displays answers. Automatic navigation is disabled
    // unconditionally so a solve can never change the current quiz page.
    this.isAutoAdvanceEnabled = () => false;
  }

  stop() {
    this.isSolvingProcess = false;
    // Invalidate any in-flight response. The background request may still finish,
    // but it can no longer update this page.
    this.activeRequestId = ++this.requestSequence;
  }

  getQuestionFingerprint(question) {
    if (!question || typeof TextUtils === 'undefined' || typeof TextUtils.hashQuestion !== 'function') return '';
    return TextUtils.hashQuestion(question);
  }

  beginRequest(question) {
    const id = ++this.requestSequence;
    this.activeRequestId = id;
    return { id, fingerprint: this.getQuestionFingerprint(question), element: question?.element };
  }

  isRequestCurrent(request, question) {
    if (!request || !question || !this.isSolvingProcess || request.id !== this.activeRequestId) return false;
    if (!question.element?.isConnected || request.element !== question.element) return false;
    const scanner = typeof ExamDomScanner !== 'undefined' ? ExamDomScanner : null;
    if (!scanner?.scanAll) return true;
    const latest = (scanner.scanAll() || []).find(candidate => candidate.element === question.element || candidate.id === question.id);
    return !!latest && this.getQuestionFingerprint(latest) === request.fingerprint;
  }

  canApplyResult(request, question, result) {
    // The backend is the final acceptance authority. A consensus can remain
    // manual-review-only and must never be filled merely because it has an answer.
    return this.isRequestCurrent(request, question) && result?.consensus === true && result?.eligibleForAutoApply === true;
  }

  canSuggestResult(request, question, result) {
    return this.isRequestCurrent(request, question) && result?.consensus === true;
  }

  canApplyUserRequestedSingleModelResult(request, question, result) {
    if (!this.isRequestCurrent(request, question) || result?.displayOnly !== true) return false;
    if (Array.isArray(result.answers)) {
      return result.answers.length > 0 && result.answers.every(answer =>
        question?.options?.some(option => String(option?.key || '').trim().toUpperCase() === String(answer || '').trim().toUpperCase())
      );
    }
    if (question?.type === 'dropdown_select') {
      const answers = result.dropdownAnswers || result.answers;
      return !!answers && (question.selects || []).every(select => {
        const value = answers[select.id] ?? answers[select.label];
        return value != null && (select.options || []).some(option => String(option?.value ?? '') === String(value));
      });
    }
    if (question?.type === 'multi_input') {
      const answers = result.multiInputAnswers || result.answers;
      return !!answers && (question.fields || []).every(field => {
        const value = answers[field.id];
        return value != null && (field.kind !== 'select' || (field.options || []).some(option => String(option?.value ?? '') === String(value)));
      });
    }
    if (question?.type === 'short_answer') return String(result.answerText || result.answer || '').trim().length > 0;
    return !!question?.options?.some(option => String(option?.key || '').trim().toUpperCase() === String(result?.answer || '').trim().toUpperCase());
  }

  getDisplayAnswer(result, question = null) {
    if (!result || typeof result !== 'object') return '';
    const arrayAnswers = Array.isArray(result.answers) ? result.answers : (Array.isArray(result.answer) ? result.answer : null);
    if (arrayAnswers) {
      if (question?.type === 'multiple_choice' && Array.isArray(question.options)) {
        return arrayAnswers.map(answer => {
          const position = question.options.findIndex(option => String(option?.key || '').trim().toUpperCase() === String(answer || '').trim().toUpperCase());
          return position >= 0 ? String(position + 1) : String(answer || '').trim();
        }).filter(Boolean).join('');
      }
      return arrayAnswers.map(value => String(value).trim()).filter(Boolean).join(', ');
    }

    const multiAnswers = result.multiInputAnswers || (question?.type === 'multi_input' ? (result.answers || (typeof result.answer === 'object' && result.answer !== null ? result.answer : null)) : null);
    if (multiAnswers && question?.type === 'multi_input') {
      const mapped = (question.fields || []).map((field, idx) => {
        let value = String(multiAnswers[field.id] ?? multiAnswers[field.label] ?? '').trim();
        if (!value) {
          const matchedKey = Object.keys(multiAnswers).find(k => {
            const lk = k.trim().toLowerCase();
            const fl = (field.label || '').trim().toLowerCase();
            const fi = (field.id || '').trim().toLowerCase();
            return lk === fl || lk === fi || (fl && (fl.includes(lk) || lk.includes(fl)));
          });
          if (matchedKey) value = String(multiAnswers[matchedKey] ?? '').trim();
        }
        if (!value && (multiAnswers[idx] !== undefined || multiAnswers[String(idx + 1)] !== undefined)) {
          value = String(multiAnswers[idx] ?? multiAnswers[String(idx + 1)] ?? '').trim();
        }
        if (!value) return { value: '', position: null };
        if (field.kind === 'select' && Array.isArray(field.options)) {
          const choices = field.options.filter(option => {
            const text = String(option?.text || '').trim();
            const optVal = String(option?.value ?? '').trim();
            return !!optVal && !/^(?:choose|select|chọn)(?:\s|\.|…|$)/i.test(text);
          });
          const position = choices.findIndex(option => String(option?.value ?? '') === value || String(option?.text ?? '').trim() === value);
          return { value, position: position >= 0 ? String(position + 1) : null };
        }
        return { value, position: null };
      }).filter(item => item.value);

      return mapped.length > 0 && mapped.every(item => item.position != null)
        ? mapped.map(item => item.position).join('')
        : mapped.map(item => item.value).join(', ');
    }

    const dropdownAnswers = result.dropdownAnswers || (question?.type === 'dropdown_select' ? (result.answers || (typeof result.answer === 'object' && result.answer !== null ? result.answer : null)) : null);
    if (dropdownAnswers && typeof dropdownAnswers === 'object' && question?.type === 'dropdown_select' && Array.isArray(question.selects)) {
      return question.selects.map((select, idx) => {
        let value = dropdownAnswers[select.id] ?? dropdownAnswers[select.label];
        if (value == null) {
          const matchedKey = Object.keys(dropdownAnswers).find(k => {
            const lk = k.trim().toLowerCase();
            const sl = (select.label || '').trim().toLowerCase();
            const si = (select.id || '').trim().toLowerCase();
            return lk === sl || lk === si || (sl && (sl.includes(lk) || lk.includes(sl)));
          });
          if (matchedKey) value = dropdownAnswers[matchedKey];
        }
        if (value == null && (dropdownAnswers[idx] !== undefined || dropdownAnswers[String(idx + 1)] !== undefined)) {
          value = dropdownAnswers[idx] ?? dropdownAnswers[String(idx + 1)];
        }
        const choices = (select.options || []).filter(option => {
          const text = String(option?.text || '').trim();
          const optionValue = String(option?.value ?? '').trim();
          return !!optionValue && !/^(?:choose|select|chọn)(?:\s|\.|…|$)/i.test(text);
        });
        const position = choices.findIndex(option => String(option?.value ?? '') === String(value) || String(option?.text ?? '').trim() === String(value));
        return position >= 0 ? String(position + 1) : String(value ?? '').trim();
      }).filter(Boolean).join('');
    }

    const objectAnswers = (result.answers && typeof result.answers === 'object') ? result.answers : ((typeof result.answer === 'object' && result.answer !== null) ? result.answer : null);
    if (objectAnswers) {
      return Object.entries(objectAnswers).map(([key, value]) => `${key}:${value}`).join(', ');
    }
    return String(result.answerText || result.answer || '').trim();
  }

  copyAnswerToClipboard(answer) {
    const text = String(answer || '').trim();
    if (!text) return;
    const action = globalThis.MessageActions?.WRITE_ANSWER_CLIPBOARD || 'WRITE_ANSWER_CLIPBOARD';
    if (globalThis.chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action, text }, () => void chrome.runtime.lastError);
      return;
    }
    navigator.clipboard?.writeText?.(text).catch?.(() => {});
  }

  cacheKey(question) {
    const origin = typeof location !== 'undefined' ? location.origin : 'unknown-origin';
    return `qa-answer-v1:${origin}:${this.getQuestionFingerprint(question)}`;
  }

  sendRuntimeMessage(request) {
    if (!globalThis.chrome?.runtime?.sendMessage) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(request, response => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(response || null);
        });
      } catch (_) { resolve(null); }
    });
  }

  async cacheAnswer(question, result, autoApplyStatus) {
    const compactAnswer = this.getDisplayAnswer(result, question);
    if (!compactAnswer || !question) return;
    const item = {
      siteOrigin: typeof location !== 'undefined' ? location.origin : 'unknown-origin',
      questionFingerprint: this.getQuestionFingerprint(question),
      questionType: question.type || null,
      answer: result.answer ?? result.answers ?? result.answerText ?? result.dropdownAnswers ?? result.multiInputAnswers ?? null,
      compactAnswer,
      model: result.model || result.provenance?.[0]?.model || null,
      verificationStatus: result.status || (result.eligibleForAutoApply ? 'AI_VERIFIED' : 'CONSENSUS_UNVERIFIED'),
      autoApplyStatus,
      timestamp: new Date().toISOString()
    };
    await this.sendRuntimeMessage({
      action: globalThis.MessageActions?.ANSWER_CACHE_SET || 'ANSWER_CACHE_SET',
      key: this.cacheKey(question), item
    });
  }

  async showCachedAnswer() {
    const questions = ExamDomScanner.scanAll?.() || [];
    const question = this.findActiveQuestion(questions);
    if (!question) {
      StealthToastNotifier.show('Không tìm thấy câu hỏi để xem cache.', 'warning', 2500);
      return;
    }
    const response = await this.sendRuntimeMessage({
      action: globalThis.MessageActions?.ANSWER_CACHE_GET || 'ANSWER_CACHE_GET', key: this.cacheKey(question)
    });
    const answer = String(response?.item?.compactAnswer || '').trim();
    if (!answer) {
      StealthToastNotifier.show('Chưa có đáp án cache cho câu hỏi này.', 'info', 2500);
      return;
    }
    // Alt+B never calls the solver and never maps a cache entry back to DOM.
    StealthToastNotifier.showAnswer(answer, 5000);
    this.copyAnswerToClipboard(answer);
  }

  applyMultiInputAnswers(question, answers) {
    if (!question || !answers || typeof answers !== 'object') return 0;
    let applied = 0;
    (question.fields || []).forEach((field, idx) => {
      let value = answers[field.id] ?? answers[field.label];
      if (value == null) {
        const matchedKey = Object.keys(answers).find(k => {
          const lk = k.trim().toLowerCase();
          const fl = (field.label || '').trim().toLowerCase();
          const fi = (field.id || '').trim().toLowerCase();
          return lk === fl || lk === fi || (fl && (fl.includes(lk) || lk.includes(fl)));
        });
        if (matchedKey != null) {
          value = answers[matchedKey];
        }
      }
      if (value == null && (answers[idx] !== undefined || answers[String(idx + 1)] !== undefined)) {
        value = answers[idx] ?? answers[String(idx + 1)];
      }
      if (!value || !field.element) return;
      const ok = field.kind === 'select'
        ? DomAnswerClicker.selectDropdownOption(field.element, value)
        : DomAnswerClicker.fillTextInput(field.element, value);
      if (ok) applied += 1;
    });
    return applied;
  }

  clearUnselectedCheckboxes(question, answerKeys) {
    if (question?.type !== 'multiple_choice' || !Array.isArray(question.options)) return;
    const selected = new Set((answerKeys || []).map(key => String(key || '').trim().toUpperCase()));
    question.options.forEach(option => {
      const input = option?.input;
      // Apply the exact verified set inside this one scanned question card.
      // A public click preserves React/Moodle state and never reaches another
      // question block; unknown/custom controls are left untouched.
      if (input?.type === 'checkbox' && input.checked && !selected.has(String(option.key || '').trim().toUpperCase())) {
        try { input.click?.(); } catch (_) {}
      }
    });
  }

  markChoiceSuggestion(question, result) {
    if (!question || !result || typeof DomAnswerClicker === 'undefined') return false;
    DomAnswerClicker.clearSuggestedMarkers?.(question.element);
    const markOption = answer => {
      const key = String(answer || '').trim().toUpperCase();
      const option = question.options?.find(item => item.key === key);
      if (option) return DomAnswerClicker.markSuggestedAnswer?.(option.input, option.label || option.element) === true;
      const element = question.element?.querySelector?.(`[data-qa-opt="${key}"]`);
      return element ? DomAnswerClicker.markSuggestedAnswer?.(element.tagName === 'INPUT' ? element : element.querySelector?.('input'), element) === true : false;
    };
    if (question.type === 'true_false_group' && result.answers && !Array.isArray(result.answers)) {
      return Object.entries(result.answers).some(([key, value]) => {
        const target = question.items?.find(item => item.key === key);
        return DomAnswerClicker.markSuggestedAnswer?.(/đúng|true/i.test(value) ? target?.trueInput : target?.falseInput, target?.trueInput?.parentElement || target?.falseInput?.parentElement) === true;
      });
    }
    if (question.type === 'dropdown_select') {
      const answers = result.dropdownAnswers || result.answers || {};
      return (question.selects || []).some(select => {
        const answer = answers[select.id] ?? answers[select.label];
        return answer ? DomAnswerClicker.selectDropdownOption(select.element, answer) : false;
      });
    }
    if (Array.isArray(result.answers)) return result.answers.some(markOption);
    return typeof result.answer === 'string' ? markOption(result.answer) : false;
  }

  isQuestionVisible(q) {
    if (!q || !q.element) return false;
    const el = q.element;
    if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  isElementInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vHeight = window.innerHeight || document.documentElement.clientHeight;
    const vWidth = window.innerWidth || document.documentElement.clientWidth;
    return (
      rect.bottom > 80 &&
      rect.top < vHeight - 80 &&
      rect.right > 0 &&
      rect.left < vWidth
    );
  }

  findMoodleCurrentPageQuestion(questions) {
    if (typeof document === 'undefined' || !Array.isArray(questions)) return null;
    const currentCard = document.querySelector('.que.current-page, .question.current-page, [data-question-id].current-page');
    if (currentCard) {
      const match = questions.find(question => question.element === currentCard || currentCard.contains?.(question.element));
      if (match) return match;
    }
    const currentNav = document.querySelector('.quiz-nav-btn.current-page[data-q], [data-q].current-page[href^="#q"]');
    const currentId = currentNav?.getAttribute?.('data-q');
    return currentId
      ? questions.find(question => question.element?.id === currentId || question.id === currentId || question.id?.endsWith?.(currentId.replace(/^q/, ''))) || null
      : null;
  }

  findActiveQuestion(questions) {
    if (!questions || questions.length === 0) return null;

    // Moodle pagination keeps all cards in the DOM and hides inactive cards.
    // Its explicit current-page state is more reliable than layout metrics.
    const moodleCurrent = this.findMoodleCurrentPageQuestion(questions);
    if (moodleCurrent) return moodleCurrent;

    // 1. Lọc tất cả các câu hỏi đang hiển thị trên màn hình
    const visible = questions.filter(q => this.isQuestionVisible(q));

    if (visible.length === 1) {
      // Chế độ 1 câu/trang: Chọn đúng câu duy nhất đang hiển thị!
      return visible[0];
    }

    if (visible.length > 1) {
      // Chế độ hiển thị nhiều câu: ưu tiên câu nằm trong viewport và chưa trả lời
      const inViewUnanswered = visible.find(q => this.isElementInViewport(q.element) && !this.isQuestionAnswered(q));
      if (inViewUnanswered) return inViewUnanswered;

      // Hoặc câu nằm trong viewport
      const inView = visible.find(q => this.isElementInViewport(q.element));
      if (inView) return inView;

      // Hoặc câu visible đầu tiên chưa trả lời
      const firstUnanswered = visible.find(q => !this.isQuestionAnswered(q));
      if (firstUnanswered) return firstUnanswered;

      return visible[0];
    }

    return questions.find(q => !this.isQuestionAnswered(q)) || questions[0];
  }

  findQuestionForCaptureTarget(questions, captureTarget) {
    if (!captureTarget || !Array.isArray(questions)) return null;
    return questions.find(question =>
      question?.element === captureTarget ||
      question?.element?.contains?.(captureTarget) ||
      captureTarget?.contains?.(question?.element)
    ) || null;
  }

  async solveSingle(image = null, preferredQuestion = null) {
    if (this.isSolvingProcess) return;
    this.isSolvingProcess = true;

    try {
      let questions = ExamDomScanner.scanAll();
      // Moodle and SPA quiz controls may arrive one render tick after the
      // keydown. Do one bounded re-scan before declaring the page empty.
      if (!questions || questions.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 220));
        questions = ExamDomScanner.scanAll();
      }
      // Alt+N is an explicit diagnostic action: retain a complete snapshot of
      // the real page DOM and detector output in that tab's DevTools console.
      ExamDomScanner.logDiagnostics?.(questions, { trigger: image ? 'Alt+Y' : 'Alt+N' });
      if (!questions || questions.length === 0) {
        StealthToastNotifier.show('Không tìm thấy câu hỏi nào trên trang.', 'error', 2500);
        this.isSolvingProcess = false;
        return;
      }

      // Chọn câu hỏi đang hiển thị trên màn hình hiện tại
      let targetQ = preferredQuestion && questions.find(question => question.element === preferredQuestion.element || question.id === preferredQuestion.id);
      if (!targetQ) targetQ = this.findActiveQuestion(questions);
      if (!targetQ) targetQ = questions[0];
      const request = this.beginRequest(targetQ);

      StealthToastNotifier.show(`Đang giải câu ${targetQ.num}...`, 'info', 2000);

      const result = await this.solverEngine.solveQuestion(image ? { ...targetQ, image } : targetQ);
      if (!this.isRequestCurrent(request, targetQ)) return;
      if (result?.displayOnly === true) {
        const answer = this.getDisplayAnswer(result, targetQ);
        if (answer) {
          StealthToastNotifier.showAnswer(answer);
          this.copyAnswerToClipboard(answer);
          await this.cacheAnswer(targetQ, result, 'DISPLAY_ONLY');
        }
        return;
      }
      if (this.canApplyResult(request, targetQ, result)) {
        DomAnswerClicker.clearSuggestedMarkers(targetQ.element);

        // 1. Câu hỏi Đúng / Sai
        if (targetQ.type === 'true_false_group' && (result.answers || result.answer)) {
          const answers = result.answers || result.answer || {};
          Object.entries(answers).forEach(([key, val]) => {
            const isTrue = /đúng|true/i.test(val);
            const optCode = `${key.toUpperCase()}_${isTrue ? 'TRUE' : 'FALSE'}`;
            const item = targetQ.items?.find(it => it.key === key.toUpperCase());
            const targetInput = isTrue ? item?.trueInput : item?.falseInput;
            if (targetInput) {
              DomAnswerClicker.forceClickTarget(targetInput, targetInput.parentElement);
            } else {
              const inp = targetQ.element?.querySelector(`[data-qa-opt="${optCode}"]`);
              if (inp) DomAnswerClicker.forceClickTarget(inp.tagName === 'INPUT' ? inp : inp.querySelector('input') || inp, inp);
            }
          });
        }
        // 2. Câu hỏi Short Answer / Điền text
        else if (targetQ.type === 'short_answer') {
          const textToFill = result.answerText || result.answer || '';
          const targetInp = targetQ.input || targetQ.inputs?.[0];
          if (targetInp && textToFill) {
            DomAnswerClicker.fillTextInput(targetInp, textToFill);
          }
        }
        // 3. Câu hỏi Dropdown / Sổ xuống
        else if (targetQ.type === 'multi_input') {
          const answers = result.multiInputAnswers || result.answers || result.answer || {};
          this.applyMultiInputAnswers(targetQ, answers);
        }
        else if (targetQ.type === 'dropdown_select') {
          const ansMap = result.dropdownAnswers || result.answers || result.answer || {};
          (targetQ.selects || []).forEach((sel, idx) => {
            let val = ansMap[sel.id] ?? ansMap[sel.label];
            if (val == null) {
              const matchedKey = Object.keys(ansMap).find(k => {
                const lk = k.trim().toLowerCase();
                const sl = (sel.label || '').trim().toLowerCase();
                const si = (sel.id || '').trim().toLowerCase();
                return lk === sl || lk === si || (sl && (sl.includes(lk) || lk.includes(sl)));
              });
              if (matchedKey) val = ansMap[matchedKey];
            }
            if (val == null && (ansMap[idx] !== undefined || ansMap[String(idx + 1)] !== undefined)) {
              val = ansMap[idx] ?? ansMap[String(idx + 1)];
            }
            if (val && sel.element) {
              DomAnswerClicker.selectDropdownOption(sel.element, val);
            }
          });
        }
        // 4. Trắc nghiệm nhiều đáp án (Checkboxes)
        else if (Array.isArray(result.answers) || (Array.isArray(result.answer) && targetQ.type === 'multiple_choice')) {
          const answersArr = Array.isArray(result.answers) ? result.answers : result.answer;
          this.clearUnselectedCheckboxes(targetQ, answersArr);
          for (const ansKey of answersArr) {
            const cleanKey = String(ansKey).toUpperCase().trim();
            const opt = targetQ.options?.find(o => o.key === cleanKey);
            let clicked = false;
            if (opt && (opt.input || opt.label || opt.element)) {
              clicked = DomAnswerClicker.forceClickTarget(opt.input, opt.label || opt.element);
            }
            if (!clicked && opt && targetQ.element) {
              clicked = DomAnswerClicker.selectInCard(targetQ.element, cleanKey, opt?.text || '');
            }
            await new Promise(r => setTimeout(r, 120));
          }
        }
        // 5. Trắc nghiệm 1 đáp án (Radio)
        else if (result.answer) {
          const cleanKey = String(result.answer).toUpperCase().trim();
          const opt = targetQ.options?.find(o => o.key === cleanKey || o.key === result.answer);
          let clicked = false;

          if (opt && (opt.input || opt.label || opt.element)) {
            clicked = DomAnswerClicker.forceClickTarget(opt.input, opt.label || opt.element);
          }
          if (!clicked && opt && targetQ.element) {
            clicked = DomAnswerClicker.selectInCard(targetQ.element, cleanKey, opt?.text || '');
          }
        }

        if (targetQ.type !== 'short_answer' && targetQ.type !== 'dropdown_select' && targetQ.type !== 'multi_input') {
          this.markChoiceSuggestion(targetQ, result);
        }
        const displayAnswer = this.getDisplayAnswer(result, targetQ);
        if (displayAnswer) {
          StealthToastNotifier.showAnswer(displayAnswer);
          this.copyAnswerToClipboard(displayAnswer);
        }
        await this.cacheAnswer(targetQ, result, 'APPLIED');
      } else if (this.canSuggestResult(request, targetQ, result)) {
        this.markChoiceSuggestion(targetQ, result);
        const displayAnswer = this.getDisplayAnswer(result, targetQ);
        if (displayAnswer) {
          StealthToastNotifier.showAnswer(displayAnswer);
          this.copyAnswerToClipboard(displayAnswer);
        }
        await this.cacheAnswer(targetQ, result, 'NOT_ELIGIBLE');
      } else {
        StealthToastNotifier.show(`Bất đồng thuận câu ${targetQ.num}`, 'warning', 2500);
      }
    } catch (err) {
      const detail = String(err?.message || '').replace(/[\r\n]/g, ' ').slice(0, 160);
      StealthToastNotifier.show(detail ? `Lỗi giải câu hỏi: ${detail}` : 'Lỗi trong quá trình giải câu hỏi.', 'error', 5000);
    } finally {
      this.isSolvingProcess = false;
    }
  }

  // Alt+M is deliberately separate from the verified Alt+N flow. It requests
  // one model only and may display/copy an answer, but never changes the page.
  async solveSingleModel(image = null, preferredQuestion = null) {
    if (this.isSolvingProcess) return;
    if (!this.solverEngine?.solveSingleModel) return;
    this.isSolvingProcess = true;
    try {
      let questions = ExamDomScanner.scanAll();
      if (!questions?.length) {
        await new Promise(resolve => setTimeout(resolve, 220));
        questions = ExamDomScanner.scanAll();
      }
      const targetQ = (preferredQuestion && questions?.find(question => question.element === preferredQuestion.element || question.id === preferredQuestion.id)) || this.findActiveQuestion(questions || []) || questions?.[0];
      if (!targetQ) return;
      const request = this.beginRequest(targetQ);
      const result = await this.solverEngine.solveSingleModel(image ? { ...targetQ, image } : targetQ);
      if (!this.isRequestCurrent(request, targetQ) || result?.displayOnly !== true) return;
      const answer = this.getDisplayAnswer(result, targetQ);
      if (answer) {
        StealthToastNotifier.showAnswer(answer);
        this.copyAnswerToClipboard(answer);
        await this.cacheAnswer(targetQ, result, 'DISPLAY_ONLY');
      }
    } finally {
      this.isSolvingProcess = false;
    }
  }

  async solveCapturedImage(image, captureTarget = null) {
    if (!image || typeof image !== 'string') throw new Error('Ảnh chụp không hợp lệ.');
    if (this.isSolvingProcess) {
      StealthToastNotifier.show('Đang xử lý một yêu cầu khác.', 'warning', 2200);
      return;
    }

    // When a quiz card can be identified, keep its precise answer schema so
    // a verified answer may be applied to that exact card.
    const questions = ExamDomScanner.scanAll() || [];
    // If a crop came from a known card, solve that exact card. Falling back to
    // another visible card would pair image pixels with the wrong answer form.
    const targetQ = captureTarget
      ? this.findQuestionForCaptureTarget(questions, captureTarget)
      : this.findActiveQuestion(questions);
    if (targetQ) return this.solveSingle(image, targetQ);

    // Screenshot capture must also work on pages whose markup is unknown to
    // our scanner. In that case ask the vision pipeline directly and show a
    // verified suggestion; without a known form control it must not click.
    this.isSolvingProcess = true;
    try {
      StealthToastNotifier.show('Đang giải nội dung trong ảnh...', 'info', 3000);
      const result = await this.solverEngine.solveQuestion({
        type: 'image',
        title: 'Read the selected screenshot and provide the requested answer. Return only the concise answer visible or implied by the screenshot.',
        image
      });
      const answer = Array.isArray(result?.answers) ? result.answers.join(', ') : (result?.answerText || result?.answer || '');
      if (result?.consensus && answer) {
        const verified = result.eligibleForAutoApply === true;
        const marked = this.markCapturedSuggestion(answer, captureTarget);
        const prefix = verified ? 'Kết quả từ ảnh' : 'Gợi ý từ ảnh (chưa tự chọn)';
        const displayAnswer = String(answer).slice(0, 220);
        StealthToastNotifier.showAnswer(displayAnswer, 4000);
        this.copyAnswerToClipboard(displayAnswer);
        return;
      }
      const status = String(result?.consensusStatus || '').replace(/_/g, ' ').toLowerCase();
      StealthToastNotifier.show(status ? `Ảnh chưa có đáp án đồng thuận (${status}).` : 'Ảnh chưa có đáp án đồng thuận.', 'warning', 4200);
    } catch (err) {
      const detail = String(err?.message || '').replace(/[\r\n]/g, ' ').slice(0, 160);
      StealthToastNotifier.show(detail ? `Lỗi giải từ ảnh: ${detail}` : 'Lỗi giải từ ảnh.', 'error', 5000);
    } finally {
      this.isSolvingProcess = false;
    }
  }

  // Alt+U: cropped screenshot + the same one-model, display/copy-only policy
  // as Alt+M. It never invokes the debate pipeline and never alters the DOM.
  async solveCapturedImageSingleModel(image, captureTarget = null) {
    if (!image || typeof image !== 'string') throw new Error('Invalid captured image.');
    if (this.isSolvingProcess) {
      StealthToastNotifier.show('A request is already being processed.', 'warning', 2200);
      return;
    }
    if (!this.solverEngine?.solveSingleModel) return;

    const questions = ExamDomScanner.scanAll() || [];
    const targetQ = captureTarget
      ? this.findQuestionForCaptureTarget(questions, captureTarget)
      : this.findActiveQuestion(questions);
    if (targetQ) return this.solveSingleModel(image, targetQ);

    this.isSolvingProcess = true;
    try {
      StealthToastNotifier.show('Solving the selected image with one model...', 'info', 3000);
      const result = await this.solverEngine.solveSingleModel({
        type: 'image',
        title: 'Read the selected screenshot and provide only the concise requested answer.',
        image
      });
      const answer = this.getDisplayAnswer(result);
      if (result?.displayOnly === true && answer) {
        StealthToastNotifier.showAnswer(answer);
        this.copyAnswerToClipboard(answer);
      } else {
        StealthToastNotifier.show('The single model did not return a usable answer.', 'warning', 3500);
      }
    } catch (err) {
      const detail = String(err?.message || '').replace(/[\r\n]/g, ' ').slice(0, 160);
      StealthToastNotifier.show(detail ? `Image solve error: ${detail}` : 'Image solve error.', 'error', 5000);
    } finally {
      this.isSolvingProcess = false;
    }
  }

  markCapturedSuggestion(answer, captureTarget) {
    // Capture solving is display-only too; never map an image result back to
    // the page DOM.
    return false;
  }

  async solveContinuous(singleModelAutoApply = false) {
    if (this.isSolvingProcess) return;
    if (singleModelAutoApply && !this.solverEngine?.solveSingleModel) return;
    this.isSolvingProcess = true;

    try {
      const questions = ExamDomScanner.scanAll();
      if (!questions || questions.length === 0) {
        StealthToastNotifier.show('Không tìm thấy câu hỏi nào trên trang.', 'error', 2500);
        this.isSolvingProcess = false;
        return;
      }

      // Chỉ giải các câu hỏi đang hiển thị trên trang hiện tại!
      const visibleQuestions = questions.filter(q => this.isQuestionVisible(q));
      const targetQuestions = visibleQuestions.length > 0 ? visibleQuestions : questions;

      for (const q of targetQuestions) {
        if (!this.isSolvingProcess) break;
        if (this.isQuestionAnswered(q)) continue;
        const request = this.beginRequest(q);

        StealthToastNotifier.show(`Đang giải câu ${q.num}${singleModelAutoApply ? ' (nhanh)...' : '...'}`, 'info', 1500);
        const result = singleModelAutoApply
          ? await this.solverEngine.solveSingleModel(q)
          : await this.solverEngine.solveQuestion(q);
        if (!this.isRequestCurrent(request, q)) continue;
        if (result?.displayOnly === true && !singleModelAutoApply) {
          const answer = this.getDisplayAnswer(result, q);
          if (answer) { StealthToastNotifier.showAnswer(answer); this.copyAnswerToClipboard(answer); }
          continue;
        }
        const canApply = this.canApplyResult(request, q, result) ||
          (singleModelAutoApply && this.canApplyUserRequestedSingleModelResult(request, q, result));
        if (canApply) {
          DomAnswerClicker.clearSuggestedMarkers(q.element);

          if (q.type === 'true_false_group' && (result.answers || result.answer)) {
            const answers = result.answers || result.answer || {};
            Object.entries(answers).forEach(([key, val]) => {
              const isTrue = /đúng|true/i.test(val);
              const optCode = `${key.toUpperCase()}_${isTrue ? 'TRUE' : 'FALSE'}`;
              const item = q.items?.find(it => it.key === key.toUpperCase());
              const targetInput = isTrue ? item?.trueInput : item?.falseInput;
              if (targetInput) {
                DomAnswerClicker.forceClickTarget(targetInput, targetInput.parentElement);
              } else {
                const inp = q.element?.querySelector(`[data-qa-opt="${optCode}"]`);
                if (inp) DomAnswerClicker.forceClickTarget(inp.tagName === 'INPUT' ? inp : inp.querySelector('input') || inp, inp);
              }
            });
          } else if (q.type === 'short_answer') {
            const textToFill = result.answerText || result.answer || '';
            const targetInp = q.input || q.inputs?.[0];
            if (targetInp && textToFill) {
              DomAnswerClicker.fillTextInput(targetInp, textToFill);
            }
          } else if (q.type === 'multi_input') {
            this.applyMultiInputAnswers(q, result.multiInputAnswers || result.answers || result.answer || {});
          } else if (q.type === 'dropdown_select') {
            const ansMap = result.dropdownAnswers || result.answers || result.answer || {};
            (q.selects || []).forEach((sel, idx) => {
              let val = ansMap[sel.id] ?? ansMap[sel.label];
              if (val == null) {
                const matchedKey = Object.keys(ansMap).find(k => {
                  const lk = k.trim().toLowerCase();
                  const sl = (sel.label || '').trim().toLowerCase();
                  const si = (sel.id || '').trim().toLowerCase();
                  return lk === sl || lk === si || (sl && (sl.includes(lk) || lk.includes(sl)));
                });
                if (matchedKey) val = ansMap[matchedKey];
              }
              if (val == null && (ansMap[idx] !== undefined || ansMap[String(idx + 1)] !== undefined)) {
                val = ansMap[idx] ?? ansMap[String(idx + 1)];
              }
              if (val && sel.element) {
                DomAnswerClicker.selectDropdownOption(sel.element, val);
              }
            });
          } else if (Array.isArray(result.answers) || (Array.isArray(result.answer) && q.type === 'multiple_choice')) {
            const answersArr = Array.isArray(result.answers) ? result.answers : result.answer;
            this.clearUnselectedCheckboxes(q, answersArr);
            for (const ansKey of answersArr) {
              const cleanKey = String(ansKey).toUpperCase().trim();
              const opt = q.options?.find(o => o.key === cleanKey);
              let clicked = false;
              if (opt && (opt.input || opt.label || opt.element)) {
                clicked = DomAnswerClicker.forceClickTarget(opt.input, opt.label || opt.element);
              }
              if (!clicked && opt && q.element) {
                clicked = DomAnswerClicker.selectInCard(q.element, cleanKey, opt?.text || '');
              }
              await new Promise(r => setTimeout(r, 120));
            }
          } else if (result.answer) {
            const cleanKey = String(result.answer).toUpperCase().trim();
            const opt = q.options?.find(o => o.key === cleanKey || o.key === result.answer);
            let clicked = false;

            if (opt && (opt.input || opt.label || opt.element)) {
              clicked = DomAnswerClicker.forceClickTarget(opt.input, opt.label || opt.element);
            }
            if (!clicked && opt && q.element) {
              clicked = DomAnswerClicker.selectInCard(q.element, cleanKey, opt?.text || '');
            }
          }
          const displayAnswer = this.getDisplayAnswer(result, q);
          if (displayAnswer) { StealthToastNotifier.showAnswer(displayAnswer); this.copyAnswerToClipboard(displayAnswer); }
          await this.cacheAnswer(q, result, singleModelAutoApply ? 'USER_REQUESTED_SINGLE_MODEL_APPLIED' : 'APPLIED');
        } else if (this.canSuggestResult(request, q, result)) {
          const answer = this.getDisplayAnswer(result, q);
          if (answer) { StealthToastNotifier.showAnswer(answer); this.copyAnswerToClipboard(answer); }
          await this.cacheAnswer(q, result, 'NOT_ELIGIBLE');
        }
        await new Promise(r => setTimeout(r, 600));
      }

      if (this.isSolvingProcess && this.isAutoAdvanceEnabled() && !DomAnswerClicker.MANUAL_REVIEW_MODE) {
        StealthToastNotifier.show('Đã giải xong các câu trên trang này!', 'success', 2500);
        this.onAutoAdvance();
      } else if (this.isSolvingProcess && this.isAutoAdvanceEnabled() && DomAnswerClicker.MANUAL_REVIEW_MODE) {
        StealthToastNotifier.show('Đã đánh dấu gợi ý. Hãy tự chọn đáp án trước khi chuyển trang.', 'info', 3000);
      }
    } catch (err) {
      const detail = String(err?.message || '').replace(/[\r\n]/g, ' ').slice(0, 160);
      StealthToastNotifier.show(detail ? `Lỗi tiến trình: ${detail}` : 'Lỗi tiến trình tự động giải.', 'error', 5000);
    } finally {
      this.isSolvingProcess = false;
    }
  }

  // Alt+K: process every visible unanswered question using exactly the
  // one-model request path of Alt+M, then apply only answers that map
  // completely to the originally scanned controls. The result remains tagged
  // SINGLE_MODEL_UNVERIFIED; it is never upgraded to AI_VERIFIED.
  async solveContinuousSingleModelAutoApply() {
    return this.solveContinuous(true);
  }

  isQuestionAnswered(q) {
    if (!q || !q.element) return false;
    if (q.type === 'true_false_group') {
      const inputs = Array.from(q.element.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'));
      return inputs.length >= (q.items?.length || 4);
    }
    if (q.type === 'short_answer') {
      const inp = q.input || q.inputs?.[0];
      return !!(inp && inp.value && inp.value.trim().length > 0);
    }
    if (q.type === 'multi_input') {
      const fields = q.fields || [];
      return fields.length > 0 && fields.every(field => {
        if (!field.element) return false;
        return field.kind === 'select' ? !!field.element.value : !!String(field.element.value || '').trim();
      });
    }
    if (q.type === 'dropdown_select') {
      const selects = q.selects || [];
      if (selects.length === 0) return false;
      return selects.every(s => s.element && s.element.value && s.element.value !== '');
    }
    const checked = Array.from(q.element.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'))
      .filter(inp => inp.value !== '-1' && !inp.closest('.clear-choice, .clearchoice, .clear'));
    return checked.length > 0;
  }

  defaultAutoAdvance() {
    const nextBtn = document.querySelector('input[name="next"], .mod_quiz-next-nav, #mod_quiz-next-nav, button.next-page, a.next-page');
    if (nextBtn) {
      nextBtn.click();
    }
  }

}

globalThis.ContinuousSolveRunner = ContinuousSolveRunner;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContinuousSolveRunner };
}
