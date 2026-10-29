/**
 * Q&A Detector & AI Auto Solver - Content Script Entry Point
 * Tự động quét và giải đề thi trắc nghiệm bằng AI đa model và auto-click trên web.
 */

(function initContentApp() {
  if (globalThis.__qaContentAppInitialized) return;
  globalThis.__qaContentAppInitialized = true;

  // SILENT STEALTH MODE: Vô hiệu hóa toàn bộ console trong content script để DevTools luôn sạch sẽ 100%
  if (typeof console !== 'undefined') {
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.error = () => {};
  }

  // Khởi tạo các thành phần
  const solverEngine = AdaptiveDebateApiClient.fromRuntimeConfig();

  const solveRunner = new ContinuousSolveRunner({
    solverEngine: solverEngine,
    onAutoAdvance: () => {
      MoodleNavigationHandler.clickNextPageButton();
    }
  });

  // Đăng ký phím tắt toàn cục
  const hotKeyManager = new HotKeyManager({
    onSingleSolve: () => solveRunner.solveSingle(),
    onSingleModelSolve: () => solveRunner.solveSingleModel(),
    onContinuousSolve: () => solveRunner.solveContinuousSingleModelAutoApply(),
    onCaptureSolve: () => solveCaptureAndSolve(solveRunner),
    onCaptureSingleModelSolve: () => solveCaptureAndSingleModel(solveRunner),
    onShowCachedAnswer: () => solveRunner.showCachedAnswer(),
    onStop: () => {
      solveRunner.stop();
    }
  });
  hotKeyManager.register();

  async function solveCaptureAndSolve(runner) {
    if (window.top !== window) return;
    try {
      StealthToastNotifier.show('Kéo chuột để chọn vùng cần giải.', 'info', 3500);
      const rect = await CaptureSelectionOverlay.select();
      const captureTarget = document.elementFromPoint(
        Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2)),
        Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2))
      )?.closest?.('.que, .question, [data-qa-id], [data-question-id], .yh-question-card, [class*="question-card"]') || null;
      const action = globalThis.MessageActions?.CAPTURE_VISIBLE_TAB || 'CAPTURE_VISIBLE_TAB';
      const captured = await new Promise((resolve, reject) => chrome.runtime.sendMessage({ action }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.success || !response.dataUrl) return reject(new Error(response?.error || 'Không thể chụp màn hình.'));
        resolve(response.dataUrl);
      }));
      const image = await CaptureSelectionOverlay.crop(captured, rect);
      await runner.solveCapturedImage(image, captureTarget);
    } catch (error) {
      const message = String(error?.message || 'Không thể chụp ảnh.');
      if (!/Đã hủy/.test(message)) StealthToastNotifier.show(message, 'error', 3500);
    }
  }

  // Lắng nghe Message từ Background Service Worker & Popup
  // Alt+U captures exactly like Alt+Y, but intentionally enters the
  // display/copy-only single-model path used by Alt+M.
  async function solveCaptureAndSingleModel(runner) {
    if (window.top !== window) return;
    try {
      StealthToastNotifier.show('Drag to select the area for quick solve (one model).', 'info', 3500);
      const rect = await CaptureSelectionOverlay.select();
      const captureTarget = document.elementFromPoint(
        Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2)),
        Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2))
      )?.closest?.('.que, .question, [data-qa-id], [data-question-id], .yh-question-card, [class*="question-card"]') || null;
      const action = globalThis.MessageActions?.CAPTURE_VISIBLE_TAB || 'CAPTURE_VISIBLE_TAB';
      const captured = await new Promise((resolve, reject) => chrome.runtime.sendMessage({ action }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.success || !response.dataUrl) return reject(new Error(response?.error || 'Unable to capture the screen.'));
        resolve(response.dataUrl);
      }));
      const image = await CaptureSelectionOverlay.crop(captured, rect);
      await runner.solveCapturedImageSingleModel(image, captureTarget);
    } catch (error) {
      const message = String(error?.message || 'Unable to capture the image.');
      if (!/cancelled|canceled/i.test(message)) StealthToastNotifier.show(message, 'error', 3500);
    }
  }

  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const actions = globalThis.MessageActions || {};

      if (request.action === (actions.SCAN_QUESTIONS || 'SCAN_QUESTIONS')) {
        try {
          const results = ExamDomScanner.scanAll() || [];
          sendResponse({
            success: true,
            data: results,
            count: results.length,
            stats: ExamDomScanner.buildExtractionStats(results),
            url: window.location.href
          });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      } else if (request.action === (actions.AUTO_SELECT_ANSWER || 'AUTO_SELECT_ANSWER')) {
        let ok = false;
        if (Array.isArray(request.key)) {
          request.key.forEach(k => {
            ok = DomAnswerClicker.autoSelectAnswerOnPage(request.qaId, k, '') || ok;
          });
        } else if (typeof request.key === 'string' && request.key.includes(',')) {
          request.key.split(',').map(s => s.trim()).forEach(k => {
            ok = DomAnswerClicker.autoSelectAnswerOnPage(request.qaId, k, '') || ok;
          });
        } else {
          ok = DomAnswerClicker.autoSelectAnswerOnPage(request.qaId, request.key, request.optionText);
        }
        sendResponse({ success: ok });
      } else if (request.action === (actions.TRIGGER_SINGLE_SOLVE || 'TRIGGER_SINGLE_SOLVE')) {
        solveRunner.solveSingle();
        sendResponse({ success: true });
      } else if (request.action === (actions.TRIGGER_SINGLE_MODEL_SOLVE || 'TRIGGER_SINGLE_MODEL_SOLVE')) {
        solveRunner.solveSingleModel();
        sendResponse({ success: true });
      } else if (request.action === (actions.TRIGGER_CONTINUOUS_SOLVE || 'TRIGGER_CONTINUOUS_SOLVE') || request.action === (actions.TRIGGER_AUTO_SOLVE || 'TRIGGER_AUTO_SOLVE')) {
        solveRunner.solveContinuousSingleModelAutoApply();
        sendResponse({ success: true });
      } else if (request.action === (actions.STOP_AUTO_SOLVE || 'STOP_AUTO_SOLVE')) {
        solveRunner.stop();
        sendResponse({ success: true });
      } else if (request.action === (actions.TRIGGER_REVIEW_CACHE || 'TRIGGER_REVIEW_CACHE')) {
        solveRunner.showCachedAnswer();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  // Tự động phục hồi khi gặp trang lỗi Moodle
  MoodleNavigationHandler.handleMoodleErrorPageAutoRecover();

  // Tự động giải tiếp nếu đang bật chế độ Auto Advance
  if (solveRunner.isAutoAdvanceEnabled()) {
    setTimeout(() => {
      if (!solveRunner.isSolvingProcess) {
        solveRunner.solveContinuous();
      }
    }, 900);
  }
})();
