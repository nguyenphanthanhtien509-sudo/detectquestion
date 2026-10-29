class MoodleNavigationHandler {
  static handleMoodleErrorPageAutoRecover() {
    if (typeof document === 'undefined') return false;
    const errorHeaders = Array.from(document.querySelectorAll('h2, h3, .alert, .notifyproblem, .errormessage'));
    const isError = errorHeaders.some(el => {
      const txt = (el.innerText || el.textContent || '').toLowerCase();
      return txt.includes('error') || txt.includes('lỗi') || txt.includes('invalid') || txt.includes('exception');
    });

    if (isError) {
      const retryBtn = document.querySelector('button.btn-primary, a.btn-primary, input[type="submit"]');
      if (retryBtn) {
        setTimeout(() => retryBtn.click(), 1200);
        return true;
      }
    }
    return false;
  }

  static clickNextPageButton() {
    if (typeof document === 'undefined') return false;
    const nextBtn = document.querySelector(
      'input[name="next"], button[name="next"], .mod_quiz-next-nav, ' +
      'input[value*="Trang tiếp"], input[value*="Next"], ' +
      'a.page-link[aria-label="Next"], .qnbutton.next'
    ) || Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'))
      .find(el => /^(next|trang tiếp|tiếp tục|tiếp)$/i.test((el.value || el.innerText || el.textContent || '').trim()));
    if (nextBtn) {
      nextBtn.click();
      return true;
    }
    return false;
  }
}

globalThis.MoodleNavigationHandler = MoodleNavigationHandler;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MoodleNavigationHandler };
}
