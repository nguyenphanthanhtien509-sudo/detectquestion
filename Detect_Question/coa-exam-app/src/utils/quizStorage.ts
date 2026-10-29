import { QuestionHistoryRecord, ExamSession } from '../types/quiz';

const HISTORY_KEY = 'coa_test_history_v1';
const QUESTION_STATS_KEY = 'coa_question_stats_v1';
const ACTIVE_SESSION_KEY = 'coa_active_session_v1';

export function getTestHistory(): ExamSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load test history:', e);
    return [];
  }
}

export function saveCompletedSession(session: ExamSession): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getTestHistory();
    history.unshift(session);
    // Giữ tối đa 50 bài thi gần nhất
    if (history.length > 50) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    // Cập nhật thống kê câu hỏi
    const stats = getQuestionStats();
    for (const q of session.questions) {
      const ans = session.answers[q.id];
      if (!ans || ans.selectedIndex === null) continue;

      const isCorrect = ans.selectedIndex === q.correctIndex;
      const prev = stats[q.id] || {
        attempts: 0,
        correctCount: 0,
        lastAttemptTime: Date.now(),
        lastCorrect: false,
        isBookmarked: false,
      };

      stats[q.id] = {
        attempts: prev.attempts + 1,
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        lastAttemptTime: Date.now(),
        lastCorrect: isCorrect,
        isBookmarked: prev.isBookmarked || false,
      };
    }
    localStorage.setItem(QUESTION_STATS_KEY, JSON.stringify(stats));
    // Xóa active session sau khi nộp
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch (e) {
    console.error('Failed to save session:', e);
  }
}

export function getQuestionStats(): Record<string, QuestionHistoryRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(QUESTION_STATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to load question stats:', e);
    return {};
  }
}

export function toggleQuestionBookmark(questionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stats = getQuestionStats();
    const cur = stats[questionId] || {
      attempts: 0,
      correctCount: 0,
      lastAttemptTime: Date.now(),
      lastCorrect: false,
      isBookmarked: false,
    };
    cur.isBookmarked = !cur.isBookmarked;
    stats[questionId] = cur;
    localStorage.setItem(QUESTION_STATS_KEY, JSON.stringify(stats));
    return cur.isBookmarked;
  } catch (e) {
    console.error('Failed to bookmark question:', e);
    return false;
  }
}

export function saveActiveSession(session: ExamSession): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save active session:', e);
  }
}

export function getActiveSession(): ExamSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearActiveSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export function resetAllData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(QUESTION_STATS_KEY);
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}
