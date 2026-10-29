export interface FixtureExam {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  questionCount: number;
  timeLimitMinutes: number;
  tags: string[];
  fixtureFile: string;
}

export const FIXTURE_EXAMS: FixtureExam[] = [
  {
    id: 'moodle-ktmt-quiz',
    badge: 'Đề 1',
    title: 'Cuối Kỳ KTMT & Hợp Ngữ 2019',
    subtitle: 'Đề thi trắc nghiệm cuối kỳ năm 2019',
    description: 'Bộ đề thi tổng hợp 50 câu gồm trắc nghiệm đơn, đa lựa chọn, bảng nối và câu hỏi điền đáp án số học.',
    questionCount: 50,
    timeLimitMinutes: 60,
    tags: ['Cuối kỳ', '2019', '50 câu'],
    fixtureFile: 'moodle-ktmt-quiz.html',
  },
  {
    id: 'moodle-ktmt-2019-exam',
    badge: 'Đề 2',
    title: 'Cuối Kỳ Môn KTMT 2019 (Đề 2)',
    subtitle: 'Đề thi chính thức môn KTMT & Hợp ngữ',
    description: 'Đề thi chính thức 45 câu bao quát lệnh hợp ngữ 8086, cấu trúc bộ nhớ cache, ngắt và bus hệ thống.',
    questionCount: 45,
    timeLimitMinutes: 60,
    tags: ['Cuối kỳ', '2019', '45 câu'],
    fixtureFile: 'moodle-ktmt-2019-exam.html',
  },
  {
    id: 'moodle-ktmt-k15-exam',
    badge: 'Đề 3',
    title: 'Bài Thi KTMT K15 Trắc Nghiệm (Đề 1)',
    subtitle: 'Bộ đề thi KTMT cuối kỳ đề 1 khóa K15',
    description: 'Bộ đề 45 câu dành cho sinh viên khóa K15 với các bài toán tính chu kỳ lệnh, biểu đồ flowchart và stack frame.',
    questionCount: 45,
    timeLimitMinutes: 60,
    tags: ['K15', 'Đề 1', '45 câu'],
    fixtureFile: 'moodle-ktmt-k15-exam.html',
  },
  {
    id: 'moodle-ktmt-k15-de2',
    badge: 'Đề 4',
    title: 'Kiểm Tra Cuối Kỳ Đề 2 - K15',
    subtitle: 'Đề thi cuối kỳ đề 2 dành cho sinh viên K15',
    description: 'Bộ đề 45 câu gồm câu hỏi chu kỳ lệnh, vi xử lý IA-32, bảng nhớ memory dump và thanh ghi con trỏ stack.',
    questionCount: 45,
    timeLimitMinutes: 60,
    tags: ['K15', 'Đề 2', '45 câu'],
    fixtureFile: 'moodle-ktmt-k15-de2.html',
  },
  {
    id: 'moodle-ktmt-lopchan-2019',
    badge: 'Đề 5',
    title: 'Thi KTMT & Hợp Ngữ Lớp Chẵn 2019',
    subtitle: 'Đề thi cuối kỳ dành cho lớp chẵn 2019',
    description: 'Đề thi phân loại lớp chẵn với nhiều câu hỏi ghép nối kỹ thuật bộ nhớ, cờ trạng thái PSW và chế độ địa chỉ.',
    questionCount: 45,
    timeLimitMinutes: 60,
    tags: ['Lớp chẵn', '2019', '45 câu'],
    fixtureFile: 'moodle-ktmt-lopchan-2019.html',
  },
  {
    id: 'moodle-ktmt-midterm-gk',
    badge: 'Đề 6',
    title: 'Online Mid Term Test No-2 HK1 2023-2024',
    subtitle: 'Đề thi giữa kỳ môn Kiến trúc máy tính HK1',
    description: 'Đề thi online giữa kỳ HK1 năm học 2023-2024 gồm 40 câu hỏi trắc nghiệm và điền giá trị thanh ghi, cờ hiệu.',
    questionCount: 40,
    timeLimitMinutes: 45,
    tags: ['Giữa kỳ', '2023-2024', '40 câu'],
    fixtureFile: 'moodle-ktmt-midterm-gk.html',
  },
  {
    id: 'moodle-ktmt-thichung-2018',
    badge: 'Đề 7',
    title: 'THI KTMT & Hợp Ngữ - Thi Chung 2018',
    subtitle: 'Đề thi chung trắc nghiệm Moodle năm 2018',
    description: 'Đề thi chung năm 2018 gồm 42 câu với đầy đủ sơ đồ logic phân nhánh, bảng trạng thái thanh ghi và cờ hiệu.',
    questionCount: 42,
    timeLimitMinutes: 50,
    tags: ['Thi chung', '2018', '42 câu'],
    fixtureFile: 'moodle-ktmt-thichung-2018.html',
  },
  {
    id: 'moodle-ktmt-clc-2017',
    badge: 'Đề 8',
    title: 'KTMT & Hợp Ngữ - Nhóm CLC 2017',
    subtitle: 'Đề thi trắc nghiệm lớp Chất Lượng Cao 2017',
    description: 'Bộ đề thi 53 câu bao gồm chu trình lệnh instruction cycle, bộ nhớ cache hit/miss, pipeline và bảng mã máy debug.',
    questionCount: 53,
    timeLimitMinutes: 60,
    tags: ['CLC', '2017', '53 câu'],
    fixtureFile: 'moodle-ktmt-clc-2017.html',
  },
  {
    id: 'moodle-ktmt-quiz-clc-2017',
    badge: 'Đề 9',
    title: 'Quiz KTMT & Hợp Ngữ - Nhóm CLC 2017',
    subtitle: 'Bài kiểm tra nhanh (Quiz 10 phút) Nhóm CLC 2017',
    description: 'Bài kiểm tra 24 câu hỏi trọng tâm về định dạng số thực dấu chấm động 8-bit, phép chia số học IDIV và lệnh debug.',
    questionCount: 24,
    timeLimitMinutes: 30,
    tags: ['Quiz', 'CLC 2017', '24 câu'],
    fixtureFile: 'moodle-ktmt-quiz-clc-2017.html',
  },
];
