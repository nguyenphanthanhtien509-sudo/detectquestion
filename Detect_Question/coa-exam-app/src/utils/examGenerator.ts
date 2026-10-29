import { Question, Chapter, ExamConfig, ExamSession } from '../types/quiz';
import allQuestionsRaw from '../data/all_questions.json';
import chaptersRaw from '../data/chapters_metadata.json';
import fixtureQuestionsDataRaw from '../data/fixtureQuestionsData.json';
import { getQuestionStats } from './quizStorage';

export const ALL_QUESTIONS: Question[] = allQuestionsRaw as Question[];
export const ALL_CHAPTERS: Chapter[] = chaptersRaw as Chapter[];

export function getFixtureExamQuestions(fixtureId: string): Question[] {
  const data = (fixtureQuestionsDataRaw as Record<string, { questions: Question[] }>)[fixtureId];
  return data ? [...data.questions] : [];
}

export function getChapterQuestions(chapterId: string): Question[] {
  if (chapterId === 'all') return [...ALL_QUESTIONS];
  return ALL_QUESTIONS.filter(q => q.chapterId === chapterId);
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateExamSession(config: ExamConfig): ExamSession {
  // Case Fixture Exam: Nếu chọn từ 9 bộ đề thi Moodle chính thức, lấy chính xác danh sách câu hỏi gốc
  if (config.fixtureId) {
    const fixtureQuestions = getFixtureExamQuestions(config.fixtureId);
    if (fixtureQuestions.length > 0) {
      const initialAnswers: ExamSession['answers'] = {};
      for (const q of fixtureQuestions) {
        initialAnswers[q.id] = {
          selectedIndex: null,
          selectedIndices: [],
          textAnswer: '',
          matchingAnswers: {},
          isFlagged: false,
          timeSpentSeconds: 0,
        };
      }
      return {
        id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: config.title,
        config,
        questions: fixtureQuestions,
        answers: initialAnswers,
        startTime: Date.now(),
        isCompleted: false,
      };
    }
  }

  const stats = getQuestionStats();
  const pool = getChapterQuestions(config.chapterId || 'all');
  let selectedQuestions: Question[] = [];

  switch (config.mode) {
    case 'theory_only': {
      const theoryPool = pool.filter(q => q.category === 'theory');
      selectedQuestions = shuffleArray(theoryPool).slice(0, config.questionCount);
      break;
    }

    case 'practice_only': {
      const practicePool = pool.filter(q => q.category === 'practice');
      selectedQuestions = shuffleArray(practicePool).slice(0, config.questionCount);
      break;
    }

    case 'retry_incorrect': {
      const incorrectPool = pool.filter(q => {
        const s = stats[q.id];
        return s && s.attempts > 0 && s.lastCorrect === false;
      });
      if (incorrectPool.length > 0) {
        selectedQuestions = shuffleArray(incorrectPool).slice(0, config.questionCount);
      } else {
        // Nếu không có câu sai, lấy câu có tỷ lệ đúng thấp nhất
        selectedQuestions = shuffleArray(pool).slice(0, config.questionCount);
      }
      break;
    }

    case 'gap_targeting': {
      // Ưu tiên câu chưa từng làm (attempts === 0), tiếp theo là câu làm sai
      const sortedByNeed = [...pool].sort((a, b) => {
        const sa = stats[a.id]?.attempts || 0;
        const sb = stats[b.id]?.attempts || 0;
        if (sa !== sb) return sa - sb; // Ưu tiên ít làm nhất
        const ca = stats[a.id]?.correctCount || 0;
        const cb = stats[b.id]?.correctCount || 0;
        return ca - cb;
      });
      selectedQuestions = sortedByNeed.slice(0, config.questionCount);
      selectedQuestions = shuffleArray(selectedQuestions);
      break;
    }

    case 'cumulative': {
      // Đề thi cuối kỳ 50 câu: Lấy đều từ 6 chương
      const perChapter = Math.floor(config.questionCount / 6);
      const remaining = config.questionCount % 6;
      const chList = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6'];
      const picked: Question[] = [];

      chList.forEach((chId, idx) => {
        const count = perChapter + (idx < remaining ? 1 : 0);
        const chQuestions = ALL_QUESTIONS.filter(q => q.chapterId === chId);
        picked.push(...shuffleArray(chQuestions).slice(0, count));
      });

      selectedQuestions = shuffleArray(picked);
      break;
    }

    case 'standard_50':
    case 'chapter_all':
    default: {
      const targetCount = Math.min(config.questionCount, pool.length);
      const half = Math.floor(targetCount / 2);
      const theory = shuffleArray(pool.filter(q => q.category === 'theory'));
      const practice = shuffleArray(pool.filter(q => q.category === 'practice'));

      const pickedTheory = theory.slice(0, half);
      const pickedPractice = practice.slice(0, targetCount - pickedTheory.length);
      
      let combined = [...pickedTheory, ...pickedPractice];
      if (combined.length < targetCount) {
        // Bù thêm nếu thiếu
        const pickedIds = new Set(combined.map(q => q.id));
        const rest = shuffleArray(pool.filter(q => !pickedIds.has(q.id)));
        combined.push(...rest.slice(0, targetCount - combined.length));
      }
      selectedQuestions = shuffleArray(combined);
      break;
    }
  }

  // Khởi tạo trạng thái trả lời rỗng cho từng câu
  const initialAnswers: ExamSession['answers'] = {};
  for (const q of selectedQuestions) {
    initialAnswers[q.id] = {
      selectedIndex: null,
      isFlagged: false,
      timeSpentSeconds: 0,
    };
  }

  return {
    id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: config.title,
    config,
    questions: selectedQuestions,
    answers: initialAnswers,
    startTime: Date.now(),
    isCompleted: false,
  };
}
