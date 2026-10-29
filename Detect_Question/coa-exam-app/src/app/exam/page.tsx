'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QuizActiveView } from '../../components/QuizActiveView';
import { AppLoading } from '../../components/AppLoading';
import { ExamSession, ExamMode, Question } from '../../types/quiz';
import {
  generateExamSession,
  ALL_QUESTIONS,
} from '../../utils/examGenerator';
import {
  getActiveSession,
  saveActiveSession,
  saveCompletedSession,
  getTestHistory,
} from '../../utils/quizStorage';

function ExamRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const retakeId = searchParams.get('retake');
    const retryErrorsFromId = searchParams.get('retryErrorsFrom');
    const mode = searchParams.get('mode') as ExamMode | null;
    const chapterId = searchParams.get('chapter') || 'all';
    const countParam = searchParams.get('count');
    const timeParam = searchParams.get('time');
    const feedbackParam = searchParams.get('feedback');
    const customTitle = searchParams.get('title');
    const fixtureId = searchParams.get('fixture');

    // Case 1: Làm lại từ một phiên đã có trong lịch sử
    if (retakeId) {
      const history = getTestHistory();
      const past = history.find(h => h.id === retakeId);
      if (past) {
        const fresh = generateExamSession({
          ...past.config,
          title: `${past.title} (Làm lại)`,
        });
        fresh.questions = [...past.questions];
        const initialAnswers: ExamSession['answers'] = {};
        for (const q of fresh.questions) {
          initialAnswers[q.id] = { selectedIndex: null, isFlagged: false, timeSpentSeconds: 0 };
        }
        fresh.answers = initialAnswers;
        saveActiveSession(fresh);
        setSession(fresh);
        setLoading(false);
        return;
      }
    }

    // Case 2: Luyện lại các câu sai của một bài thi
    if (retryErrorsFromId) {
      const history = getTestHistory();
      const past = history.find(h => h.id === retryErrorsFromId);
      if (past) {
        const incorrectQuestions = past.questions.filter(
          q => past.answers[q.id]?.selectedIndex !== q.correctIndex
        );
        if (incorrectQuestions.length > 0) {
          const initialAnswers: ExamSession['answers'] = {};
          for (const q of incorrectQuestions) {
            initialAnswers[q.id] = { selectedIndex: null, isFlagged: false, timeSpentSeconds: 0 };
          }
          const fresh: ExamSession = {
            id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            title: `Luyện tập khắc phục ${incorrectQuestions.length} câu làm sai (${past.title})`,
            config: {
              mode: 'retry_incorrect',
              questionCount: incorrectQuestions.length,
              timeLimitMinutes: Math.max(5, Math.round(incorrectQuestions.length * 1.5)),
              instantFeedback: true,
              title: `Luyện tập ${incorrectQuestions.length} câu làm sai`,
            },
            questions: incorrectQuestions,
            answers: initialAnswers,
            startTime: Date.now(),
            isCompleted: false,
          };
          saveActiveSession(fresh);
          setSession(fresh);
          setLoading(false);
          return;
        }
      }
    }

    // Case 3: Bắt đầu bài thi mới theo URL query params
    if (mode) {
      let title = customTitle || 'Bài thi Trắc nghiệm COA';
      if (!customTitle) {
        if (mode === 'cumulative') title = 'Đề thi Thử Cuối Kỳ Chuẩn (50 câu • 6 chương)';
        else if (mode === 'standard_50') title = `Đề thi Chuẩn 50 câu (${chapterId === 'all' ? 'Tổng hợp' : 'Chương ' + chapterId.replace('ch', '')})`;
        else if (mode === 'theory_only') title = 'Luyện tập Chuyên biệt 100% Lý thuyết';
        else if (mode === 'practice_only') title = 'Luyện tập Chuyên biệt 100% Bài tập & Tính toán';
        else if (mode === 'gap_targeting') title = 'Luyện tập Lấp lỗ hổng kiến thức (Ưu tiên câu chưa làm)';
        else if (mode === 'retry_incorrect') title = 'Luyện lại toàn bộ câu hỏi từng làm sai';
        else if (mode === 'chapter_all') title = `Luyện toàn bộ câu hỏi Chương ${chapterId.replace('ch', '')}`;
      }

      const newSession = generateExamSession({
        mode,
        chapterId,
        fixtureId: fixtureId || undefined,
        questionCount: countParam ? parseInt(countParam, 10) : 50,
        timeLimitMinutes: timeParam !== null ? parseInt(timeParam, 10) : 60,
        instantFeedback: feedbackParam === 'true',
        title,
      });

      saveActiveSession(newSession);
      setSession(newSession);
      setLoading(false);
      return;
    }

    // Case 4: Tiếp tục active session đang dở trong localStorage
    const savedActive = getActiveSession();
    if (savedActive && !savedActive.isCompleted) {
      setSession(savedActive);
      setLoading(false);
      return;
    }

    // Nếu không có gì, điều hướng về trung tâm chế độ thi
    router.replace('/exam-modes');
  }, [searchParams, router]);

  const handleFinishExam = (finished: ExamSession) => {
    saveCompletedSession(finished);
    router.push(`/results?id=${finished.id}`);
  };

  const handleExitExam = () => {
    router.push('/');
  };

  if (loading || !session) {
    return (
      <AppLoading
        fullPage
        tip="Đang chuẩn bị đề thi..."
        subtitle="Hệ thống đang cấu hình các câu hỏi và bộ bấm giờ phòng thi..."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4">
        <QuizActiveView
          session={session}
          onFinishExam={handleFinishExam}
          onExitExam={handleExitExam}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 space-y-1">
          <p className="font-semibold text-slate-700 m-0">
            Hệ Thống Ôn Thi Trắc Nghiệm Kiến Trúc Máy Tính — Phòng Luyện Thi
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={
      <AppLoading
        fullPage
        tip="Đang nạp dữ liệu phòng thi..."
        subtitle="Chuẩn bị câu hỏi và thiết lập phiên làm bài..."
      />
    }>
      <ExamRunner />
    </Suspense>
  );
}
