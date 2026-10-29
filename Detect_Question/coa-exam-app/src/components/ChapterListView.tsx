'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Button, Tabs, Tag, Progress, Collapse, Tooltip } from 'antd';
import {
  BookOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  CalculatorOutlined,
  AimOutlined,
  RedoOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { Chapter, Question, ExamConfig } from '../types/quiz';
import { getQuestionStats } from '../utils/quizStorage';

interface ChapterListViewProps {
  chapters: Chapter[];
  allQuestions: Question[];
  selectedChapterId?: string;
  onSelectChapterId?: (id: string) => void;
  onStartExamWithConfig?: (config: ExamConfig) => void;
}

export const ChapterListView: React.FC<ChapterListViewProps> = ({
  chapters,
  allQuestions,
  selectedChapterId: propSelectedChapterId,
  onSelectChapterId,
  onStartExamWithConfig,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryChapter = searchParams.get('chapter') || 'ch1';
  const effectiveChapterId = propSelectedChapterId || queryChapter;

  const stats = getQuestionStats();
  const currentChapter = chapters.find(c => c.id === effectiveChapterId) || chapters[0];
  const chapterQuestions = allQuestions.filter(q => q.chapterId === currentChapter.id);

  const theoryQuestions = chapterQuestions.filter(q => q.category === 'theory');
  const practiceQuestions = chapterQuestions.filter(q => q.category === 'practice');

  const answeredQuestions = chapterQuestions.filter(q => stats[q.id]?.attempts > 0);
  const correctQuestions = chapterQuestions.filter(q => stats[q.id]?.lastCorrect);
  const incorrectQuestions = chapterQuestions.filter(q => stats[q.id]?.attempts > 0 && !stats[q.id]?.lastCorrect);

  const progressPercent = Math.round((answeredQuestions.length / chapterQuestions.length) * 100) || 0;
  const accuracyPercent = answeredQuestions.length > 0 
    ? Math.round((correctQuestions.length / answeredQuestions.length) * 100) 
    : 0;

  const handleSelectChapter = (id: string) => {
    if (onSelectChapterId) {
      onSelectChapterId(id);
    } else {
      router.push(`/chapters?chapter=${id}`);
    }
  };

  const handleStartExam = (config: ExamConfig) => {
    if (onStartExamWithConfig) {
      onStartExamWithConfig(config);
    } else {
      router.push(`/exam?mode=${config.mode}&chapter=${config.chapterId || currentChapter.id}&count=${config.questionCount}&time=${config.timeLimitMinutes}&feedback=${config.instantFeedback}`);
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Chapter Selection Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {chapters.map(ch => {
          const isSelected = ch.id === currentChapter.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleSelectChapter(ch.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0 border ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>Chương {ch.number}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {allQuestions.filter(q => q.chapterId === ch.id).length} câu
              </span>
            </button>
          );
        })}
      </div>

      {/* Chapter Header Card */}
      <Card className="border border-slate-200 shadow-xs bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 w-full">
            <div className="flex items-center gap-2">
              <Tag color="blue" className="font-bold text-xs uppercase px-2.5 py-0.5">
                Chương {currentChapter.number}
              </Tag>
              <span className="text-xs text-slate-500">
                {currentChapter.topics.length} Chuyên đề chính • {chapterQuestions.length} câu hỏi chuẩn hóa
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {currentChapter.title}
            </h2>
            {currentChapter.subtitle && (
              <p className="text-sm text-slate-500">{currentChapter.subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div>
              <div className="text-xs text-slate-500 font-medium">Tiến độ ôn tập</div>
              <div className="text-xl font-extrabold text-blue-600">{progressPercent}%</div>
              <div className="text-[11px] text-slate-500">{answeredQuestions.length}/{chapterQuestions.length} câu</div>
            </div>
            <div className="w-px h-10 bg-slate-200" />
            <div>
              <div className="text-xs text-slate-500 font-medium">Tỷ lệ làm đúng</div>
              <div className="text-xl font-extrabold text-emerald-600">{accuracyPercent}%</div>
              <div className="text-[11px] text-slate-500">{correctQuestions.length} đúng • {incorrectQuestions.length} sai</div>
            </div>
          </div>
        </div>
      </Card>

      {/* 6 Exam Modes for this Chapter */}
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-3">Chọn Chế độ Luyện tập Chương {currentChapter.number}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Mode 1: Toàn bộ câu hỏi chương */}
          <Card hoverable className="border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Tag color="blue" className="font-bold">TOÀN DIỆN</Tag>
                <span className="text-xs font-semibold text-slate-500">{chapterQuestions.length} câu hỏi</span>
              </div>
              <h4 className="font-bold text-base text-slate-900 mb-1">Luyện toàn bộ Chương</h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Làm lần lượt tất cả {chapterQuestions.length} câu hỏi của Chương {currentChapter.number} theo đúng thứ tự bài giảng.
              </p>
            </div>
            <Button
              type="primary"
              block
              icon={<BookOutlined />}
              onClick={() => handleStartExam({
                mode: 'chapter_all',
                chapterId: currentChapter.id,
                title: `Chương ${currentChapter.number}: ${currentChapter.title} (Toàn bộ ${chapterQuestions.length} câu)`,
                questionCount: chapterQuestions.length,
                timeLimitMinutes: Math.round(chapterQuestions.length * 1.2),
                instantFeedback: true,
              })}
              className="bg-blue-600 font-semibold"
            >
              Bắt đầu luyện ({chapterQuestions.length} câu)
            </Button>
          </Card>

          {/* Mode 2: Thi 50 câu chuẩn */}
          <Card hoverable className="border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Tag color="cyan" className="font-bold">MÔ PHỎNG THI</Tag>
                <span className="text-xs font-semibold text-slate-500">50 câu • 60 phút</span>
              </div>
              <h4 className="font-bold text-base text-slate-900 mb-1">Thi thử 50 câu chuẩn</h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Cân bằng 25 câu lý thuyết &amp; 25 câu bài tập tính toán với đồng hồ đếm ngược 60 phút.
              </p>
            </div>
            <Button
              block
              icon={<ThunderboltOutlined />}
              onClick={() => handleStartExam({
                mode: 'standard_50',
                chapterId: currentChapter.id,
                title: `Chương ${currentChapter.number}: Đề thi chuẩn 50 câu (25 Lý thuyết / 25 Bài tập)`,
                questionCount: Math.min(50, chapterQuestions.length),
                timeLimitMinutes: 60,
                instantFeedback: false,
              })}
              className="border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold"
            >
              Thi thử có chấm điểm
            </Button>
          </Card>

          {/* Mode 3: 100% Lý thuyết */}
          <Card hoverable className="border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Tag color="purple" className="font-bold">CHUYÊN BIỆT</Tag>
                <span className="text-xs font-semibold text-slate-500">{theoryQuestions.length} câu</span>
              </div>
              <h4 className="font-bold text-base text-slate-900 mb-1">Chỉ luyện Lý thuyết</h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Tập trung nắm vững các khái niệm, kiến trúc, phân loại, định nghĩa không có số liệu tính toán.
              </p>
            </div>
            <Button
              block
              icon={<BulbOutlined />}
              onClick={() => handleStartExam({
                mode: 'theory_only',
                chapterId: currentChapter.id,
                title: `Chương ${currentChapter.number}: Luyện tập chuyên sâu 100% Lý thuyết (${theoryQuestions.length} câu)`,
                questionCount: theoryQuestions.length,
                timeLimitMinutes: 0,
                instantFeedback: true,
              })}
              className="hover:border-purple-600 hover:text-purple-600 font-semibold"
            >
              Luyện Lý thuyết ({theoryQuestions.length} câu)
            </Button>
          </Card>

          {/* Mode 4: 100% Bài tập tính toán */}
          <Card hoverable className="border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Tag color="green" className="font-bold">BÀI TẬP TÍNH TOÁN</Tag>
                <span className="text-xs font-semibold text-slate-500">{practiceQuestions.length} câu</span>
              </div>
              <h4 className="font-bold text-base text-slate-900 mb-1">Chỉ luyện Bài tập &amp; Trace</h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Bài toán công thức, tính toán thời gian CPU, địa chỉ bộ nhớ, chu kỳ xung nhịp, trace mã máy assembly.
              </p>
            </div>
            <Button
              block
              icon={<CalculatorOutlined />}
              onClick={() => handleStartExam({
                mode: 'practice_only',
                chapterId: currentChapter.id,
                title: `Chương ${currentChapter.number}: Luyện bài tập tính toán & thực hành (${practiceQuestions.length} câu)`,
                questionCount: practiceQuestions.length,
                timeLimitMinutes: 0,
                instantFeedback: true,
              })}
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold"
            >
              Luyện Bài tập ({practiceQuestions.length} câu)
            </Button>
          </Card>

          {/* Mode 5: Lấp lỗ hổng kiến thức */}
          <Card hoverable className="border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Tag color="orange" className="font-bold">THÔNG MINH</Tag>
                <span className="text-xs font-semibold text-slate-500">Ưu tiên câu chưa làm</span>
              </div>
              <h4 className="font-bold text-base text-slate-900 mb-1">Lấp lỗ hổng kiến thức</h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Hệ thống tự động phát hiện những câu bạn chưa làm hoặc hay làm sai để ưu tiên đưa vào bài test.
              </p>
            </div>
            <Button
              block
              icon={<AimOutlined />}
              onClick={() => handleStartExam({
                mode: 'gap_targeting',
                chapterId: currentChapter.id,
                title: `Chương ${currentChapter.number}: Ôn tập Lấp lỗ hổng kiến thức (25 câu)`,
                questionCount: Math.min(25, chapterQuestions.length),
                timeLimitMinutes: 0,
                instantFeedback: true,
              })}
              className="border-amber-500 text-amber-700 hover:bg-amber-50 font-semibold"
            >
              Luyện lấp lỗ hổng (25 câu)
            </Button>
          </Card>

          {/* Mode 6: Làm lại câu sai */}
          <Card hoverable className="border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Tag color={incorrectQuestions.length > 0 ? 'red' : 'default'} className="font-bold">
                  {incorrectQuestions.length > 0 ? `${incorrectQuestions.length} CÂU SAI` : 'SẠCH CÂU SAI'}
                </Tag>
                <span className="text-xs font-semibold text-slate-500">Khắc phục điểm yếu</span>
              </div>
              <h4 className="font-bold text-base text-slate-900 mb-1">Làm lại câu từng làm sai</h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                {incorrectQuestions.length > 0
                  ? `Bạn có ${incorrectQuestions.length} câu hỏi từng làm sai cần ôn lại cho đến khi nắm vững.`
                  : 'Hiện tại bạn chưa làm sai câu nào trong chương này!'}
              </p>
            </div>
            <Button
              block
              danger={incorrectQuestions.length > 0}
              disabled={incorrectQuestions.length === 0}
              icon={<RedoOutlined />}
              onClick={() => handleStartExam({
                mode: 'retry_incorrect',
                chapterId: currentChapter.id,
                title: `Chương ${currentChapter.number}: Luyện lại ${incorrectQuestions.length} câu hỏi từng làm sai`,
                questionCount: incorrectQuestions.length,
                timeLimitMinutes: 0,
                instantFeedback: true,
              })}
              className="font-semibold"
            >
              {incorrectQuestions.length > 0 ? `Làm lại ${incorrectQuestions.length} câu sai` : 'Không có câu sai'}
            </Button>
          </Card>
        </div>
      </div>

      {/* Topics Breakdown */}
      <Card className="border border-slate-200">
        <h3 className="text-base font-bold text-slate-900 mb-3">Danh sách {currentChapter.topics.length} Chuyên đề của Chương {currentChapter.number}</h3>
        <div className="space-y-3">
          {currentChapter.topics.map(t => {
            const topicQuestions = chapterQuestions.filter(q => q.topicId === t.id);
            return (
              <div key={t.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm">{t.title}</span>
                    <Tag className="text-xs font-normal">{topicQuestions.length} câu hỏi</Tag>
                  </div>
                  {t.subtopics && t.subtopics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {t.subtopics.map((st, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                          {st}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  size="small"
                  onClick={() => handleStartExam({
                    mode: 'chapter_all',
                    chapterId: currentChapter.id,
                    title: `${t.title} (${topicQuestions.length} câu)`,
                    questionCount: topicQuestions.length,
                    timeLimitMinutes: 0,
                    instantFeedback: true,
                  })}
                  className="shrink-0 text-xs font-medium"
                >
                  Luyện đề mục này
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
