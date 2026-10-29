export type QuestionType = 'theory' | 'calculation' | 'scenario' | 'application' | 'algorithm';
export type QuestionFormat = 'single_choice' | 'multi_choice' | 'fill_in' | 'essay' | 'matching';
export type QuestionCategory = 'theory' | 'practice';
export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export interface MatchingSubpart {
  id: string;
  label: string;
  options: { value: string; text: string }[];
  correctValue?: string;
}

export interface Question {
  id: string;
  chapterId: string;
  number?: number;
  examId?: string;
  topicId?: string;
  subtopic: string;
  type?: QuestionType;
  format?: QuestionFormat;
  category?: QuestionCategory;
  difficulty?: DifficultyLevel;
  concept: string;
  sourceDoc?: string;
  sourcePage?: string;
  question: string;
  questionHtml?: string;
  prompt?: string;
  options: string[];
  correctIndex: number;
  correctIndices?: number[];
  inputLabel?: string;
  inputPlaceholder?: string;
  correctText?: string;
  matchingSubparts?: MatchingSubpart[];
  grade?: string | number;
  explanationEn?: string;
  explanationVi?: string;
  formula?: string;
  stepByStep?: string;
}

export interface Topic {
  id: string;
  title: string;
  subtopics: string[];
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  subtitle?: string | null;
  topics: Topic[];
}

export interface DocumentMeta {
  id: string;
  filename: string;
  chapterId: string;
  title: string;
  pages: number;
  slides: string;
  format: string;
  status: string;
  extractedSections: string[];
}

export type ExamMode = 
  | 'standard_50'       // 50 câu chuẩn cân bằng 50T/50P
  | 'cumulative'        // 50 câu tổng hợp cả 6 chương
  | 'chapter_all'       // Toàn bộ câu hỏi của 1 chương
  | 'theory_only'       // 100% Lý thuyết
  | 'practice_only'     // 100% Bài tập tính toán
  | 'gap_targeting'     // Lấp lỗ hổng kiến thức (ưu tiên câu chưa làm)
  | 'retry_incorrect';  // Làm lại các câu từng làm sai

export interface ExamConfig {
  mode: ExamMode;
  chapterId?: string;       // 'all' hoặc 'ch1'..'ch6'
  fixtureId?: string;       // ID đề thi Moodle fixtures (e.g. 'moodle-ktmt-quiz', etc.)
  questionCount: number;
  timeLimitMinutes: number; // 0 = không giới hạn
  instantFeedback: boolean; // Hiện đáp án & giải thích ngay sau khi chọn
  title: string;
}

export interface ExamAnswerState {
  selectedIndex: number | null; // Cho single_choice
  selectedIndices?: number[];   // Cho multi_choice
  textAnswer?: string;          // Cho fill_in & essay
  matchingAnswers?: Record<string, string>; // Cho matching (subpartId -> selectedValue)
  isFlagged: boolean;
  timeSpentSeconds: number;
}

export interface ExamSession {
  id: string;
  title: string;
  config: ExamConfig;
  questions: Question[];
  answers: Record<string, ExamAnswerState>; // questionId -> answer state
  startTime: number;
  endTime?: number;
  isCompleted: boolean;
  score?: number;
  correctCount?: number;
}

export interface QuestionHistoryRecord {
  attempts: number;
  correctCount: number;
  lastAttemptTime: number;
  lastCorrect: boolean;
  isBookmarked?: boolean;
}

export type MainNavTab = 'dashboard' | 'chapters' | 'exam_modes' | 'bank' | 'coverage' | 'history';
