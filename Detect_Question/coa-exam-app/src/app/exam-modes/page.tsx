'use client';

import React, { Suspense } from 'react';
import { ExamModesView } from '../../components/ExamModesView';
import { AppLoading } from '../../components/AppLoading';
import { ALL_QUESTIONS, ALL_CHAPTERS } from '../../utils/examGenerator';

function ExamModesContent() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4">
        <ExamModesView
          chapters={ALL_CHAPTERS}
          allQuestions={ALL_QUESTIONS}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 space-y-1">
          <p className="font-semibold text-slate-700 m-0">
            Trung Tâm Chế Độ Thi Kiến Trúc Máy Tính — Đầy Đủ Dạng Câu Hỏi &amp; Thời Gian Tùy Biến
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function ExamModesPage() {
  return (
    <Suspense fallback={
      <AppLoading
        fullPage
        tip="Đang tải các chế độ thi..."
        subtitle="Khởi tạo 4 chế độ luyện thi và cấu hình tùy chỉnh..."
      />
    }>
      <ExamModesContent />
    </Suspense>
  );
}
