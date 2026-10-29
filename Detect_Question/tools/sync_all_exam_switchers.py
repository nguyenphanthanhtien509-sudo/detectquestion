import os
import re

exams = [
    {
        "id": "moodle-ktmt-quiz.html",
        "num": 1,
        "title": "Cuối Kỳ KTMT & Hợp Ngữ 2019",
        "subtitle": "Đề thi trắc nghiệm cuối kỳ năm 2019",
        "desc": "Bộ đề thi tổng hợp 50 câu gồm trắc nghiệm đơn, đa lựa chọn, bảng nối và câu hỏi điền đáp án số học.",
        "tags": ["Cuối kỳ", "2019", "50 câu"],
        "count": 50,
        "meta": "50 câu • Đề thi trắc nghiệm cuối kỳ năm 2019"
    },
    {
        "id": "moodle-ktmt-2019-exam.html",
        "num": 2,
        "title": "Cuối Kỳ Môn KTMT 2019 (Đề 2)",
        "subtitle": "Đề thi chính thức môn KTMT & Hợp ngữ",
        "desc": "Đề thi chính thức 45 câu bao quát lệnh hợp ngữ 8086, cấu trúc bộ nhớ cache, ngắt và bus hệ thống.",
        "tags": ["Cuối kỳ", "2019", "45 câu"],
        "count": 45,
        "meta": "45 câu • Đề thi chính thức môn KTMT & Hợp ngữ"
    },
    {
        "id": "moodle-ktmt-k15-exam.html",
        "num": 3,
        "title": "Bài Thi KTMT K15 Trắc Nghiệm (Đề 1)",
        "subtitle": "Bộ đề thi KTMT cuối kỳ đề 1 khóa K15",
        "desc": "Bộ đề 45 câu dành cho sinh viên khóa K15 với các bài toán tính chu kỳ lệnh, biểu đồ flowchart và stack frame.",
        "tags": ["K15", "Đề 1", "45 câu"],
        "count": 45,
        "meta": "45 câu • Bộ đề thi KTMT cuối kỳ đề 1 khóa K15"
    },
    {
        "id": "moodle-ktmt-k15-de2.html",
        "num": 4,
        "title": "Kiểm Tra Cuối Kỳ Đề 2 - K15",
        "subtitle": "Đề thi cuối kỳ đề 2 dành cho sinh viên K15",
        "desc": "Bộ đề 45 câu gồm câu hỏi chu kỳ lệnh, vi xử lý IA-32, bảng nhớ memory dump và thanh ghi con trỏ stack.",
        "tags": ["K15", "Đề 2", "45 câu"],
        "count": 45,
        "meta": "45 câu • Đề thi cuối kỳ đề 2 dành cho sinh viên K15"
    },
    {
        "id": "moodle-ktmt-lopchan-2019.html",
        "num": 5,
        "title": "Thi KTMT & Hợp Ngữ Lớp Chẵn 2019",
        "subtitle": "Đề thi cuối kỳ dành cho lớp chẵn 2019",
        "desc": "Đề thi phân loại lớp chẵn với nhiều câu hỏi ghép nối kỹ thuật bộ nhớ, cờ trạng thái PSW và chế độ địa chỉ.",
        "tags": ["Lớp chẵn", "2019", "45 câu"],
        "count": 45,
        "meta": "45 câu • Đề thi cuối kỳ dành cho lớp chẵn 2019"
    },
    {
        "id": "moodle-ktmt-midterm-gk.html",
        "num": 6,
        "title": "Online Mid Term Test No-2 HK1 2023-2024",
        "subtitle": "Đề thi giữa kỳ môn Kiến trúc máy tính HK1",
        "desc": "Đề thi online giữa kỳ HK1 năm học 2023-2024 gồm 40 câu hỏi trắc nghiệm và điền giá trị thanh ghi, cờ hiệu.",
        "tags": ["Giữa kỳ", "2023-2024", "40 câu"],
        "count": 40,
        "meta": "40 câu • Đề thi giữa kỳ môn Kiến trúc máy tính HK1"
    },
    {
        "id": "moodle-ktmt-thichung-2018.html",
        "num": 7,
        "title": "THI KTMT & Hợp Ngữ - Thi Chung 2018",
        "subtitle": "Đề thi chung trắc nghiệm Moodle năm 2018",
        "desc": "Đề thi chung năm 2018 gồm 42 câu với đầy đủ sơ đồ logic phân nhánh, bảng trạng thái thanh ghi và cờ hiệu.",
        "tags": ["Thi chung", "2018", "42 câu"],
        "count": 42,
        "meta": "42 câu • Kỳ thi chung môn Kiến trúc máy tính & Hợp ngữ"
    },
    {
        "id": "moodle-ktmt-clc-2017.html",
        "num": 8,
        "title": "KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "subtitle": "Đề thi trắc nghiệm lớp Chất Lượng Cao 2017",
        "desc": "Bộ đề thi 53 câu bao gồm chu trình lệnh instruction cycle, bộ nhớ cache hit/miss, pipeline và bảng mã máy debug.",
        "tags": ["CLC", "2017", "53 câu"],
        "count": 53,
        "meta": "53 câu • Đề thi Nhóm 06 07 08CLC Chất Lượng Cao"
    },
    {
        "id": "moodle-ktmt-quiz-clc-2017.html",
        "num": 9,
        "title": "Quiz KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "subtitle": "Bài kiểm tra nhanh (Quiz 10 phút) Nhóm CLC 2017",
        "desc": "Bài kiểm tra 24 câu hỏi trọng tâm về định dạng số thực dấu chấm động 8-bit, phép chia số học IDIV và lệnh debug.",
        "tags": ["Quiz", "CLC 2017", "24 câu"],
        "count": 24,
        "meta": "24 câu • Bài kiểm tra nhanh (Quiz 10 phút) Nhóm CLC 2017"
    }
]

