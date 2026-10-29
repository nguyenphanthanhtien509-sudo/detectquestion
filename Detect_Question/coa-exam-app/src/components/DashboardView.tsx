'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Progress, Tag, Tooltip } from 'antd';
import {
  ThunderboltOutlined,
  BookOutlined,
  FireOutlined,
  BulbOutlined,
  CalculatorOutlined,
  RightOutlined,
  SearchOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Chapter, Question, ExamConfig } from '../types/quiz';
import { getQuestionStats } from '../utils/quizStorage';
import { FIXTURE_EXAMS } from '../data/fixtureExams';

interface DashboardViewProps {
  chapters: Chapter[];
  allQuestions: Question[];
  onStartExamWithConfig?: (config: ExamConfig) => void;
  onSelectChapter?: (chapterId: string) => void;
  onNavigateTab?: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  chapters,
  allQuestions,
  onStartExamWithConfig,
  onSelectChapter,
}) => {
  const router = useRouter();
  const stats = getQuestionStats();

  const handleStartExam = (config: ExamConfig) => {
    if (onStartExamWithConfig) {
      onStartExamWithConfig(config);
    } else {
      const params = new URLSearchParams({
        mode: config.mode,
        chapter: config.chapterId || 'all',
        count: String(config.questionCount),
        time: String(config.timeLimitMinutes),
        feedback: String(config.instantFeedback),
      });
      if (config.fixtureId) {
        params.set('fixture', config.fixtureId);
      }
      if (config.title) {
        params.set('title', config.title);
      }
      router.push(`/exam?${params.toString()}`);
    }
  };

  const handleGoToChapter = (chapterId: string) => {
    if (onSelectChapter) {
      onSelectChapter(chapterId);
    } else {
      router.push(`/chapters/${chapterId}`);
    }
  };

  return (
    <div className="space-y-4 py-0">
      {/* Hero Banner: Tone sáng, trang nhã, dịu mắt, hoàn toàn không chói */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold mb-2 border border-slate-200">
          <FireOutlined className="text-amber-500" />
          <span>Ngân hàng 370 câu hỏi trắc nghiệm &amp; bài tập tính toán 6 chương</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mb-1.5">
          Hệ Thống Ôn Thi Trắc Nghiệm Kiến Trúc Máy Tính
        </h1>
        <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-3.5 max-w-3xl">
          Rèn luyện kiến thức 6 chương: thời gian CPU, Amdahl, tập lệnh x86, pipeline, phân cấp bộ nhớ, cache mapping, ngắt IVT &amp; DMA kèm lời giải chi tiết song ngữ Anh - Việt.
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => handleStartExam({
              mode: 'cumulative',
              title: 'Đề thi thử Cuối kỳ Tổng hợp (50 câu • 60 phút)',
              questionCount: 50,
              timeLimitMinutes: 60,
              instantFeedback: false,
            })}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold border-none shadow-xs cursor-pointer"
          >
            Vào thi thử 50 câu (Cuối kỳ)
          </Button>

          <Button
            icon={<FileTextOutlined className="text-blue-600" />}
            onClick={() => {
              const el = document.getElementById('fixtures-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold cursor-pointer"
          >
            9 Đề thi Moodle chính thức
          </Button>

          <Button
            icon={<BookOutlined />}
            onClick={() => {
              const el = document.getElementById('chapters-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold cursor-pointer"
          >
            Ôn theo từng chương
          </Button>

          <Button
            icon={<SearchOutlined />}
            onClick={() => router.push('/bank')}
            className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium cursor-pointer"
          >
            Ngân hàng 370 câu
          </Button>
        </div>
      </div>

      {/* 9 Bộ Đề Thi Moodle Chính Thức (Fixtures) */}
      <div id="fixtures-section" className="scroll-mt-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight m-0">
                9 Bộ Đề Thi Moodle Chính Thức
              </h2>
              <Tag color="blue" className="font-semibold text-xs m-0">Fixtures Thực Tế</Tag>
            </div>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              Đề thi trắc nghiệm giữa kỳ &amp; cuối kỳ thực tế từ hệ thống LMS Moodle (K15, CLC, Lớp chẵn 2017 - 2024)
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Tổng cộng 9 bộ đề • 370 câu hỏi
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {FIXTURE_EXAMS.map(exam => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between h-full"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-bold text-xs">
                      {exam.badge}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <ClockCircleOutlined className="text-slate-400" /> {exam.timeLimitMinutes} phút
                    </span>
                  </div>
                  <Tag color="cyan" className="m-0 font-medium text-xs">
                    {exam.questionCount} câu hỏi
                  </Tag>
                </div>

                <h3 className="font-bold text-sm sm:text-base text-slate-900 line-clamp-1 mb-1" title={exam.title}>
                  {exam.title}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-1 mb-2 font-medium">
                  {exam.subtitle}
                </p>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
                  {exam.description}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {exam.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleStartExam({
                    mode: 'cumulative',
                    fixtureId: exam.id,
                    title: `${exam.badge}: ${exam.title} (${exam.questionCount} câu • ${exam.timeLimitMinutes}p)`,
                    questionCount: exam.questionCount,
                    timeLimitMinutes: exam.timeLimitMinutes,
                    instantFeedback: false,
                  })}
                  className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold cursor-pointer flex-1"
                >
                  Vào thi tính giờ ({exam.questionCount} câu)
                </Button>

                <Tooltip title="Luyện tập có ngay đáp án & giải thích chi tiết">
                  <Button
                    size="small"
                    icon={<BulbOutlined className="text-amber-500" />}
                    onClick={() => handleStartExam({
                      mode: 'cumulative',
                      fixtureId: exam.id,
                      title: `[Luyện tập] ${exam.badge}: ${exam.title}`,
                      questionCount: exam.questionCount,
                      timeLimitMinutes: 0,
                      instantFeedback: true,
                    })}
                    className="cursor-pointer bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800 text-xs"
                  >
                    Luyện tập
                  </Button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6 Chương Kiến Thức Trọng Tâm */}
      <div id="chapters-section" className="scroll-mt-2">
        <div className="mb-2.5">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight m-0">6 Chương Kiến Thức Trọng Tâm</h2>
          <p className="text-xs text-slate-500 m-0">Nhấp vào từng chương để xem chi tiết chuyên đề hoặc chọn bài tập</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {chapters.map(ch => {
            const chQuestions = allQuestions.filter(q => q.chapterId === ch.id);
            const chAnswered = chQuestions.filter(q => stats[q.id]?.attempts > 0);
            const chPct = Math.round((chAnswered.length / chQuestions.length) * 100) || 0;

            const theoryCount = chQuestions.filter(q => q.category === 'theory').length;
            const practiceCount = chQuestions.filter(q => q.category === 'practice').length;

            return (
              <div
                key={ch.id}
                onClick={() => handleGoToChapter(ch.id)}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between h-full cursor-pointer select-none"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <Tag color="blue" className="font-bold text-xs cursor-pointer m-0">
                      Chương {ch.number}
                    </Tag>
                    <span className="text-xs text-slate-500 font-medium">
                      {chQuestions.length} câu hỏi
                    </span>
                  </div>

                  <h3 className="font-bold text-sm sm:text-base text-slate-900 hover:text-blue-600 cursor-pointer line-clamp-1 mb-1 transition-colors">
                    {ch.title}
                  </h3>

                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <BulbOutlined className="text-blue-500" /> {theoryCount} Lý thuyết
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <CalculatorOutlined className="text-emerald-500" /> {practiceCount} Bài tập
                    </span>
                  </div>

                  <div className="space-y-1 mb-2.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Tiến độ đã học</span>
                      <span className="font-semibold text-slate-700">{chPct}% ({chAnswered.length}/{chQuestions.length})</span>
                    </div>
                    <Progress percent={chPct} size="small" strokeColor="#2563eb" showInfo={false} />
                  </div>
                </div>

                <div
                  className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto"
                  onClick={e => e.stopPropagation()}
                >
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => handleStartExam({
                      mode: 'chapter_all',
                      chapterId: ch.id,
                      title: `Chương ${ch.number}: ${ch.title} (Toàn bộ ${chQuestions.length} câu)`,
                      questionCount: chQuestions.length,
                      timeLimitMinutes: Math.round(chQuestions.length * 1.2),
                      instantFeedback: true,
                    })}
                    className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold cursor-pointer"
                  >
                    Luyện toàn bộ ({chQuestions.length} câu)
                  </Button>

                  <div className="flex items-center gap-1">
                    <Tooltip title="Luyện bài tập tính toán">
                      <Button
                        size="small"
                        icon={<CalculatorOutlined />}
                        onClick={() => handleStartExam({
                          mode: 'practice_only',
                          chapterId: ch.id,
                          title: `Chương ${ch.number}: Luyện bài tập tính toán (${practiceCount} câu)`,
                          questionCount: practiceCount,
                          timeLimitMinutes: 0,
                          instantFeedback: true,
                        })}
                        className="cursor-pointer"
                      />
                    </Tooltip>
                    <Tooltip title="Xem chi tiết chuyên đề">
                      <Button
                        size="small"
                        icon={<RightOutlined />}
                        onClick={() => handleGoToChapter(ch.id)}
                        className="cursor-pointer"
                      />
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

