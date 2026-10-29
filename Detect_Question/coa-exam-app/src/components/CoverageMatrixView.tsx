'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Tag, Progress, Statistic, Tooltip } from 'antd';
import {
  AimOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Chapter, Question, ExamConfig } from '../types/quiz';
import { getQuestionStats } from '../utils/quizStorage';

interface CoverageMatrixViewProps {
  chapters: Chapter[];
  allQuestions: Question[];
  onStartExamWithConfig?: (config: ExamConfig) => void;
}

export const CoverageMatrixView: React.FC<CoverageMatrixViewProps> = ({
  chapters,
  allQuestions,
  onStartExamWithConfig,
}) => {
  const router = useRouter();
  const stats = getQuestionStats();

  const handleStartExam = (config: ExamConfig) => {
    if (onStartExamWithConfig) {
      onStartExamWithConfig(config);
    } else {
      router.push(`/exam?mode=${config.mode}&chapter=${config.chapterId || 'all'}&count=${config.questionCount}&time=${config.timeLimitMinutes}&feedback=${config.instantFeedback}`);
    }
  };

  // Thu thập tất cả 119 subtopics
  const allSubtopics = useMemo(() => {
    const list: Array<{
      chapterId: string;
      chapterNumber: number;
      chapterTitle: string;
      topicId: string;
      topicTitle: string;
      subtopicName: string;
      questionsCount: number;
      attemptedCount: number;
      correctCount: number;
      status: 'mastered' | 'needs_review' | 'untested';
    }> = [];

    for (const ch of chapters) {
      for (const t of ch.topics) {
        for (const st of t.subtopics || []) {
          // Tìm câu hỏi liên quan đến subtopic này
          const matched = allQuestions.filter(
            q => q.chapterId === ch.id && (q.subtopic.toLowerCase().includes(st.toLowerCase()) || q.topicId === t.id)
          );
          const attempted = matched.filter(q => (stats[q.id]?.attempts || 0) > 0);
          const correct = matched.filter(q => stats[q.id]?.lastCorrect);

          let status: 'mastered' | 'needs_review' | 'untested' = 'untested';
          if (attempted.length > 0) {
            const acc = (correct.length / attempted.length) * 100;
            status = acc >= 75 ? 'mastered' : 'needs_review';
          }

          list.push({
            chapterId: ch.id,
            chapterNumber: ch.number,
            chapterTitle: ch.title,
            topicId: t.id,
            topicTitle: t.title,
            subtopicName: st,
            questionsCount: matched.length,
            attemptedCount: attempted.length,
            correctCount: correct.length,
            status,
          });
        }
      }
    }
    return list;
  }, [chapters, allQuestions, stats]);

  const totalSubtopics = allSubtopics.length;
  const testedSubtopics = allSubtopics.filter(s => s.status !== 'untested').length;
  const masteredSubtopics = allSubtopics.filter(s => s.status === 'mastered').length;
  const needsReviewSubtopics = allSubtopics.filter(s => s.status === 'needs_review').length;

  const studyCoveragePct = Math.round((testedSubtopics / totalSubtopics) * 100) || 0;
  const masteryPct = Math.round((masteredSubtopics / totalSubtopics) * 100) || 0;

  return (
    <div className="py-2 space-y-6">
      {/* Header Banner */}
      <Card className="border border-slate-200 shadow-xs bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 w-full">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-xs font-bold uppercase">
              BẢNG MA TRẬN 119 TIỂU MỤC KIẾN THỨC
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Ma Trận Độ Phủ Kiến Thức &amp; Mức Độ Thành Thạo (Full Coverage Matrix)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Theo dõi chi tiết từng chuyên đề con của 6 chương. Nút <strong>Luyện lấp lỗ hổng</strong> tự động gom các phần bạn chưa làm hoặc hay làm sai thành 1 bài thi 25 câu.
            </p>
          </div>

          <Button
            type="primary"
            size="large"
            icon={<AimOutlined />}
            onClick={() => handleStartExam({
              mode: 'gap_targeting',
              title: 'Bài thi Lấp lỗ hổng kiến thức (25 câu • Ưu tiên tiểu mục chưa làm)',
              questionCount: 25,
              timeLimitMinutes: 30,
              instantFeedback: true,
            })}
            className="bg-emerald-600 hover:bg-emerald-700 font-bold shadow-xs shrink-0"
          >
            Luyện lấp lỗ hổng ngay (25 câu)
          </Button>
        </div>

        {/* 3 Metric Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-200">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">1. Độ phủ ngân hàng đề</div>
            <div className="text-2xl font-black text-blue-600 mt-0.5">100%</div>
            <p className="text-[11px] text-slate-500 m-0 mt-1">Đầy đủ 119/119 tiểu mục có câu hỏi chuẩn hoá</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">2. Độ phủ học tập (Đã làm thử)</div>
            <div className="text-2xl font-black text-indigo-600 mt-0.5">{studyCoveragePct}%</div>
            <p className="text-[11px] text-slate-500 m-0 mt-1">
              Đã làm {testedSubtopics}/{totalSubtopics} tiểu mục ({totalSubtopics - testedSubtopics} chưa thử)
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">3. Mức độ thành thạo (Mastery)</div>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">{masteryPct}%</div>
            <p className="text-[11px] text-slate-500 m-0 mt-1">
              {masteredSubtopics} thành thạo • {needsReviewSubtopics} cần ôn lại
            </p>
          </div>
        </div>
      </Card>

      {/* Chapters Sections */}
      <div className="space-y-6">
        {chapters.map(ch => {
          const chSubtopics = allSubtopics.filter(s => s.chapterId === ch.id);
          const chTested = chSubtopics.filter(s => s.status !== 'untested').length;
          const chMastered = chSubtopics.filter(s => s.status === 'mastered').length;
          const chPct = Math.round((chTested / chSubtopics.length) * 100) || 0;

          return (
            <Card key={ch.id} className="border border-slate-200 shadow-xs">
              {/* Chapter Title Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Tag color="blue" className="font-bold text-xs">Chương {ch.number}</Tag>
                    <h3 className="font-bold text-slate-900 text-base m-0">{ch.title}</h3>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Độ phủ: {chPct}% ({chTested}/{chSubtopics.length} tiểu mục) • Đạt thành thạo: {chMastered}/{chSubtopics.length}
                  </div>
                </div>

                <Button
                  size="small"
                  icon={<AimOutlined />}
                  onClick={() => handleStartExam({
                    mode: 'gap_targeting',
                    chapterId: ch.id,
                    title: `Chương ${ch.number}: Luyện lấp lỗ hổng kiến thức`,
                    questionCount: 20,
                    timeLimitMinutes: 0,
                    instantFeedback: true,
                  })}
                  className="font-medium text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  Luyện câu còn yếu Chương {ch.number}
                </Button>
              </div>

              {/* Subtopics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {chSubtopics.map((st, idx) => {
                  let badge = (
                    <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-sm">
                      Chưa làm
                    </span>
                  );
                  let cardStyle = 'border-slate-200 bg-slate-50/50';

                  if (st.status === 'mastered') {
                    badge = (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-sm flex items-center gap-1">
                        <CheckCircleOutlined /> Thành thạo
                      </span>
                    );
                    cardStyle = 'border-emerald-200 bg-emerald-50/30';
                  } else if (st.status === 'needs_review') {
                    badge = (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-sm flex items-center gap-1">
                        <ExclamationCircleOutlined /> Cần ôn lại
                      </span>
                    );
                    cardStyle = 'border-amber-200 bg-amber-50/30';
                  }

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${cardStyle}`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="font-bold text-xs text-slate-800 line-clamp-1">
                            {st.subtopicName}
                          </span>
                          {badge}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">
                          {st.topicTitle}
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{st.questionsCount} câu trong ngân hàng</span>
                        {st.attemptedCount > 0 && (
                          <span className="font-semibold text-slate-700">
                            Đúng {st.correctCount}/{st.attemptedCount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