CSS_BLOCK = """
    /* Exam switcher dropdown styling */
    .exam-switcher-container { position: relative; display: inline-block; }
    .exam-switcher-btn {
      display: inline-flex; align-items: center; gap: 8px; background: #f1f5f9;
      border: 1px solid #cbd5e1; padding: 7px 14px; border-radius: 8px; font-size: 13px;
      color: #0f172a; cursor: pointer; transition: all 0.15s ease; font-family: inherit;
    }
    .exam-switcher-btn:hover { background: #e2e8f0; border-color: #94a3b8; }
    .switcher-icon { font-size: 16px; }
    .switcher-arrow { color: #64748b; font-size: 12px; transition: transform 0.2s; }
    .exam-switcher-container.open .switcher-arrow { transform: rotate(180deg); }
    .exam-switcher-menu {
      position: absolute; top: calc(100% + 6px); left: 0; width: 380px; max-width: 90vw;
      background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1);
      z-index: 1000; overflow: hidden;
    }
    .switcher-menu-header {
      background: #f8fafc; padding: 10px 14px; font-size: 11px; font-weight: 700;
      color: #475569; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;
    }
    .hub-link-chip { color: #0284c7; text-decoration: none; font-weight: 600; font-size: 11px; }
    .hub-link-chip:hover { text-decoration: underline; }
    .switcher-items-list { max-height: 400px; overflow-y: auto; }
    .switcher-item {
      display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px;
      text-decoration: none; color: #1e293b; border-bottom: 1px solid #f1f5f9; transition: background 0.15s;
    }
    .switcher-item:hover { background: #f8fafc; }
    .switcher-item.active { background: #f0f9ff; border-left: 3px solid #0284c7; }
    .switcher-badge {
      background: #e2e8f0; color: #334155; font-size: 11px; font-weight: 700;
      padding: 3px 6px; border-radius: 4px; white-space: nowrap; margin-top: 2px;
    }
    .switcher-item.active .switcher-badge { background: #0284c7; color: white; }
    .switcher-name { font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.3; }
    .current-tag {
      display: inline-block; font-size: 10px; font-weight: 700; background: #dcfce7;
      color: #15803d; padding: 1px 5px; border-radius: 3px; margin-left: 4px;
    }
    .switcher-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
"""

