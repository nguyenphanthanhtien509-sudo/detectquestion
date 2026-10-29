'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Button, Radio, Select, Switch, Slider, Tag } from 'antd';
import {
  ThunderboltOutlined,
  BulbOutlined,
  CalculatorOutlined,
  AimOutlined,
  RedoOutlined,
  ClockCircleOutlined,
  BookOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { Chapter, Question, ExamConfig, ExamMode } from '../types/quiz';
import { getQuestionStats } from '../utils/quizStorage';

interface ExamModesViewProps {
  chapters: Chapter[];
  allQuestions: Question[];
  onStartExamWithConfig?: (config: ExamConfig) => void;
}

export const ExamModesView: React.FC<ExamModesViewProps> = ({
  chapters,
  allQuestions,
  onStartExamWithConfig,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryMode = (searchParams.get('mode') as ExamMode) || 'standard_50';

  const stats = getQuestionStats();
  const incorrectCount = Object.keys(stats).filter(id => stats[id].attempts > 0 && !stats[id].lastCorrect).length;

  // State cho bộ cấu hình tùy chỉnh
  const [selectedMode, setSelectedMode] = useState<ExamMode>(queryMode);
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [questionCount, setQuestionCount] = useState<number>(50);
  const [timeLimit, setTimeLimit] = useState<number>(60);
  const [instantFeedback, setInstantFeedback] = useState<boolean>(false);

  const handleStartExam = () => {
    let title = 'Bài thi Trắc nghiệm Kiến Trúc Máy Tính';
    if (selectedMode === 'standard_50') title = `Đề thi Chuẩn 50 câu (${selectedChapter === 'all' ? 'Tổng hợp' : 'Chương ' + selectedChapter.replace('ch', '')})`;
    else if (selectedMode === 'cumulative') title = 'Đề thi Thử Cuối Kỳ Tổng Hợp 6 Chương (50 câu)';
    else if (selectedMode === 'theory_only') title = 'Luyện tập Chuyên biệt 100% Lý thuyết';
    else if (selectedMode === 'practice_only') title = 'Luyện tập Chuyên biệt 100% Bài tập & Tính toán';
    else if (selectedMode === 'gap_targeting') title = 'Luyện tập Lấp lỗ hổng kiến thức (Ưu tiên câu chưa làm)';
    else if (selectedMode === 'retry_incorrect') title = 'Luyện lại toàn bộ câu hỏi từng làm sai';

    const config: ExamConfig = {
      mode: selectedMode,
      chapterId: selectedChapter,
      questionCount,
      timeLimitMinutes: timeLimit,
      instantFeedback,
      title,
    };

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
      if (config.title) params.set('title', config.title);
      router.push(`/exam?${params.toString()}`);
    }
  };

  return (
    <div className="py-2 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Trung Tâm Chế Độ Luyện Thi &amp; Kiểm Tra</h1>
        <p className="text-sm text-slate-500">Tùy biến cấu hình đề thi theo mục tiêu ôn tập của bạn</p>
      </div>

      {/* Preset Modes Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preset 1: Standard 50-Q */}
        <div
          onClick={() => {
            setSelectedMode('standard_50');
            setQuestionCount(50);
            setTimeLimit(60);
            setInstantFeedback(false);
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
            selectedMode === 'standard_50'
              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ThunderboltOutlined className="text-blue-600 text-base" /> Thi thử 50 câu chuẩn
            </span>
            <Tag color="blue" className="text-xs font-semibold m-0">50 câu • 60 phút</Tag>
          </div>
          <p className="text-xs text-slate-500 m-0 leading-relaxed">
            Mô phỏng đề thi chính thức với tỷ lệ cân bằng 50% lý thuyết và 50% bài tập tính toán.
          </p>
        </div>

        {/* Preset 2: Cumulative Final */}
        <div
          onClick={() => {
            setSelectedMode('cumulative');
            setSelectedChapter('all');
            setQuestionCount(50);
            setTimeLimit(60);
            setInstantFeedback(false);
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
            selectedMode === 'cumulative'
              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckCircleOutlined className="text-emerald-600 text-base" /> Đề tổng hợp Cuối kỳ (6 Chương)
            </span>
            <Tag color="green" className="text-xs font-semibold m-0">Đủ 6 Chương</Tag>
          </div>
          <p className="text-xs text-slate-500 m-0 leading-relaxed">
            Trộn câu hỏi của toàn bộ 6 chương theo đúng cấu trúc đề thi trắc nghiệm cuối kỳ chuẩn hóa.
          </p>
        </div>

        {/* Preset 3: Theory Only */}
        <div
          onClick={() => {
            setSelectedMode('theory_only');
            setQuestionCount(30);
            setTimeLimit(0);
            setInstantFeedback(true);
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
            selectedMode === 'theory_only'
              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <BulbOutlined className="text-purple-600 text-base" /> 100% Lý thuyết
            </span>
            <Tag color="purple" className="text-xs font-semibold m-0">Hiện đáp án ngay</Tag>
          </div>
          <p className="text-xs text-slate-500 m-0 leading-relaxed">
            Tập trung học thuộc định nghĩa, cấu trúc vi xử lý, nguyên lý bộ nhớ, không có số liệu tính toán.
          </p>
        </div>

        {/* Preset 4: Practical Only */}
        <div
          onClick={() => {
            setSelectedMode('practice_only');
            setQuestionCount(30);
            setTimeLimit(0);
            setInstantFeedback(true);
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
            selectedMode === 'practice_only'
              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CalculatorOutlined className="text-emerald-600 text-base" /> 100% Bài tập &amp; Trace mã máy
            </span>
            <Tag color="cyan" className="text-xs font-semibold m-0">Có bước giải</Tag>
          </div>
          <p className="text-xs text-slate-500 m-0 leading-relaxed">
            Chuyên giải bài tập: thời gian thực thi, Amdahl, Cache tag/set/offset, vector ngắt, mã x86 assembly.
          </p>
        </div>

        {/* Preset 5: Gap-Targeting */}
        <div
          onClick={() => {
            setSelectedMode('gap_targeting');
            setQuestionCount(25);
            setTimeLimit(0);
            setInstantFeedback(true);
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
            selectedMode === 'gap_targeting'
              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AimOutlined className="text-amber-500 text-base" /> Lấp lỗ hổng kiến thức
            </span>
            <Tag color="orange" className="text-xs font-semibold m-0">Thông minh</Tag>
          </div>
          <p className="text-xs text-slate-500 m-0 leading-relaxed">
            Tự động lọc những câu bạn chưa từng làm hoặc trả lời sai để luyện tập bù.
          </p>
        </div>

        {/* Preset 6: Retry Incorrect */}
        <div
          onClick={() => {
            if (incorrectCount > 0) {
              setSelectedMode('retry_incorrect');
              setQuestionCount(Math.min(incorrectCount, 50));
              setTimeLimit(0);
              setInstantFeedback(true);
            }
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
            incorrectCount === 0 ? 'opacity-60 cursor-not-allowed bg-slate-50' :
            selectedMode === 'retry_incorrect'
              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <RedoOutlined className="text-red-500 text-base" /> Luyện lại các câu làm sai
            </span>
            <Tag color={incorrectCount > 0 ? 'red' : 'default'} className="text-xs font-semibold m-0">
              {incorrectCount} câu sai
            </Tag>
          </div>
          <p className="text-xs text-slate-500 m-0 leading-relaxed">
            {incorrectCount > 0 ? `Làm lại ${incorrectCount} câu bạn đã từng trả lời sai trong các lần thi.` : 'Bạn chưa làm sai câu nào!'}
          </p>
        </div>
      </div>

      {/* Detailed Configuration Box */}
      <Card className="border border-slate-200 shadow-xs bg-white">
        <h3 className="font-bold text-base text-slate-900 mb-4 pb-2 border-b border-slate-100">
          Tùy Chỉnh Chi Tiết Đề Thi
        </h3>

        <div className="space-y-5">
          {/* Chapter Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Phạm vi Chương kiến thức:
            </label>
            <Select
              value={selectedChapter}
              onChange={val => setSelectedChapter(val)}
              className="w-full"
              size="large"
              options={[
                { value: 'all', label: 'Tất cả 6 Chương (Toàn bộ môn học)' },
                ...chapters.map(c => ({ value: c.id, label: `Chương ${c.number}: ${c.title}` }))
              ]}
            />
          </div>

          {/* Question Count */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Số lượng câu hỏi trong đề:
              </label>
              <span className="font-bold text-blue-600 text-sm">{questionCount} câu</span>
            </div>
            <div className="flex gap-2">
              {[10, 25, 45, 50].map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    questionCount === cnt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cnt} câu
                </button>
              ))}
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Thời gian làm bài:
              </label>
              <span className="font-bold text-blue-600 text-sm">
                {timeLimit === 0 ? 'Không giới hạn' : `${timeLimit} phút`}
              </span>
            </div>
            <div className="flex gap-2">
              {[
                { label: 'Không giới hạn', val: 0 },
                { label: '30 phút', val: 30 },
                { label: '60 phút (Chuẩn)', val: 60 },
                { label: '75 phút', val: 75 },
              ].map(item => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setTimeLimit(item.val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    timeLimit === item.val
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Instant Feedback Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <div className="font-bold text-xs text-slate-800">Hiển thị đáp án &amp; giải thích ngay sau khi chọn</div>
              <div className="text-[11px] text-slate-500">Phù hợp khi ôn tập từng câu; tắt đi khi muốn thi thử chấm điểm cuối bài</div>
            </div>
            <Switch checked={instantFeedback} onChange={val => setInstantFeedback(val)} />
          </div>

          {/* Start Button */}
          <Button
            type="primary"
            size="large"
            block
            icon={<ThunderboltOutlined />}
            onClick={handleStartExam}
            className="bg-blue-600 hover:bg-blue-700 font-bold h-12 text-base shadow-sm"
          >
            Bắt đầu bài thi ngay ({questionCount} câu • {timeLimit > 0 ? `${timeLimit} phút` : 'Không giới hạn'})
          </Button>
        </div>
      </Card>
    </div>
  );
};
