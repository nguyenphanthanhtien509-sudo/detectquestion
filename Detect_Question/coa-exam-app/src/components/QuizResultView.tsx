'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Progress, Tag, Statistic, Radio } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  RedoOutlined,
  HomeOutlined,
  TrophyOutlined,
  BulbOutlined,
  CalculatorOutlined,
  ClockCircleOutlined,
  FlagFilled,
  CodeOutlined,
  OrderedListOutlined,
  EditOutlined,
  BarChartOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import confetti from 'canvas-confetti';
import { ExamSession, Question } from '../types/quiz';
import { evaluateQuestionCorrectness, isQuestionAnswered } from './QuizActiveView';

interface QuizResultViewProps {
  session: ExamSession;
  onRetakeExam?: () => void;
  onRetryIncorrect?: (incorrectQuestions: Question[]) => void;
  onGoHome?: () => void;
}

export const QuizResultView: React.FC<QuizResultViewProps> = ({
  session,
  onRetakeExam,
  onRetryIncorrect,
  onGoHome,
}) => {
  const router = useRouter();
  const [filterMode, setFilterMode] = useState<'all' | 'incorrect' | 'correct' | 'flagged'>('all');

  const questions = session.questions;
  const total = questions.length;
  const correct = session.correctCount ?? 0;
  const score = session.score ?? Number(((correct / total) * 10).toFixed(2));
  const accuracyPct = Math.round((correct / total) * 100);

  // Tính thời gian làm bài
  const timeSpentMs = (session.endTime || Date.now()) - session.startTime;
  const minutesSpent = Math.max(1, Math.round(timeSpentMs / 60000));

  // Bắn pháo hoa nếu điểm >= 8.0
  useEffect(() => {
    if (score >= 8.0) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    }
  }, [score]);

  // Thống kê theo lý thuyết vs bài tập
  const theoryQuestions = questions.filter(q => q.category === 'theory');
  const theoryCorrect = theoryQuestions.filter(q => evaluateQuestionCorrectness(q, session.answers[q.id]).isCorrect).length;
  const theoryPct = theoryQuestions.length > 0 ? Math.round((theoryCorrect / theoryQuestions.length) * 100) : 0;

  const practiceQuestions = questions.filter(q => q.category === 'practice');
  const practiceCorrect = practiceQuestions.filter(q => evaluateQuestionCorrectness(q, session.answers[q.id]).isCorrect).length;
  const practicePct = practiceQuestions.length > 0 ? Math.round((practiceCorrect / practiceQuestions.length) * 100) : 0;

  // Lọc danh sách câu sai
  const incorrectQuestions = questions.filter(q => {
    const ans = session.answers[q.id];
    return !ans || !evaluateQuestionCorrectness(q, ans).isCorrect;
  });

  // Lọc câu theo tab
  const filteredQuestions = questions.filter(q => {
    const ans = session.answers[q.id];
    const isAnsCorrect = ans && evaluateQuestionCorrectness(q, ans).isCorrect;
    if (filterMode === 'incorrect') return !isAnsCorrect;
    if (filterMode === 'correct') return isAnsCorrect;
    if (filterMode === 'flagged') return ans?.isFlagged;
    return true;
  });

  // Xếp loại kết quả & nhận xét
  const getScoreTier = (s: number) => {
    if (s >= 8.5) {
      return {
        label: 'Xuất sắc',
        color: 'text-emerald-600',
        strokeColor: '#059669',
        tagColor: 'success' as const,
        message: 'Chúc mừng bạn! Kết quả rất xuất sắc, bạn đã nắm rất vững toàn bộ kiến thức môn học.',
      };
    }
    if (s >= 7.0) {
      return {
        label: 'Khá / Giỏi',
        color: 'text-blue-600',
        strokeColor: '#2563eb',
        tagColor: 'processing' as const,
        message: 'Kết quả tốt! Chỉ cần xem lại một vài câu sai là bạn hoàn toàn có thể đạt điểm tối đa.',
      };
    }
    if (s >= 5.0) {
      return {
        label: 'Đạt yêu cầu',
        color: 'text-amber-600',
        strokeColor: '#d97706',
        tagColor: 'warning' as const,
        message: 'Bạn đã đạt yêu cầu bài thi! Hãy rèn luyện thêm các câu hỏi tính toán và hợp ngữ còn sai nhé.',
      };
    }
    return {
      label: 'Cần cải thiện',
      color: 'text-red-500',
      strokeColor: '#dc2626',
      tagColor: 'error' as const,
      message: 'Điểm số chưa đạt kỳ vọng. Đừng nản lòng, hãy xem kỹ các giải thích chi tiết bên dưới và làm lại nhé!',
    };
  };

  const scoreTier = getScoreTier(score);

  const formatTags: Record<string, { label: string; color: string }> = {
    single_choice: { label: 'Trắc nghiệm đơn', color: 'blue' },
    multi_choice: { label: 'Chọn nhiều đáp án', color: 'purple' },
    fill_in: { label: 'Điền đáp án ngắn', color: 'cyan' },
    essay: { label: 'Tự luận / Hợp ngữ', color: 'geekblue' },
    matching: { label: 'Ghép nối đáp án', color: 'gold' },
  };

  return (
    <div className="py-2 space-y-5 w-full">
      {/* 2-Card Separated Dashboard Header */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: Điểm số, Xếp loại & Thao tác làm lại */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <TrophyOutlined /> Kết quả bài thi
              </span>
              <Tag color={scoreTier.tagColor} className="m-0 font-bold text-xs">
                {scoreTier.label}
              </Tag>
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug line-clamp-2 m-0">
              {session.title}
            </h1>
          </div>

          {/* Score Showcase with Circular Progress */}
          <div className="flex items-center justify-center sm:justify-start gap-4 py-3 px-4 bg-slate-50/80 rounded-xl border border-slate-100">
            <Progress
              type="circle"
              percent={accuracyPct}
              size={76}
              strokeWidth={8}
              strokeColor={scoreTier.strokeColor}
              format={() => (
                <span className="text-xs font-black text-slate-800">
                  {accuracyPct}%
                </span>
              )}
            />

            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Điểm số quy đổi
              </div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1">
                <span className={scoreTier.color}>{score}</span>
                <span className="text-sm font-semibold text-slate-400">/ 10</span>
              </div>
              <div className="text-xs font-semibold text-slate-600">
                Đúng <span className="text-emerald-600 font-bold">{correct}</span> / {total} câu
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onRetakeExam && (
              <Button
                type="primary"
                icon={<RedoOutlined />}
                onClick={onRetakeExam}
                className="bg-blue-600 hover:bg-blue-700 font-bold shadow-xs cursor-pointer flex-1 text-xs sm:text-sm"
              >
                Làm lại đề
              </Button>
            )}

            {incorrectQuestions.length > 0 && onRetryIncorrect && (
              <Button
                icon={<RedoOutlined />}
                onClick={() => onRetryIncorrect(incorrectQuestions)}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold border-none shadow-xs cursor-pointer flex-1 text-xs sm:text-sm"
              >
                Luyện {incorrectQuestions.length} câu sai
              </Button>
            )}

            {onGoHome && (
              <Button
                icon={<HomeOutlined />}
                onClick={onGoHome}
                className="cursor-pointer text-xs sm:text-sm"
              >
                Trang chủ
              </Button>
            )}
          </div>
        </div>

        {/* Card 2: Phân tích chi tiết hiệu suất & Thống kê */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              <BarChartOutlined className="text-blue-600" />
              <span>Phân Tích Chi Tiết Hiệu Suất</span>
            </div>
            <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              Tổng {total} câu hỏi
            </span>
          </div>

          {/* 4 Quick Stat Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[11px] font-medium text-slate-500">Độ chính xác</div>
              <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5">{accuracyPct}%</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[11px] font-medium text-slate-500">Thời gian làm</div>
              <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5">{minutesSpent} phút</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[11px] font-medium text-slate-500">Lý thuyết</div>
              <div className="text-base sm:text-lg font-black text-purple-700 mt-0.5">
                {theoryCorrect}/{theoryQuestions.length}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[11px] font-medium text-slate-500">Bài tập / Tính</div>
              <div className="text-base sm:text-lg font-black text-emerald-700 mt-0.5">
                {practiceCorrect}/{practiceQuestions.length}
              </div>
            </div>
          </div>

          {/* Dual Progress Bars for Theory & Practice */}
          <div className="space-y-2.5 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Phần Lý thuyết ({theoryQuestions.length} câu)</span>
                <span className="font-mono text-purple-700 font-bold">{theoryCorrect}/{theoryQuestions.length} ({theoryPct}%)</span>
              </div>
              <Progress percent={theoryPct} strokeColor="#9333ea" strokeWidth={6} showInfo={false} />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Phần Bài tập & Tính toán ({practiceQuestions.length} câu)</span>
                <span className="font-mono text-emerald-700 font-bold">{practiceCorrect}/{practiceQuestions.length} ({practicePct}%)</span>
              </div>
              <Progress percent={practicePct} strokeColor="#059669" strokeWidth={6} showInfo={false} />
            </div>
          </div>

          {/* Feedback message */}
          <div className="text-xs text-slate-600 bg-blue-50/70 p-2.5 rounded-lg border border-blue-100 flex items-start gap-2">
            <BulbOutlined className="text-blue-600 mt-0.5 shrink-0" />
            <div className="leading-relaxed">
              {scoreTier.message}
            </div>
          </div>
        </div>
      </div>

      {/* Question Details List & Review */}
      <div className="flex flex-col gap-5 sm:gap-6 pt-1">
        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
            <UnorderedListOutlined className="text-blue-600" />
            <span>Xem Lại Chi Tiết Từng Câu Hỏi</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200">
              {filteredQuestions.length}/{total} câu
            </span>
          </div>
          <Radio.Group
            value={filterMode}
            onChange={e => setFilterMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="all">Tất cả ({total})</Radio.Button>
            <Radio.Button value="incorrect">Chỉ câu sai ({incorrectQuestions.length})</Radio.Button>
            <Radio.Button value="correct">Chỉ câu đúng ({correct})</Radio.Button>
          </Radio.Group>
        </div>

        {/* Questions Detailed List with Generous Spacing */}
        <div className="flex flex-col gap-6 sm:gap-8">
          {filteredQuestions.map((q) => {
            const ans = session.answers[q.id];
            const evalResult = evaluateQuestionCorrectness(q, ans);
            const isUserCorrect = evalResult.isCorrect;
            const format = q.format || 'single_choice';
            const fTag = formatTags[format] || formatTags.single_choice;

            return (
              <Card
                key={q.id}
                className={`border shadow-sm rounded-2xl transition-all ${
                  isUserCorrect ? 'border-slate-200/90 bg-white' : 'border-red-200/90 bg-red-50/20'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      Câu {questions.indexOf(q) + 1}
                    </span>
                    <Tag color={fTag.color} className="font-medium text-xs m-0">
                      {fTag.label}
                    </Tag>
                    {isUserCorrect ? (
                      <Tag color="success" className="font-bold text-xs m-0">
                        ✓ Đúng (+{Number((10 / total).toFixed(2))} đ)
                      </Tag>
                    ) : (
                      <Tag color="error" className="font-bold text-xs m-0">
                        ✗ Chưa chính xác (0 đ)
                      </Tag>
                    )}
                    {q.grade && (
                      <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {q.grade}
                      </span>
                    )}
                  </div>

                  {ans?.isFlagged && (
                    <Tag color="warning" icon={<FlagFilled />} className="text-xs font-semibold m-0">
                      Đã đặt cờ
                    </Tag>
                  )}
                </div>

                {/* Question Text / HTML */}
                {q.questionHtml ? (
                  <div
                    className="text-slate-900 font-medium text-sm mb-3.5 leading-relaxed overflow-x-auto prose prose-slate max-w-none [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:font-mono [&_pre]:text-xs [&_pre]:my-2 [&_code]:text-blue-700 [&_code]:bg-blue-50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_table]:border [&_table]:border-slate-200 [&_table]:w-full [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:p-2 [&_th]:bg-slate-50"
                    dangerouslySetInnerHTML={{ __html: q.questionHtml }}
                  />
                ) : (
                  <div className="text-slate-900 font-medium text-sm mb-3.5 leading-relaxed whitespace-pre-line">
                    {q.question}
                  </div>
                )}

                {/* Format 1: single_choice Options Review */}
                {format === 'single_choice' && q.options && (
                  <div className="space-y-2 mb-3.5">
                    {q.options.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const isSelected = ans?.selectedIndex === oIdx;
                      const isTargetCorrect = oIdx === (q.correctIndex ?? 0);

                      let optCls = 'bg-slate-50 border-slate-200 text-slate-700';
                      if (isTargetCorrect) {
                        optCls = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold ring-1 ring-emerald-500';
                      } else if (isSelected && !isUserCorrect) {
                        optCls = 'bg-red-50 border-red-400 text-red-950 font-semibold ring-1 ring-red-400';
                      }

                      return (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded-lg border text-sm flex items-start gap-2.5 ${optCls}`}
                        >
                          <span className="w-5 h-5 rounded-md flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 bg-white border border-slate-300">
                            {letter}
                          </span>
                          <span className="flex-1 leading-snug">{opt}</span>
                          {isTargetCorrect && (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                              Đáp án đúng
                            </span>
                          )}
                          {isSelected && !isTargetCorrect && (
                            <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full shrink-0">
                              Bạn đã chọn
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Format 2: multi_choice Options Review */}
                {format === 'multi_choice' && q.options && (
                  <div className="space-y-2 mb-3.5">
                    {q.options.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const isSelected = (ans?.selectedIndices || []).includes(oIdx);
                      const isTargetCorrect = (q.correctIndices || (q.correctIndex !== undefined ? [q.correctIndex] : [0])).includes(oIdx);

                      let optCls = 'bg-slate-50 border-slate-200 text-slate-700';
                      if (isTargetCorrect) {
                        optCls = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold ring-1 ring-emerald-500';
                      } else if (isSelected && !isTargetCorrect) {
                        optCls = 'bg-red-50 border-red-400 text-red-950 font-semibold ring-1 ring-red-400';
                      }

                      return (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded-lg border text-sm flex items-start gap-2.5 ${optCls}`}
                        >
                          <span className="w-5 h-5 rounded-md flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 bg-white border border-slate-300">
                            {letter}
                          </span>
                          <span className="flex-1 leading-snug">{opt}</span>
                          {isTargetCorrect && (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                              Đáp án đúng
                            </span>
                          )}
                          {isSelected && !isTargetCorrect && (
                            <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full shrink-0">
                              Bạn đã chọn
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Format 3: fill_in Review */}
                {format === 'fill_in' && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-3.5 space-y-2">
                    <div className="text-xs text-slate-600">
                      <strong>Câu trả lời của bạn:</strong>{' '}
                      <code className="font-mono bg-white px-2 py-0.5 rounded border border-slate-300">
                        {ans?.textAnswer || '(Chưa điền)'}
                      </code>
                    </div>
                    {q.correctText && (
                      <div className="text-xs text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                        <strong>Đáp án tham khảo:</strong> <code className="font-mono font-bold">{q.correctText}</code>
                      </div>
                    )}
                  </div>
                )}

                {/* Format 4: essay Review */}
                {format === 'essay' && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-3.5 space-y-2">
                    <div className="text-xs text-slate-700 font-semibold mb-1">Đoạn mã / Câu trả lời bạn đã nhập:</div>
                    <pre className="p-2.5 rounded bg-white border border-slate-200 font-mono text-xs overflow-x-auto whitespace-pre-wrap m-0">
                      {ans?.textAnswer || '(Chưa nhập nội dung)'}
                    </pre>
                    {q.correctText && (
                      <div className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200 font-mono whitespace-pre-line mt-2">
                        <strong>Mã lệnh / Lời giải tham khảo:</strong><br />
                        {q.correctText}
                      </div>
                    )}
                  </div>
                )}

                {/* Format 5: matching Review */}
                {format === 'matching' && q.matchingSubparts && (
                  <div className="space-y-2 mb-3.5">
                    {q.matchingSubparts.map((subpart, sIdx) => {
                      const userVal = ans?.matchingAnswers?.[subpart.id] || '(Chưa chọn)';
                      const isSubCorrect = !subpart.correctValue || userVal === subpart.correctValue;

                      return (
                        <div
                          key={subpart.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-200 text-xs"
                        >
                          <div className="font-bold text-slate-900 font-mono shrink-0 min-w-[120px] sm:min-w-[140px]">
                            {sIdx + 1}. {subpart.label}
                          </div>
                          <div className="flex items-center gap-2 flex-1 w-full min-w-0 justify-between">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-slate-500 shrink-0">Đã chọn:</span>
                              <code className="font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-800 truncate flex-1">
                                {userVal}
                              </code>
                            </div>
                            {isSubCorrect ? (
                              <Tag color="success" className="m-0 text-[11px] shrink-0">✓ Khớp</Tag>
                            ) : (
                              <Tag color="error" className="m-0 text-[11px] shrink-0">✗ Chưa khớp</Tag>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explanations & Solutions */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  {q.formula && (
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <div className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                        <CalculatorOutlined className="text-emerald-600" /> Công thức áp dụng:
                      </div>
                      <code className="text-xs text-emerald-800 font-mono block overflow-x-auto whitespace-pre">
                        {q.formula}
                      </code>
                    </div>
                  )}

                  {q.stepByStep && (
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <div className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                        <CalculatorOutlined className="text-blue-600" /> Bước giải chi tiết (Step-by-step):
                      </div>
                      <pre className="text-xs text-slate-800 font-mono overflow-x-auto whitespace-pre-wrap m-0">
                        {q.stepByStep}
                      </pre>
                    </div>
                  )}

                  {q.explanationVi && (
                    <div>
                      <div className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <BulbOutlined className="text-amber-500" /> Lời giải &amp; Phân tích tiếng Việt:
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed m-0 whitespace-pre-line">
                        {q.explanationVi}
                      </p>
                    </div>
                  )}

                  {q.explanationEn && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="text-[11px] font-bold text-slate-500 mb-0.5">
                        English Reference:
                      </div>
                      <p className="text-xs text-slate-600 italic leading-relaxed m-0">
                        {q.explanationEn}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