JS_BLOCK = """
    // Exam switcher dropdown toggle & click outside
    (function initExamSwitcher() {
      const switcherToggle = document.getElementById('examSwitcherToggle');
      const switcherMenu = document.getElementById('examSwitcherMenu');
      const switcherContainer = document.querySelector('.exam-switcher-container');
      if (!switcherToggle || !switcherMenu) return;

      switcherToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = (switcherMenu.style.display === 'none' || switcherMenu.style.display === '');
        switcherMenu.style.display = isHidden ? 'block' : 'none';
        if (switcherContainer) switcherContainer.classList.toggle('open', isHidden);
        switcherToggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });

      document.addEventListener('click', function(e) {
        if (!switcherMenu.contains(e.target) && !switcherToggle.contains(e.target)) {
          switcherMenu.style.display = 'none';
          if (switcherContainer) switcherContainer.classList.remove('open');
          switcherToggle.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          switcherMenu.style.display = 'none';
          if (switcherContainer) switcherContainer.classList.remove('open');
          switcherToggle.setAttribute('aria-expanded', 'false');
        }
      });
    })();
"""

def make_switcher_html(cur_exam_id):
    cur_e = next(e for e in exams if e["id"] == cur_exam_id)
    items_html = ""
    for e in exams:
        is_active = (e["id"] == cur_exam_id)
        active_cls = " active" if is_active else ""
        current_tag = ' <span class="current-tag">Đang mở</span>' if is_active else ""
        items_html += f"""
        <a href="{e['id']}" class="switcher-item{active_cls}">
          <span class="switcher-badge">Đề {e['num']}</span>
          <div class="switcher-text">
            <div class="switcher-name">{e['title']}{current_tag}</div>
            <div class="switcher-meta">{e['meta']}</div>
          </div>
        </a>"""
    
    return f"""<div class="exam-switcher-container">
        <button type="button" class="exam-switcher-btn" id="examSwitcherToggle" aria-haspopup="true" aria-expanded="false">
          <span class="switcher-icon">📚</span>
          <span class="switcher-btn-text"><strong>Đề {cur_e['num']}: {cur_e['title']}</strong></span>
          <span class="switcher-arrow">▾</span>
        </button>
        <div class="exam-switcher-menu" id="examSwitcherMenu" style="display: none;">
          <div class="switcher-menu-header">
            <span>DANH SÁCH 9 BỘ ĐỀ THI KTMT</span>
            <a href="index.html" class="hub-link-chip">🏠 Trang tổng hợp</a>
          </div>
          <div class="switcher-items-list">{items_html}
          </div>
        </div>
      </div>"""

for e in exams:
    file_path = os.path.join("fixtures", e["id"])
    if not os.path.exists(file_path):
        continue
    with open(file_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Ensure CSS exists
    if '.exam-switcher-container' not in html:
        html = re.sub(r'</style>', CSS_BLOCK + '\n  </style>', html, count=1)
    else:
        # replace existing switcher CSS to ensure all tokens match
        html = re.sub(r'/\* Exam switcher dropdown styling \*/[\s\S]*?\.switcher-meta\s*\{[^}]*\}', CSS_BLOCK.strip(), html)

    # 2. Replace HTML markup
    switcher_markup = make_switcher_html(e["id"])
    if '<div class="exam-switcher-container">' in html or '<div class=\'exam-switcher-container\'>' in html:
        html = re.sub(
            r'<div class=[\'"]exam-switcher-container[\'"][\s\S]*?</div>\s*</div>\s*</div>',
            switcher_markup,
            html,
            count=1
        )
    elif '<div class="exam-selector"' in html or '<div class=\'exam-selector\'' in html:
        # Remove exam-selector
        html = re.sub(r'<div class=[\'"]exam-selector[\'"][\s\S]*?</div>\s*</div>', '</div>', html, count=1)
        # And insert before toolbar-actions
        html = re.sub(r'(<div class=[\'"]toolbar-actions[\'"])', switcher_markup + '\n      \\1', html, count=1)

    # 3. Ensure JS exists
    # If old switcher toggle script exists, remove it
    html = re.sub(r'// Exam switcher dropdown toggle[\s\S]*?\}\s*\}\s*\n', '', html)
    html = re.sub(r'\(function initExamSwitcher[\s\S]*?\}\)\(\);\s*', '', html)

    # Inject JS_BLOCK before </script>
    last_script_close = html.rfind('</script>')
    if last_script_close != -1:
        html = html[:last_script_close] + JS_BLOCK + '\n  ' + html[last_script_close:]

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Successfully synchronized {e['id']}!")
