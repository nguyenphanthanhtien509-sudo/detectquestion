'use client';

import React, { useState, useMemo } from 'react';
import { Card, Input, Select, Tag, Pagination, Button, Tooltip, Empty, Switch } from 'antd';
import {
  SearchOutlined,
  BulbOutlined,
  CalculatorOutlined,
  StarOutlined,
  StarFilled,
  FilterOutlined,
  BookOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { Question, Chapter } from '../types/quiz';
import { getQuestionStats, toggleQuestionBookmark } from '../utils/quizStorage';

interface QuestionBankViewProps {
  allQuestions: Question[];
  chapters: Chapter[];
  onStartCustomExam: (questions: Question[], title: string) => void;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  allQuestions,
  chapters,
  onStartCustomExam,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [showAllExplanations, setShowAllExplanations] = useState(true); // Mặc định hiển thị thẳng đáp án & giải thích
  const [individualToggles, setIndividualToggles] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [stats, setStats] = useState(getQuestionStats());

  const handleToggleBookmark = (id: string) => {
    toggleQuestionBookmark(id);
    setStats(getQuestionStats());
  };

  const handleToggleReveal = (id: string) => {
    setIndividualToggles(prev => {
      const currentVal = prev[id] !== undefined ? prev[id] : showAllExplanations;
      return { ...prev, [id]: !currentVal };
    });
  };

  // Lọc câu hỏi
  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(q => {
      if (selectedChapter !== 'all' && q.chapterId !== selectedChapter) return false;
      if (selectedCategory !== 'all' && q.category !== selectedCategory) return false;
      if (selectedDifficulty !== 'all' && q.difficulty !== selectedDifficulty) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inQuestion = q.question.toLowerCase().includes(query);
        const inSubtopic = q.subtopic.toLowerCase().includes(query);
        const inConcept = q.concept.toLowerCase().includes(query);
        const inFormula = (q.formula || '').toLowerCase().includes(query);
        if (!inQuestion && !inSubtopic && !inConcept && !inFormula) return false;
      }
      return true;
    });
  }, [allQuestions, selectedChapter, selectedCategory, selectedDifficulty, searchQuery]);

  // Phân trang
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuestions.slice(start, start + pageSize);
  }, [filteredQuestions, currentPage, pageSize]);

  return (
    <div className="py-2 flex flex-col gap-5">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Ngân hàng Đề &amp; Tra cứu 370 Câu hỏi COA
          </h1>
          <p className="text-sm text-slate-500">
            Tìm kiếm từ khóa, lọc theo chương, độ khó, dạng bài và xem trực tiếp lời giải chi tiết
          </p>
        </div>

        {filteredQuestions.length > 0 && (
          <Button
            type="primary"
            onClick={() => onStartCustomExam(
              filteredQuestions,
              `Luyện tập Bộ câu hỏi đã lọc (${filteredQuestions.length} câu)`
            )}
            className="bg-blue-600 font-semibold shadow-xs"
          >
            Luyện tập {filteredQuestions.length} câu này
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <Card className="border border-slate-200 shadow-xs mb-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Tìm kiếm nội dung, công thức..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            allowClear
          />

          <Select
            value={selectedChapter}
            onChange={val => {
              setSelectedChapter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'all', label: 'Tất cả 6 Chương' },
              ...chapters.map(c => ({ value: c.id, label: `Chương ${c.number}: ${c.title}` }))
            ]}
          />

          <Select
            value={selectedCategory}
            onChange={val => {
              setSelectedCategory(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'all', label: 'Tất cả phân loại' },
              { value: 'theory', label: 'Chỉ Lý thuyết' },
              { value: 'practice', label: 'Chỉ Bài tập tính toán / Trace' },
            ]}
          />

          <Select
            value={selectedDifficulty}
            onChange={val => {
              setSelectedDifficulty(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'all', label: 'Tất cả độ khó' },
              { value: 'Easy', label: 'Dễ' },
              { value: 'Medium', label: 'Trung bình' },
              { value: 'Hard', label: 'Khó' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-3 mt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Tìm thấy <strong className="text-blue-600">{filteredQuestions.length}</strong> câu hỏi phù hợp
            </span>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <span className="text-slate-600 font-medium">Hiện đáp án &amp; giải thích:</span>
              <Switch
                size="small"
                checked={showAllExplanations}
                onChange={val => {
                  setShowAllExplanations(val);
                  setIndividualToggles({});
                }}
                className="cursor-pointer"
              />
            </div>
          </div>
          {(searchQuery || selectedChapter !== 'all' || selectedCategory !== 'all' || selectedDifficulty !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedChapter('all');
                setSelectedCategory('all');
                setSelectedDifficulty('all');
                setCurrentPage(1);
              }}
              className="text-blue-600 hover:underline font-medium cursor-pointer"
            >
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      </Card>

      {/* Questions List */}
      {paginatedQuestions.length > 0 ? (
        <div className="flex flex-col gap-4">
          {paginatedQuestions.map((q, idx) => {
            const isRevealed = individualToggles[q.id] !== undefined ? individualToggles[q.id] : showAllExplanations;
            const isBookmarked = stats[q.id]?.isBookmarked;

            return (
              <Card key={q.id} className="border border-slate-200 shadow-xs hover:border-slate-300 transition-colors mb-3.5 last:mb-0">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                      #{q.id}
                    </span>
                    <Tag color="blue" className="text-xs font-semibold">
                      Chương {q.chapterId.replace('ch', '')}
                    </Tag>
                    <Tag color={q.category === 'theory' ? 'purple' : 'cyan'} className="text-xs">
                      {q.category === 'theory' ? 'Lý thuyết' : 'Bài tập tính toán'}
                    </Tag>
                    <Tag color={q.difficulty === 'Easy' ? 'green' : q.difficulty === 'Medium' ? 'blue' : 'volcano'} className="text-xs">
                      {q.difficulty === 'Easy' ? 'Dễ' : q.difficulty === 'Medium' ? 'Vừa' : 'Khó'}
                    </Tag>
                    <span className="text-xs text-slate-500 hidden md:inline">
                      {q.subtopic}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Tooltip title={isBookmarked ? 'Bỏ lưu' : 'Lưu câu hỏi'}>
                      <button
                        type="button"
                        onClick={() => handleToggleBookmark(q.id)}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                          isBookmarked ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {isBookmarked ? <StarFilled /> : <StarOutlined />}
                      </button>
                    </Tooltip>

                    <Button
                      size="small"
                      type={isRevealed ? 'default' : 'primary'}
                      onClick={() => handleToggleReveal(q.id)}
                      className={!isRevealed ? 'bg-blue-600 text-xs font-medium cursor-pointer' : 'text-xs font-medium cursor-pointer text-slate-600'}
                    >
                      {isRevealed ? 'Ẩn đáp án' : 'Xem đáp án'}
                    </Button>
                  </div>
                </div>

                <div className="text-slate-900 font-medium text-sm sm:text-base mb-4 leading-relaxed whitespace-pre-line">
                  {q.question}
                </div>

                {/* Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                  {q.options.map((opt, oIdx) => {
                    const letter = String.fromCharCode(65 + oIdx);
                    const isCorrect = oIdx === q.correctIndex;
                    let optStyle = 'bg-slate-50/70 border-slate-200 text-slate-700';
                    if (isRevealed && isCorrect) {
                      optStyle = 'bg-emerald-50/90 border-emerald-500 text-emerald-950 font-semibold ring-1 ring-emerald-500/40';
                    }

                    return (
                      <div
                        key={oIdx}
                        className={`p-2.5 rounded-lg border text-xs sm:text-sm flex items-start gap-2 ${optStyle}`}
                      >
                        <span className={`font-bold shrink-0 ${isRevealed && isCorrect ? 'text-emerald-700' : 'text-slate-500'}`}>{letter}.</span>
                        <span className="flex-1">{opt}</span>
                        {isRevealed && isCorrect && (
                          <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-sm font-bold shrink-0">
                            ĐÁP ÁN ĐÚNG
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation Card displayed directly */}
                {isRevealed && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs pb-1.5 border-b border-slate-200">
                      <CheckCircleOutlined className="text-emerald-600" />
                      <span>Đáp án chính xác: {String.fromCharCode(65 + q.correctIndex)}. {q.options[q.correctIndex]}</span>
                    </div>

                    {q.formula && (
                      <div className="p-2 rounded-md bg-white border border-slate-200">
                        <span className="font-bold text-slate-600">Công thức: </span>
                        <code className="text-emerald-800 font-mono">{q.formula}</code>
                      </div>
                    )}

                    {q.stepByStep && (
                      <div className="p-2 rounded-md bg-white border border-slate-200">
                        <div className="font-bold text-slate-600 mb-1">Bước giải chi tiết:</div>
                        <pre className="font-mono text-slate-800 whitespace-pre-wrap m-0 leading-relaxed">{q.stepByStep}</pre>
                      </div>
                    )}

                    <div>
                      <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                        <BulbOutlined className="text-amber-500" />
                        <span>Giải thích Tiếng Việt:</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed m-0 whitespace-pre-line text-xs">{q.explanationVi}</p>
                    </div>

                    {q.explanationEn && (
                      <div className="pt-1.5 border-t border-slate-200/60">
                        <div className="font-bold text-slate-500 mb-0.5 text-[11px]">English Reference:</div>
                        <p className="text-slate-600 italic m-0 text-xs">{q.explanationEn}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Pagination */}
          <div className="flex justify-center pt-4">
            <Pagination
              current={currentPage}
              total={filteredQuestions.length}
              pageSize={pageSize}
              onChange={p => setCurrentPage(p)}
              showSizeChanger={false}
              showQuickJumper
            />
          </div>
        </div>
      ) : (
        <Card className="border border-slate-200 py-12 text-center">
          <Empty description="Không tìm thấy câu hỏi nào phù hợp với bộ lọc hiện tại." />
        </Card>
      )}
    </div>
  );
};
