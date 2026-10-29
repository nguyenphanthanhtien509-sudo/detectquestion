'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Tag, Tooltip, Switch, Input, Select, Checkbox } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  FlagOutlined,
  FlagFilled,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BulbOutlined,
  CalculatorOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  CheckOutlined,
  CodeOutlined,
  OrderedListOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { ExamSession, Question, ExamAnswerState } from '../types/quiz';
import { saveActiveSession, saveCompletedSession } from '../utils/quizStorage';
import Swal from 'sweetalert2';

interface QuizActiveViewProps {
  session: ExamSession;
  onFinishExam: (completedSession: ExamSession) => void;
  onExitExam: () => void;
}

export function isQuestionAnswered(q: Question, ans?: ExamAnswerState): boolean {
  if (!ans) return false;
  const format = q.format || 'single_choice';
  switch (format) {
    case 'single_choice':
      return ans.selectedIndex !== null && ans.selectedIndex !== undefined;
    case 'multi_choice':
      return Array.isArray(ans.selectedIndices) && ans.selectedIndices.length > 0;
    case 'fill_in':
    case 'essay':
      return typeof ans.textAnswer === 'string' && ans.textAnswer.trim().length > 0;
    case 'matching': {
      if (!q.matchingSubparts || q.matchingSubparts.length === 0) return false;
      const answeredKeys = Object.keys(ans.matchingAnswers || {}).filter(k => !!ans.matchingAnswers?.[k]);
      return answeredKeys.length > 0;
    }
    default:
      return ans.selectedIndex !== null && ans.selectedIndex !== undefined;
  }
}

export function evaluateQuestionCorrectness(q: Question, ans?: ExamAnswerState): { isCorrect: boolean; scorePct: number } {
  if (!ans) return { isCorrect: false, scorePct: 0 };
  const format = q.format || 'single_choice';
  switch (format) {
    case 'single_choice': {
      const isCorrect = ans.selectedIndex === (q.correctIndex ?? 0);
      return { isCorrect, scorePct: isCorrect ? 1 : 0 };
    }
    case 'multi_choice': {
      const userSel = [...(ans.selectedIndices || [])].sort();
      const target = [...(q.correctIndices || (q.correctIndex !== undefined ? [q.correctIndex] : [0]))].sort();
      if (userSel.length > 0 && JSON.stringify(userSel) === JSON.stringify(target)) {
        return { isCorrect: true, scorePct: 1 };
      }
      if (userSel.length > 0 && userSel.some(idx => target.includes(idx))) {
        return { isCorrect: false, scorePct: 0.5 };
      }
      return { isCorrect: false, scorePct: 0 };
    }
    case 'fill_in': {
      if (!ans.textAnswer || !ans.textAnswer.trim()) return { isCorrect: false, scorePct: 0 };
      const userText = ans.textAnswer.trim().toLowerCase().replace(/\s+/g, '');
      const targetText = (q.correctText || '').trim().toLowerCase().replace(/\s+/g, '');
      if (targetText && (userText === targetText || targetText.includes(userText))) {
        return { isCorrect: true, scorePct: 1 };
      }
      return { isCorrect: true, scorePct: 1 };
    }
    case 'essay': {
      if (!ans.textAnswer || !ans.textAnswer.trim()) return { isCorrect: false, scorePct: 0 };
      return { isCorrect: true, scorePct: 1 };
    }
    case 'matching': {
      const subparts = q.matchingSubparts || [];
      if (subparts.length === 0) return { isCorrect: false, scorePct: 0 };
      let correctSubs = 0;
      for (const sp of subparts) {
        if (ans.matchingAnswers?.[sp.id]) {
          if (!sp.correctValue || ans.matchingAnswers[sp.id] === sp.correctValue) {
            correctSubs++;
          }
        }
      }
      const scorePct = correctSubs / subparts.length;
      return { isCorrect: scorePct >= 0.75, scorePct };
    }
    default:
      return { isCorrect: ans.selectedIndex === q.correctIndex, scorePct: ans.selectedIndex === q.correctIndex ? 1 : 0 };
  }
}

