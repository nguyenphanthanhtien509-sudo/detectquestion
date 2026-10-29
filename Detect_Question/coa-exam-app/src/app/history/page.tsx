'use client';

import React, { Suspense } from 'react';
import { HistoryView } from '../../components/HistoryView';
import { AppLoading } from '../../components/AppLoading';

function HistoryContent() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4">
        <HistoryView />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 space-y-1">
          <p className="font-semibold text-slate-700 m-0">
            Lịch Sử Luyện Thi &amp; Tiến Độ Học Tập — Lưu Trữ Tối Đa 50 Bài Thi
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={
      <AppLoading
        fullPage
        tip="Đang tải lịch sử thi..."
        subtitle="Tổng hợp dữ liệu kết quả và tiến độ học tập các bài thi đã làm..."
      />
    }>
      <HistoryContent />
    </Suspense>
  );
}
