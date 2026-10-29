'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QuizResultView } from '../../components/QuizResultView';
import { AppLoading } from '../../components/AppLoading';
import { ExamSession } from '../../types/quiz';
import { getTestHistory } from '../../utils/quizStorage';

function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = searchParams.get('id');
    const history = getTestHistory();
    let found: ExamSession | undefined;

    if (id) {
      found = history.find(h => h.id === id);
    }
    if (!found && history.length > 0) {
      found = history[0];
    }

    if (found) {
      setSession(found);
      setLoading(false);
    } else {
      router.replace('/history');
    }
  }, [searchParams, router]);

  if (loading || !session) {
    return (
      <AppLoading
        fullPage
        tip="Đang tải bảng điểm chi tiết..."
        subtitle="Hệ thống đang trích xuất dữ liệu bài thi và thống kê hiệu suất..."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4">
        <QuizResultView
          session={session}
          onRetakeExam={() => router.push(`/exam?retake=${session.id}`)}
          onRetryIncorrect={(incorrectQuestions) => router.push(`/exam?retryErrorsFrom=${session.id}`)}
          onGoHome={() => router.push('/')}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 space-y-1">
          <p className="font-semibold text-slate-700 m-0">
            Bảng Điểm &amp; Lời Giải Chi Tiết Kỳ Thi Trắc Nghiệm Kiến Trúc Máy Tính
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <AppLoading
        fullPage
        tip="Đang tải kết quả thi..."
        subtitle="Đang chuẩn bị bảng xếp hạng và biểu đồ điểm số..."
      />
    }>
      <ResultsContent />
    </Suspense>
  );
}
