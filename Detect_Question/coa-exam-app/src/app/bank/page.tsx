'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionBankView } from '../../components/QuestionBankView';
import { AppLoading } from '../../components/AppLoading';
import { ALL_QUESTIONS, ALL_CHAPTERS } from '../../utils/examGenerator';
import { Question, ExamSession } from '../../types/quiz';
import { saveActiveSession } from '../../utils/quizStorage';

function BankContent() {
  const router = useRouter();

  const handleStartCustomExam = (questions: Question[], title: string) => {
    if (questions.length === 0) return;
    const initialAnswers: ExamSession['answers'] = {};
    for (const q of questions) {
      initialAnswers[q.id] = {
        selectedIndex: null,
        isFlagged: false,
        timeSpentSeconds: 0,
      };
    }

    const session: ExamSession = {
      id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      config: {
        mode: 'retry_incorrect',
        questionCount: questions.length,
        timeLimitMinutes: Math.max(5, Math.round(questions.length * 1.5)),
        instantFeedback: true,
        title,
      },
      questions,
      answers: initialAnswers,
      startTime: Date.now(),
      isCompleted: false,
    };

    saveActiveSession(session);
    router.push('/exam');
  };

  return (
    <div className="flex-1 flex flex-col font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4">
        <QuestionBankView
          allQuestions={ALL_QUESTIONS}
          chapters={ALL_CHAPTERS}
          onStartCustomExam={handleStartCustomExam}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 space-y-1">
          <p className="font-semibold text-slate-700 m-0">
            Ngân Hàng 370 Câu Hỏi Trắc Nghiệm &amp; Bài Tập Kèm Lời Giải Song Ngữ
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={
      <AppLoading
        fullPage
        tip="Đang tải ngân hàng câu hỏi..."
        subtitle="Tổng hợp hơn 380 câu hỏi từ 9 đề thi chính thức kèm lời giải song ngữ..."
      />
    }>
      <BankContent />
    </Suspense>
  );
}