export const QuizActiveView: React.FC<QuizActiveViewProps> = ({
  session,
  onFinishExam,
  onExitExam,
}) => {
  const [currentSession, setCurrentSession] = useState<ExamSession>(session);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [instantMode, setInstantMode] = useState(session.config.instantFeedback);
  const [scrollMode, setScrollMode] = useState(false); // false = 1 câu/trang, true = xem tất cả

  // Timer logic
  const [timeRemaining, setTimeRemaining] = useState<number>(
    session.config.timeLimitMinutes > 0 ? session.config.timeLimitMinutes * 60 : 0
  );
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  const questions = currentSession.questions;
  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;

  // Đếm ngược thời gian
  useEffect(() => {
    if (session.config.timeLimitMinutes <= 0 || isTimerPaused) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit(); // Tự động nộp bài khi hết giờ
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session.config.timeLimitMinutes, isTimerPaused]);

  // Lưu active session khi có thay đổi
  useEffect(() => {
    saveActiveSession(currentSession);
  }, [currentSession]);

  const handleSelectSingleOption = (qId: string, optIndex: number) => {
    setCurrentSession(prev => {
      const answers = { ...prev.answers };
      const curAns = answers[qId] || { selectedIndex: null, isFlagged: false, timeSpentSeconds: 0 };
      answers[qId] = { ...curAns, selectedIndex: optIndex };
      return { ...prev, answers };
    });
  };

  const handleToggleMultiOption = (qId: string, optIndex: number) => {
    setCurrentSession(prev => {
      const answers = { ...prev.answers };
      const curAns = answers[qId] || { selectedIndex: null, selectedIndices: [], isFlagged: false, timeSpentSeconds: 0 };
      const currentList = curAns.selectedIndices || [];
      const updatedList = currentList.includes(optIndex)
        ? currentList.filter(i => i !== optIndex)
        : [...currentList, optIndex].sort();
      answers[qId] = { ...curAns, selectedIndices: updatedList };
      return { ...prev, answers };
    });
  };

  const handleTextAnswerChange = (qId: string, text: string) => {
    setCurrentSession(prev => {
      const answers = { ...prev.answers };
      const curAns = answers[qId] || { selectedIndex: null, textAnswer: '', isFlagged: false, timeSpentSeconds: 0 };
      answers[qId] = { ...curAns, textAnswer: text };
      return { ...prev, answers };
    });
  };

  const handleMatchingAnswerChange = (qId: string, subpartId: string, value: string) => {
    setCurrentSession(prev => {
      const answers = { ...prev.answers };
      const curAns = answers[qId] || { selectedIndex: null, matchingAnswers: {}, isFlagged: false, timeSpentSeconds: 0 };
      const matchingAnswers = { ...(curAns.matchingAnswers || {}), [subpartId]: value };
      answers[qId] = { ...curAns, matchingAnswers };
      return { ...prev, answers };
    });
  };

  const handleToggleFlag = (qId: string) => {
    setCurrentSession(prev => {
      const answers = { ...prev.answers };
      const curAns = answers[qId] || { selectedIndex: null, isFlagged: false, timeSpentSeconds: 0 };
      answers[qId] = { ...curAns, isFlagged: !curAns.isFlagged };
      return { ...prev, answers };
    });
  };

  const handleFinalSubmit = () => {
    let totalScorePct = 0;
    for (const q of questions) {
      const result = evaluateQuestionCorrectness(q, currentSession.answers[q.id]);
      totalScorePct += result.scorePct;
    }

    const score = Number(((totalScorePct / totalQuestions) * 10).toFixed(2));
    const correctCount = Math.round(totalScorePct);

    const completed: ExamSession = {
      ...currentSession,
      isCompleted: true,
      endTime: Date.now(),
      score,
      correctCount,
    };

    saveCompletedSession(completed);
    onFinishExam(completed);
  };

  // Format thời gian MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Đếm số câu đã làm chính xác theo từng dạng
  const answeredCount = questions.filter(q => isQuestionAnswered(q, currentSession.answers[q.id])).length;

  const handleSubmitWithConfirm = () => {
    const unAnsweredCount = totalQuestions - answeredCount;
    const textMsg = unAnsweredCount > 0
      ? `Bạn đã làm ${answeredCount}/${totalQuestions} câu (còn ${unAnsweredCount} câu chưa trả lời). Bạn có chắc chắn muốn nộp bài để kết thúc?`
      : `Bạn đã hoàn thành toàn bộ ${totalQuestions}/${totalQuestions} câu hỏi. Bạn có chắc chắn muốn nộp bài để xem điểm số?`;

    Swal.fire({
      title: 'Xác nhận nộp bài thi?',
      text: textMsg,
      icon: unAnsweredCount > 0 ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Nộp bài ngay',
      cancelButtonText: 'Làm tiếp',
      reverseButtons: true,
      focusConfirm: true,
    }).then((result) => {
      if (result.isConfirmed) {
        handleFinalSubmit();
      }
    });
  };

  const handleExitWithConfirm = () => {
    Swal.fire({
      title: 'Thoát khỏi bài thi?',
      text: 'Tiến độ làm bài chưa nộp sẽ không được lưu điểm. Bạn có chắc muốn thoát ra?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Thoát ra',
      cancelButtonText: 'Làm tiếp',
      reverseButtons: true,
      focusCancel: true,
    }).then((result) => {
      if (result.isConfirmed) {
        onExitExam();
      }
    });
  };

  return (
    <div className="py-1 space-y-3">
      {/* Top Floating Control Bar */}
      <div className="sticky top-2 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 mb-3">
        {/* Left: Info */}
        <div>
          <div className="font-bold text-slate-900 text-sm line-clamp-1">{session.title}</div>
          <div className="text-xs text-slate-500">
            Đã làm: <strong className="text-blue-600 font-bold">{answeredCount}</strong> / {totalQuestions} câu hỏi
          </div>
        </div>

        {/* Center: Timer */}
        {session.config.timeLimitMinutes > 0 && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <ClockCircleOutlined className={timeRemaining < 300 ? 'text-red-500 animate-pulse' : 'text-blue-600'} />
            <span className={`font-mono text-base ${timeRemaining < 300 ? 'text-red-600 font-bold' : 'text-slate-800'}`}>
              {formatTime(timeRemaining)}
            </span>
            <Button
              type="text"
              size="small"
              icon={isTimerPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              onClick={() => setIsTimerPaused(!isTimerPaused)}
              className="text-xs text-slate-500 cursor-pointer"
            />
          </div>
        )}

        {/* Right: Mode switches & Submit button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-200 cursor-pointer">
            <span>Hiện giải thích:</span>
            <Switch
              size="small"
              checked={instantMode}
              onChange={val => setInstantMode(val)}
              className="cursor-pointer"
            />
          </div>

          <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setScrollMode(false)}
              className={`px-2 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                !scrollMode ? 'bg-white shadow-xs text-blue-600 font-bold' : 'text-slate-600'
              }`}
            >
              1 Câu
            </button>
            <button
              type="button"
              onClick={() => setScrollMode(true)}
              className={`px-2 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
                scrollMode ? 'bg-white shadow-xs text-blue-600 font-bold' : 'text-slate-600'
              }`}
            >
              Tất cả
            </button>
          </div>

          <Button
            type="primary"
            onClick={handleSubmitWithConfirm}
            className="bg-blue-600 font-bold shadow-xs cursor-pointer"
          >
            Nộp bài
          </Button>
        </div>
      </div>

      {/* Main Layout: Question Content + Sidebar Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {/* Question Area (3 Cols) */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {!scrollMode ? (
            /* Single Question Mode */
            <QuestionCard
              question={currentQ}
              qIndex={currentIndex}
              totalCount={totalQuestions}
              answerState={currentSession.answers[currentQ.id]}
              instantMode={instantMode}
              onSelectSingleOption={optIdx => handleSelectSingleOption(currentQ.id, optIdx)}
              onToggleMultiOption={optIdx => handleToggleMultiOption(currentQ.id, optIdx)}
              onTextAnswerChange={text => handleTextAnswerChange(currentQ.id, text)}
              onMatchingAnswerChange={(subId, val) => handleMatchingAnswerChange(currentQ.id, subId, val)}
              onToggleFlag={() => handleToggleFlag(currentQ.id)}
            />
          ) : (
            /* Scroll All Questions Mode */
            questions.map((q, idx) => (
              <QuestionCard
                key={q.id}
                question={q}
                qIndex={idx}
                totalCount={totalQuestions}
                answerState={currentSession.answers[q.id]}
                instantMode={instantMode}
                onSelectSingleOption={optIdx => handleSelectSingleOption(q.id, optIdx)}
                onToggleMultiOption={optIdx => handleToggleMultiOption(q.id, optIdx)}
                onTextAnswerChange={text => handleTextAnswerChange(q.id, text)}
                onMatchingAnswerChange={(subId, val) => handleMatchingAnswerChange(q.id, subId, val)}
                onToggleFlag={() => handleToggleFlag(q.id)}
              />
            ))
          )}

          {/* Navigation Bottom Bar (for Single Mode) */}
          {!scrollMode && (
            <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs mt-1">
              <Button
                disabled={currentIndex === 0}
                icon={<LeftOutlined />}
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                className="cursor-pointer"
              >
                Câu trước
              </Button>

              <span className="text-xs text-slate-500 font-medium">
                Câu {currentIndex + 1} / {totalQuestions}
              </span>

              {currentIndex < totalQuestions - 1 ? (
                <Button
                  type="primary"
                  onClick={() => setCurrentIndex(prev => Math.min(totalQuestions - 1, prev + 1))}
                  className="bg-blue-600 font-semibold cursor-pointer"
                >
                  Câu tiếp theo <RightOutlined />
                </Button>
              ) : (
                <Button
                  type="primary"
                  onClick={handleSubmitWithConfirm}
                  className="bg-emerald-600 font-bold cursor-pointer"
                >
                  Nộp bài thi <CheckOutlined />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: Question Matrix (1 Col) */}
        <div className="lg:col-span-1 sticky top-36 space-y-3">
          <Card className="border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold text-sm text-slate-900 m-0">Danh sách câu hỏi</h3>
              <span className="text-xs text-slate-500">{answeredCount}/{totalQuestions} đã làm</span>
            </div>

            {/* Quick Status Legend */}
            <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2.5 pb-2 border-b border-slate-100">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Đã làm
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-300" /> Chưa làm
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Đặt cờ
              </span>
            </div>

            {/* Question Buttons Grid */}
            <div className="grid grid-cols-5 gap-1.5 max-h-[58vh] overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const ans = currentSession.answers[q.id];
                const isCurrent = idx === currentIndex && !scrollMode;
                const isAnswered = isQuestionAnswered(q, ans);
                const isFlagged = ans && ans.isFlagged;

                let btnClass = '';
                if (isCurrent) {
                  if (isFlagged) {
                    btnClass = 'bg-amber-50 border-2 border-amber-500 text-amber-900 font-bold';
                  } else if (isAnswered) {
                    btnClass = 'bg-blue-50 border-2 border-blue-600 text-blue-700 font-bold';
                  } else {
                    btnClass = 'bg-white border-2 border-blue-600 text-blue-600 font-bold';
                  }
                } else if (isFlagged) {
                  btnClass = 'bg-amber-50 border border-amber-400 text-amber-800 font-semibold hover:border-amber-500';
                } else if (isAnswered) {
                  btnClass = 'bg-blue-50 border border-blue-300 text-blue-700 font-semibold hover:border-blue-400';
                } else {
                  btnClass = 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      if (scrollMode) {
                        const el = document.getElementById(`q-card-${q.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className={`h-8 rounded-md text-xs transition-all flex items-center justify-center relative cursor-pointer ${btnClass}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Final Submit & Exit in Sidebar */}
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-col gap-2">
              <Button
                type="primary"
                block
                onClick={handleSubmitWithConfirm}
                className="bg-blue-600 font-semibold cursor-pointer"
              >
                Nộp bài thi ({answeredCount}/{totalQuestions})
              </Button>

              <Button
                block
                onClick={handleExitWithConfirm}
                className="text-slate-600 hover:text-red-600 hover:border-red-300 font-medium text-xs cursor-pointer"
              >
                Thoát ra
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* Individual Question Card with Multi-Format Support */
interface QuestionCardProps {
  question: Question;
  qIndex: number;
  totalCount: number;
  answerState?: ExamAnswerState;
  instantMode: boolean;
  onSelectSingleOption: (idx: number) => void;
  onToggleMultiOption: (idx: number) => void;
  onTextAnswerChange: (text: string) => void;
  onMatchingAnswerChange: (subpartId: string, val: string) => void;
  onToggleFlag: () => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  qIndex,
  totalCount,
  answerState,
  instantMode,
  onSelectSingleOption,
  onToggleMultiOption,
  onTextAnswerChange,
  onMatchingAnswerChange,
  onToggleFlag,
}) => {
  const isFlagged = answerState?.isFlagged ?? false;
  const hasAnswered = isQuestionAnswered(question, answerState);
  const evalResult = evaluateQuestionCorrectness(question, answerState);
  const isCorrect = evalResult.isCorrect;

  const format = question.format || 'single_choice';

  const formatTags: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    single_choice: { label: 'Trắc nghiệm đơn', color: 'blue', icon: null },
    multi_choice: { label: 'Chọn nhiều đáp án', color: 'purple', icon: <OrderedListOutlined /> },
    fill_in: { label: 'Điền câu trả lời ngắn', color: 'cyan', icon: <EditOutlined /> },
    essay: { label: 'Tự luận / Hợp ngữ', color: 'geekblue', icon: <CodeOutlined /> },
    matching: { label: 'Ghép nối đáp án', color: 'gold', icon: null },
  };

  const currentTag = formatTags[format] || formatTags.single_choice;

  return (
    <Card id={`q-card-${question.id}`} className="border border-slate-200/90 shadow-sm rounded-2xl bg-white mb-6 sm:mb-8">
      {/* Question Header */}
      <div className="flex items-start justify-between gap-3 mb-3.5 pb-2.5 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-extrabold text-sm sm:text-base text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
            Câu {qIndex + 1}
          </span>
          <Tag color={currentTag.color} className="font-semibold text-xs flex items-center gap-1 m-0">
            {currentTag.icon} {currentTag.label}
          </Tag>
          {question.grade && (
            <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              {question.grade}
            </span>
          )}
          {question.difficulty && (
            <Tag color={question.difficulty === 'Easy' ? 'green' : question.difficulty === 'Medium' ? 'blue' : 'volcano'} className="font-medium text-xs m-0">
              {question.difficulty === 'Easy' ? 'Dễ' : question.difficulty === 'Medium' ? 'Trung bình' : 'Khó'}
            </Tag>
          )}
        </div>

        <Tooltip title={isFlagged ? 'Bỏ đặt cờ' : 'Đặt cờ câu này'}>
          <button
            type="button"
            onClick={onToggleFlag}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isFlagged ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {isFlagged ? <FlagFilled style={{ fontSize: 16 }} /> : <FlagOutlined style={{ fontSize: 16 }} />}
          </button>
        </Tooltip>
      </div>

      {/* Question Text / HTML */}
      {question.questionHtml ? (
        <div
          className="text-slate-900 text-sm sm:text-base font-medium leading-relaxed mb-4 overflow-x-auto prose prose-slate max-w-none [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:font-mono [&_pre]:text-xs [&_pre]:my-2.5 [&_code]:text-blue-700 [&_code]:bg-blue-50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_table]:border [&_table]:border-slate-200 [&_table]:w-full [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:p-2 [&_th]:bg-slate-50"
          dangerouslySetInnerHTML={{ __html: question.questionHtml }}
        />
      ) : (
        <div className="text-slate-900 text-sm sm:text-base font-medium leading-relaxed mb-4 whitespace-pre-line">
          {question.question}
        </div>
      )}

      {/* Prompt indicator */}
      {question.prompt && (
        <div className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
          <span>{question.prompt}</span>
        </div>
      )}

      {/* DẠNG 1: TRẮC NGHIỆM ĐƠN (single_choice) */}
      {format === 'single_choice' && question.options && (
        <div className="space-y-2 mb-4">
          {question.options.map((opt, optIdx) => {
            const letter = chrLetter(optIdx);
            const isSelected = answerState?.selectedIndex === optIdx;
            const isThisCorrect = optIdx === (question.correctIndex ?? 0);

            let optionStyle = 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/30 text-slate-800';

            if (instantMode && hasAnswered) {
              if (isThisCorrect) {
                optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-500';
              } else if (isSelected && !isCorrect) {
                optionStyle = 'border-red-400 bg-red-50 text-red-950 font-semibold ring-1 ring-red-400';
              } else {
                optionStyle = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-60';
              }
            } else if (isSelected) {
              optionStyle = 'border-blue-600 bg-blue-50/80 text-blue-950 font-semibold ring-1 ring-blue-600 shadow-xs';
            }

            return (
              <div
                key={optIdx}
                onClick={() => onSelectSingleOption(optIdx)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${optionStyle}`}
              >
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  {letter}
                </div>
                <div className="text-sm flex-1 leading-snug pt-0.5 font-medium">{opt}</div>

                {instantMode && hasAnswered && isThisCorrect && (
                  <CheckCircleOutlined className="text-emerald-600 text-base shrink-0 mt-1" />
                )}
                {instantMode && hasAnswered && isSelected && !isCorrect && (
                  <CloseCircleOutlined className="text-red-500 text-base shrink-0 mt-1" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DẠNG 2: CHỌN NHIỀU ĐÁP ÁN (multi_choice) */}
      {format === 'multi_choice' && question.options && (
        <div className="space-y-2 mb-4">
          {question.options.map((opt, optIdx) => {
            const letter = chrLetter(optIdx);
            const isSelected = (answerState?.selectedIndices || []).includes(optIdx);
            const isTargetCorrect = (question.correctIndices || (question.correctIndex !== undefined ? [question.correctIndex] : [0])).includes(optIdx);

            let optionStyle = 'border-slate-200 bg-white hover:border-purple-400 hover:bg-purple-50/30 text-slate-800';

            if (instantMode && hasAnswered) {
              if (isTargetCorrect) {
                optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-500';
              } else if (isSelected && !isTargetCorrect) {
                optionStyle = 'border-red-400 bg-red-50 text-red-950 font-semibold ring-1 ring-red-400';
              } else {
                optionStyle = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-60';
              }
            } else if (isSelected) {
              optionStyle = 'border-purple-600 bg-purple-50/80 text-purple-950 font-semibold ring-1 ring-purple-600 shadow-xs';
            }

            return (
              <div
                key={optIdx}
                onClick={() => onToggleMultiOption(optIdx)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${optionStyle}`}
              >
                <Checkbox
                  checked={isSelected}
                  className="mt-0.5 cursor-pointer"
                />
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 border ${
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  {letter}
                </div>
                <div className="text-sm flex-1 leading-snug pt-0.5 font-medium">{opt}</div>

                {instantMode && hasAnswered && isTargetCorrect && (
                  <CheckCircleOutlined className="text-emerald-600 text-base shrink-0 mt-1" />
                )}
                {instantMode && hasAnswered && isSelected && !isTargetCorrect && (
                  <CloseCircleOutlined className="text-red-500 text-base shrink-0 mt-1" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DẠNG 3: ĐIỀN ĐÁP ÁN NGẮN (fill_in) */}
      {format === 'fill_in' && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4">
          <label className="font-semibold text-xs text-slate-700 mb-2 block">
            {question.inputLabel || 'Answer / Đáp án:'}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              size="large"
              value={answerState?.textAnswer || ''}
              onChange={e => onTextAnswerChange(e.target.value)}
              placeholder={question.inputPlaceholder || 'Nhập kết quả (số, hex, chuỗi)...'}
              className="font-mono text-sm w-full bg-white border-slate-300"
            />
          </div>
          {instantMode && hasAnswered && question.correctText && (
            <div className="mt-2.5 text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
              <strong>Đáp án chuẩn tham khảo:</strong> <code className="font-mono font-bold">{question.correctText}</code>
            </div>
          )}
        </div>
      )}

      {/* DẠNG 4: TỰ LUẬN / HỢP NGỮ (essay) */}
      {format === 'essay' && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4">
          <label className="font-semibold text-xs text-slate-700 mb-2 block flex items-center gap-1.5">
            <CodeOutlined className="text-blue-600" />
            <span>{question.inputLabel || 'Mã lệnh hợp ngữ / Lời giải tự luận:'}</span>
          </label>
          <Input.TextArea
            rows={6}
            value={answerState?.textAnswer || ''}
            onChange={e => onTextAnswerChange(e.target.value)}
            placeholder={question.inputPlaceholder || 'Nhập đoạn mã lệnh hợp ngữ 8086 hoặc nội dung trả lời chi tiết...'}
            className="font-mono text-xs bg-white border-slate-300"
          />
          {instantMode && hasAnswered && question.correctText && (
            <div className="mt-2.5 text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200 whitespace-pre-line font-mono">
              <strong>Mã lệnh / Lời giải mẫu:</strong><br />
              {question.correctText}
            </div>
          )}
        </div>
      )}

      {/* DẠNG 5: GHÉP NỐI DROPDOWN (matching) */}
      {format === 'matching' && question.matchingSubparts && (
        <div className="space-y-2.5 mb-4">
          {question.matchingSubparts.map((subpart, sIdx) => {
            const currentVal = answerState?.matchingAnswers?.[subpart.id] || '';
            const isSubCorrect = instantMode && hasAnswered && (!subpart.correctValue || currentVal === subpart.correctValue);

            return (
              <div
                key={subpart.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center gap-2 shrink-0 min-w-[120px] sm:min-w-[140px] max-w-full sm:max-w-[40%]">
                  <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {sIdx + 1}
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-slate-800 font-mono break-words">
                    {subpart.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-1 w-full min-w-0">
                  <Select
                    className="w-full flex-1"
                    style={{ width: '100%' }}
                    size="large"
                    value={currentVal || undefined}
                    placeholder="-- Chọn đáp án tương ứng --"
                    onChange={val => onMatchingAnswerChange(subpart.id, val)}
                    options={subpart.options.map(o => ({
                      label: o.text,
                      value: o.value,
                    }))}
                  />
                  {instantMode && hasAnswered && (
                    isSubCorrect ? (
                      <CheckCircleOutlined className="text-emerald-600 text-lg shrink-0" />
                    ) : (
                      <CloseCircleOutlined className="text-red-500 text-lg shrink-0" />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Explanation Box (Instant Mode) */}
      {instantMode && hasAnswered && (
        <div className="mt-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 animate-fadeIn">
          <div className="flex items-center gap-2">
            {isCorrect ? (
              <Tag color="success" className="font-bold text-xs py-0.5 px-2 m-0">
                ✓ CHÍNH XÁC
              </Tag>
            ) : (
              <Tag color="error" className="font-bold text-xs py-0.5 px-2 m-0">
                ✗ CHƯA CHÍNH XÁC
              </Tag>
            )}
            <span className="text-xs text-slate-500">
              Phân tích chi tiết câu hỏi
            </span>
          </div>

          {/* Formula */}
          {question.formula && (
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <CalculatorOutlined className="text-emerald-600" /> Công thức áp dụng:
              </div>
              <code className="text-xs text-emerald-800 font-mono block overflow-x-auto whitespace-pre">
                {question.formula}
              </code>
            </div>
          )}

          {/* Vietnamese Explanation */}
          {question.explanationVi && (
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <BulbOutlined className="text-amber-500" /> Lời giải tiếng Việt:
              </div>
              <p className="text-xs text-slate-700 leading-relaxed m-0 whitespace-pre-line">
                {question.explanationVi}
              </p>
            </div>
          )}

          {/* English Explanation */}
          {question.explanationEn && (
            <div className="pt-2 border-t border-slate-200/60">
              <div className="text-[11px] font-bold text-slate-500 mb-0.5">
                English Reference:
              </div>
              <p className="text-xs text-slate-600 italic leading-relaxed m-0">
                {question.explanationEn}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

function chrLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}
