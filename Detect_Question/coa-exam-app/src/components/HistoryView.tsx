'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Table, Tag, Button, Statistic, Empty, Progress, Tooltip } from 'antd';
import {
  HistoryOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  RedoOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { ExamSession, Question } from '../types/quiz';
import { getTestHistory, resetAllData } from '../utils/quizStorage';
import Swal from 'sweetalert2';

interface HistoryViewProps {
  onReviewSession?: (session: ExamSession) => void;
  onRetakeExam?: (session: ExamSession) => void;
  onRetryIncorrect?: (incorrectQuestions: Question[]) => void;
  onStartNewExam?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onReviewSession,
  onRetakeExam,
  onRetryIncorrect,
  onStartNewExam,
}) => {
  const router = useRouter();
  const [history, setHistory] = useState<ExamSession[]>(() => getTestHistory());

  const totalExams = history.length;
  const avgScore = totalExams > 0 
    ? Number((history.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalExams).toFixed(1))
    : 0;
  const maxScore = totalExams > 0 
    ? Math.max(...history.map(h => h.score || 0))
    : 0;
  const totalQuestionsAnswered = history.reduce((acc, curr) => acc + (curr.questions?.length || 0), 0);

  const handleClearHistory = () => {
    localStorage.removeItem('coa_test_history_v1');
    setHistory([]);
  };

  const handleDeleteSession = (sessionId: string) => {
    const updated = history.filter(h => h.id !== sessionId);
    setHistory(updated);
    try {
      localStorage.setItem('coa_test_history_v1', JSON.stringify(updated));
    } catch (e) {}
  };

  const confirmClearHistory = () => {
    Swal.fire({
      title: 'Xóa toàn bộ lịch sử thi?',
      text: 'Toàn bộ kết quả các bài thi đã làm sẽ bị xóa vĩnh viễn khỏi thiết bị.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Đồng ý xóa toàn bộ',
      cancelButtonText: 'Hủy bỏ',
      reverseButtons: true,
      focusCancel: true,
    }).then((result) => {
      if (result.isConfirmed) {
        handleClearHistory();
        Swal.fire({
          title: 'Đã xóa!',
          text: 'Toàn bộ lịch sử làm bài đã được xóa sạch.',
          icon: 'success',
          confirmButtonColor: '#2563eb',
          timer: 1500,
          showConfirmButton: false,
        });
      }
    });
  };

  const confirmDeleteSession = (sessionId: string, sessionTitle: string) => {
    Swal.fire({
      title: 'Xóa bài thi này?',
      html: `Bạn có chắc chắn muốn xóa bài thi <b>${sessionTitle}</b> khỏi nhật ký?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Xóa bài thi',
      cancelButtonText: 'Hủy bỏ',
      reverseButtons: true,
      focusCancel: true,
    }).then((result) => {
      if (result.isConfirmed) {
        handleDeleteSession(sessionId);
        Swal.fire({
          title: 'Đã xóa!',
          text: 'Bài thi đã được xóa khỏi lịch sử.',
          icon: 'success',
          confirmButtonColor: '#2563eb',
          timer: 1200,
          showConfirmButton: false,
        });
      }
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 8.5) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 7.0) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 5.0) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: number, end?: number) => {
    if (!end) return 'Không rõ';
    const totalSecs = Math.max(1, Math.round((end - start) / 1000));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins === 0) return `${secs} giây`;
    return `${mins} phút ${secs > 0 ? secs + 's' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Stats */}
      <div className="bg-gradient-to-r from-slate-50 via-blue-50/40 to-indigo-50/30 border border-slate-200 rounded-2xl p-6 text-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 text-blue-700 text-xs font-semibold mb-3 border border-blue-200/80">
            <HistoryOutlined />
            Lịch sử luyện thi &amp; Tiến độ học tập
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 m-0">
            Nhật Ký Các Lần Làm Bài Thi
          </h1>
          <p className="text-slate-600 text-sm mt-1 m-0">
            Theo dõi sự tiến bộ, xem lại lời giải chi tiết cho từng câu hỏi, và làm lại các đề thi để củng cố điểm số.
          </p>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-3">
            <Button
              danger
              icon={<ClearOutlined />}
              onClick={confirmClearHistory}
              className="bg-white border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
            >
              Xóa lịch sử
            </Button>
          </div>
        )}
      </div>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <Statistic
            title={<span className="text-xs font-medium text-slate-500 uppercase">Tổng số đề đã làm</span>}
            value={totalExams}
            suffix={<span className="text-xs font-normal text-slate-400">đề</span>}
            prefix={<HistoryOutlined className="text-blue-500 mr-2" />}
            valueStyle={{ fontWeight: 700, color: '#1e293b' }}
          />
        </Card>

        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <Statistic
            title={<span className="text-xs font-medium text-slate-500 uppercase">Điểm trung bình</span>}
            value={avgScore}
            suffix={<span className="text-xs font-normal text-slate-400">/ 10</span>}
            prefix={<TrophyOutlined className="text-amber-500 mr-2" />}
            valueStyle={{ fontWeight: 700, color: '#1e293b' }}
          />
        </Card>

        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <Statistic
            title={<span className="text-xs font-medium text-slate-500 uppercase">Điểm cao nhất</span>}
            value={maxScore}
            suffix={<span className="text-xs font-normal text-slate-400">/ 10</span>}
            prefix={<TrophyOutlined className="text-emerald-500 mr-2" />}
            valueStyle={{ fontWeight: 700, color: '#059669' }}
          />
        </Card>

        <Card className="rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <Statistic
            title={<span className="text-xs font-medium text-slate-500 uppercase">Lượt câu đã giải</span>}
            value={totalQuestionsAnswered}
            suffix={<span className="text-xs font-normal text-slate-400">câu</span>}
            prefix={<CheckCircleOutlined className="text-indigo-500 mr-2" />}
            valueStyle={{ fontWeight: 700, color: '#1e293b' }}
          />
        </Card>
      </div>

      {/* History Items List */}
      {history.length === 0 ? (
        <Card className="rounded-2xl border border-slate-200 shadow-xs p-12 text-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-700">Chưa có bài thi nào được ghi nhận</p>
                <p className="text-sm text-slate-400">
                  Hãy chọn một chế độ thi hoặc làm bài ôn tập theo chương để bắt đầu lưu lịch sử học tập.
                </p>
              </div>
            }
          >
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={() => {
                if (onStartNewExam) onStartNewExam();
                else router.push('/exam-modes');
              }}
              className="mt-4 bg-blue-600 hover:bg-blue-700 font-medium"
            >
              Làm Đề Thi Thử Ngay
            </Button>
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">
              Danh sách đề thi ({history.length})
            </h3>
            <span className="text-xs text-slate-400">Lưu tối đa 50 bài thi gần nhất</span>
          </div>

          <div className="space-y-3">
            {history.map((session, idx) => {
              const totalQ = session.questions?.length || 0;
              const correctQ = session.correctCount ?? 0;
              const accuracy = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;
              const incorrectQuestions = session.questions.filter(
                q => session.answers[q.id]?.selectedIndex !== q.correctIndex
              );

              return (
                <Card
                  key={session.id || idx}
                  className="rounded-xl border border-slate-200/90 hover:border-blue-300 hover:shadow-md transition-all p-2"
                  styles={{ body: { padding: '16px 20px' } }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag color="blue" className="font-semibold text-xs rounded-md">
                          #{history.length - idx}
                        </Tag>
                        <h4 className="text-base font-bold text-slate-800 hover:text-blue-600 transition-colors">
                          {session.title || 'Bài thi trắc nghiệm COA'}
                        </h4>
                        <Tag color="default" className="text-xs text-slate-500 rounded-md">
                          {session.config?.mode === 'cumulative' && 'Tổng hợp 6 chương'}
                          {session.config?.mode === 'standard_50' && '50 câu chuẩn'}
                          {session.config?.mode === 'theory_only' && '100% Lý thuyết'}
                          {session.config?.mode === 'practice_only' && '100% Bài tập'}
                          {session.config?.mode === 'gap_targeting' && 'Lấp lỗ hổng'}
                          {session.config?.mode === 'retry_incorrect' && 'Ôn câu sai'}
                          {session.config?.mode === 'chapter_all' && 'Ôn theo chương'}
                        </Tag>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <ClockCircleOutlined />
                          {formatDate(session.startTime)}
                        </span>
                        <span>•</span>
                        <span>
                          Thời gian làm: <strong>{formatDuration(session.startTime, session.endTime)}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Số câu: <strong>{totalQ} câu</strong> ({correctQ} đúng, {totalQ - correctQ} sai)
                        </span>
                      </div>
                    </div>

                    {/* Middle: Score Badge & Accuracy */}
                    <div className="flex items-center gap-4 sm:gap-6 border-y lg:border-y-0 lg:border-x border-slate-100 py-3 lg:py-0 lg:px-6">
                      <div className="text-center">
                        <div className={`px-3 py-1.5 rounded-xl border text-xl font-extrabold ${getScoreColor(session.score || 0)}`}>
                          {(session.score ?? 0).toFixed(1)}
                          <span className="text-xs font-normal opacity-70"> / 10</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Điểm số</div>
                      </div>

                      <div className="text-center">
                        <div className="text-base font-bold text-slate-700">
                          {accuracy}%
                        </div>
                        <Progress
                          percent={accuracy}
                          size="small"
                          showInfo={false}
                          strokeColor="#2563eb"
                          className="w-16 my-0"
                        />
                        <div className="text-[11px] text-slate-400 mt-0.5">Độ chính xác</div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      <Tooltip title="Xem lại chi tiết từng câu hỏi & lời giải">
                        <Button
                          icon={<EyeOutlined />}
                          onClick={() => {
                            if (onReviewSession) onReviewSession(session);
                            else router.push(`/results?id=${session.id}`);
                          }}
                          className="border-blue-200 text-blue-600 hover:bg-blue-50"
                        >
                          Xem lại
                        </Button>
                      </Tooltip>

                      {incorrectQuestions.length > 0 && (
                        <Tooltip title={`Luyện tập riêng ${incorrectQuestions.length} câu làm sai trong đề này`}>
                          <Button
                            icon={<RedoOutlined />}
                            onClick={() => {
                              if (onRetryIncorrect) onRetryIncorrect(incorrectQuestions);
                              else router.push(`/exam?retryErrorsFrom=${session.id}`);
                            }}
                            className="border-amber-200 text-amber-600 hover:bg-amber-50"
                          >
                            Luyện câu sai ({incorrectQuestions.length})
                          </Button>
                        </Tooltip>
                      )}

                      <Tooltip title="Làm lại đề thi này">
                        <Button
                          icon={<ThunderboltOutlined />}
                          onClick={() => {
                            if (onRetakeExam) onRetakeExam(session);
                            else router.push(`/exam?retake=${session.id}`);
                          }}
                        >
                          Thi lại
                        </Button>
                      </Tooltip>

                      <Tooltip title="Xóa bài thi này">
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => confirmDeleteSession(session.id, session.title)}
                          className="hover:bg-rose-50 cursor-pointer"
                        />
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
