'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tag, Button } from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { ALL_CHAPTERS, ALL_QUESTIONS } from '../../../utils/examGenerator';
import { getQuestionStats } from '../../../utils/quizStorage';

interface ChapterDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ChapterDetailPage({ params }: ChapterDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const chapter = ALL_CHAPTERS.find(c => c.id === id) || ALL_CHAPTERS[0];
  const chapterQuestions = ALL_QUESTIONS.filter(q => q.chapterId === chapter.id);

  const theoryQuestions = chapterQuestions.filter(q => q.category === 'theory');
  const practiceQuestions = chapterQuestions.filter(q => q.category === 'practice');

  const stats = getQuestionStats();
  const answeredQuestions = chapterQuestions.filter(q => stats[q.id]?.attempts > 0);
  const correctQuestions = chapterQuestions.filter(q => stats[q.id]?.lastCorrect);

  const progressPercent = Math.round((answeredQuestions.length / chapterQuestions.length) * 100) || 0;
  const accuracyPercent = answeredQuestions.length > 0 
    ? Math.round((correctQuestions.length / answeredQuestions.length) * 100) 
    : 0;

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4 flex flex-col gap-4">
      {/* Thanh ngang: Thông tin chương bên trái, Nút Về Trang chủ bên phải */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 sm:px-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <Tag color="blue" className="font-bold text-xs uppercase px-2.5 py-0.5 m-0 shrink-0">
            Chương {chapter.number}
          </Tag>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight m-0">
            {chapter.title}
          </h1>
          <span className="text-slate-300 hidden md:inline">•</span>
          <span className="text-xs text-slate-500 font-medium hidden md:inline">
            {chapter.topics.length} Chuyên đề • {chapterQuestions.length} câu hỏi chuẩn hóa
          </span>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all text-xs font-semibold cursor-pointer select-none no-underline shadow-2xs shrink-0"
        >
          <ArrowLeftOutlined className="text-[11px]" />
          <span>Về Trang chủ</span>
        </Link>
      </div>

      {/* 3 Card Tiến độ, Tỷ lệ, Tổng câu hỏi nối vô nhau */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
        {/* Card 1: Tiến độ ôn tập */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Tiến độ ôn tập
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-blue-600 leading-none">
                {progressPercent}%
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {answeredQuestions.length}/{chapterQuestions.length} câu
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <BookOutlined className="text-base" />
          </div>
        </div>

        {/* Card 2: Tỷ lệ làm đúng */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Tỷ lệ làm đúng
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-emerald-600 leading-none">
                {accuracyPercent}%
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {correctQuestions.length} câu đúng
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircleOutlined className="text-base" />
          </div>
        </div>

        {/* Card 3: Tổng câu hỏi */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Tổng câu hỏi
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">
                {chapterQuestions.length}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                câu • {chapter.topics.length} chuyên đề
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
            <FileTextOutlined className="text-base" />
          </div>
        </div>
      </div>

      {/* Bảng Grid Table Các Chế Độ Luyện Tập */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-slate-50/90 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span className="font-bold text-slate-800 text-sm tracking-tight">
              Bảng Chế Độ Luyện Tập Cho Chương {chapter.number}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Chọn hình thức ôn tập phù hợp với mục tiêu của bạn
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="bg-slate-100/70 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4 border-r border-slate-200 w-[24%]">Chế độ</th>
                <th className="py-3 px-4 border-r border-slate-200 w-[34%]">Định hướng nội dung</th>
                <th className="py-3 px-4 border-r border-slate-200 w-[14%] text-center">Số lượng</th>
                <th className="py-3 px-4 border-r border-slate-200 w-[14%]">Hình thức</th>
                <th className="py-3 px-4 text-center w-[14%]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {/* Row 1: Toàn bộ câu hỏi */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold shrink-0">
                      <BookOutlined />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm whitespace-nowrap">Luyện toàn bộ</div>
                      <Tag color="blue" className="text-[10px] font-bold m-0 mt-0.5">TOÀN BỘ</Tag>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <p className="text-slate-600 text-xs leading-relaxed m-0">
                    Làm lần lượt tất cả {chapterQuestions.length} câu hỏi của chương kèm lời giải chi tiết song ngữ.
                  </p>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 text-center align-middle">
                  <span className="text-base font-extrabold text-blue-600">{chapterQuestions.length}</span>
                  <span className="text-xs text-slate-400 font-medium ml-1">câu</span>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <span className="text-xs text-slate-700 font-medium">Hiện giải thích ngay</span>
                  <div className="text-[11px] text-slate-400">Không giới hạn giờ</div>
                </td>
                <td className="py-3.5 px-4 text-center align-middle">
                  <Button
                    type="primary"
                    size="small"
                    icon={<BookOutlined />}
                    onClick={() => router.push(`/exam?mode=chapter_all&chapter=${chapter.id}&count=${chapterQuestions.length}&feedback=true`)}
                    className="bg-blue-600 hover:bg-blue-700 font-semibold cursor-pointer text-xs whitespace-nowrap"
                  >
                    Luyện ngay
                  </Button>
                </td>
              </tr>

              {/* Row 2: 100% Lý thuyết */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 font-bold shrink-0">
                      <BulbOutlined />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm whitespace-nowrap">Chỉ Lý thuyết</div>
                      <Tag color="purple" className="text-[10px] font-bold m-0 mt-0.5">LÝ THUYẾT</Tag>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <p className="text-slate-600 text-xs leading-relaxed m-0">
                    Chuyên sâu các định nghĩa, thanh ghi, kiến trúc và nguyên lý hoạt động vi xử lý &amp; bộ nhớ.
                  </p>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 text-center align-middle">
                  <span className="text-base font-extrabold text-purple-600">{theoryQuestions.length}</span>
                  <span className="text-xs text-slate-400 font-medium ml-1">câu</span>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <span className="text-xs text-slate-700 font-medium">Học thuộc nhanh</span>
                  <div className="text-[11px] text-slate-400">Hiện đáp án ngay</div>
                </td>
                <td className="py-3.5 px-4 text-center align-middle">
                  <Button
                    size="small"
                    icon={<BulbOutlined />}
                    onClick={() => router.push(`/exam?mode=theory_only&chapter=${chapter.id}&count=${theoryQuestions.length}&feedback=true`)}
                    className="hover:border-purple-600 hover:text-purple-600 font-semibold cursor-pointer text-xs whitespace-nowrap"
                  >
                    Luyện Lý thuyết
                  </Button>
                </td>
              </tr>

              {/* Row 3: 100% Bài tập tính toán */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold shrink-0">
                      <CalculatorOutlined />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm whitespace-nowrap">Chỉ Bài tập &amp; Trace</div>
                      <Tag color="green" className="text-[10px] font-bold m-0 mt-0.5">BÀI TẬP</Tag>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <p className="text-slate-600 text-xs leading-relaxed m-0">
                    Công thức tính thời gian CPU, Amdahl, chu kỳ xung, cache mapping, tính địa chỉ và trace tập lệnh.
                  </p>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 text-center align-middle">
                  <span className="text-base font-extrabold text-emerald-600">{practiceQuestions.length}</span>
                  <span className="text-xs text-slate-400 font-medium ml-1">câu</span>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <span className="text-xs text-slate-700 font-medium">Rèn luyện kỹ năng</span>
                  <div className="text-[11px] text-slate-400">Có giải từng bước</div>
                </td>
                <td className="py-3.5 px-4 text-center align-middle">
                  <Button
                    size="small"
                    icon={<CalculatorOutlined />}
                    onClick={() => router.push(`/exam?mode=practice_only&chapter=${chapter.id}&count=${practiceQuestions.length}&feedback=true`)}
                    className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold cursor-pointer text-xs whitespace-nowrap"
                  >
                    Luyện Bài tập
                  </Button>
                </td>
              </tr>

              {/* Row 4: Thi thử 50 câu */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 font-bold shrink-0">
                      <ThunderboltOutlined />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm whitespace-nowrap">Thi thử trắc nghiệm</div>
                      <Tag color="cyan" className="text-[10px] font-bold m-0 mt-0.5">THI THỬ</Tag>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <p className="text-slate-600 text-xs leading-relaxed m-0">
                    Mô phỏng bài kiểm tra trắc nghiệm chuẩn với đồng hồ đếm ngược 60 phút, chấm điểm sau khi nộp.
                  </p>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 text-center align-middle">
                  <span className="text-base font-extrabold text-cyan-700">{Math.min(50, chapterQuestions.length)}</span>
                  <span className="text-xs text-slate-400 font-medium ml-1">câu</span>
                </td>
                <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                  <span className="text-xs text-slate-700 font-medium">Đồng hồ 60 phút</span>
                  <div className="text-[11px] text-slate-400">Chấm điểm cuối giờ</div>
                </td>
                <td className="py-3.5 px-4 text-center align-middle">
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={() => router.push(`/exam?mode=standard_50&chapter=${chapter.id}&count=${Math.min(50, chapterQuestions.length)}&time=60&feedback=false`)}
                    className="border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold cursor-pointer text-xs whitespace-nowrap"
                  >
                    Thi thử có giờ
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bảng Grid Table Các Chuyên Đề */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-slate-50/90 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span className="font-bold text-slate-800 text-sm tracking-tight">
              Danh Sách Các Chuyên Đề Chính ({chapter.topics.length} chuyên đề)
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Luyện tập riêng rẽ từng phần kiến thức mục tiêu
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="bg-slate-100/70 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4 border-r border-slate-200 w-[10%] text-center">Mục</th>
                <th className="py-3 px-4 border-r border-slate-200 w-[38%]">Tên chuyên đề</th>
                <th className="py-3 px-4 border-r border-slate-200 w-[30%]">Nội dung trọng tâm</th>
                <th className="py-3 px-4 border-r border-slate-200 w-[10%] text-center">Số câu</th>
                <th className="py-3 px-4 text-center w-[12%]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {chapter.topics.map((t, idx) => {
                const topicQuestions = chapterQuestions.filter(q => q.topicId === t.id);
                return (
                  <tr key={t.id || idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 border-r border-slate-200 text-center align-middle">
                      <Tag color="default" className="text-xs font-bold rounded-md m-0">
                        {chapter.number}.{idx + 1}
                      </Tag>
                    </td>
                    <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                      <div className="font-bold text-slate-900 text-sm">{t.title}</div>
                    </td>
                    <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                      {t.subtopics && t.subtopics.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.subtopics.map((st, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Kiến thức tổng hợp mục này</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 border-r border-slate-200 text-center align-middle">
                      <span className="font-bold text-slate-800 text-sm">{topicQuestions.length}</span>
                      <span className="text-xs text-slate-400 ml-1">câu</span>
                    </td>
                    <td className="py-3.5 px-4 text-center align-middle">
                      <Button
                        type="primary"
                        size="small"
                        disabled={topicQuestions.length === 0}
                        onClick={() => router.push(`/exam?mode=chapter_all&chapter=${chapter.id}&count=${topicQuestions.length}&feedback=true`)}
                        className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Luyện ({topicQuestions.length})
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
