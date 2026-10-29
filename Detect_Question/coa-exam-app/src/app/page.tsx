'use client';

import React, { Suspense } from 'react';
import { DashboardView } from '../components/DashboardView';
import { AppLoading } from '../components/AppLoading';
import { ALL_QUESTIONS, ALL_CHAPTERS } from '../utils/examGenerator';

function DashboardContent() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4">
        <DashboardView
          chapters={ALL_CHAPTERS}
          allQuestions={ALL_QUESTIONS}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 space-y-0.5">
          <p className="font-semibold text-slate-700 m-0">
            Hệ Thống Ôn Thi Trắc Nghiệm Kiến Trúc Máy Tính &amp; Hợp Ngữ
          </p>
          <p className="text-slate-400 m-0 text-[11px]">
            Ngân hàng 370 câu hỏi chuẩn hóa bao phủ trọn vẹn 6 chương với lời giải chi tiết song ngữ.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <AppLoading
        fullPage
        tip="Đang tải trang tổng quan..."
        subtitle="Khởi tạo số liệu học tập và tổng hợp ngân hàng đề thi..."
      />
    }>
      <DashboardContent />
    </Suspense>
  );
}
