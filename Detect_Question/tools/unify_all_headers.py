import os
import re

exams = [
    {
        "id": "moodle-ktmt-quiz.html",
        "num": 1,
        "title": "Cuối Kỳ KTMT & Hợp Ngữ 2019",
        "short_title": "Cuối Kỳ KTMT & Hợp Ngữ 2019",
        "count": 50,
        "meta": "50 câu • Đề thi trắc nghiệm cuối kỳ năm 2019"
    },
    {
        "id": "moodle-ktmt-2019-exam.html",
        "num": 2,
        "title": "Cuối Kỳ Môn KTMT 2019 (Đề 2)",
        "short_title": "Cuối Kỳ Môn KTMT 2019 - Đề 2",
        "count": 45,
        "meta": "45 câu • Đề thi chính thức môn KTMT & Hợp ngữ"
    },
    {
        "id": "moodle-ktmt-k15-exam.html",
        "num": 3,
        "title": "Bài Thi KTMT K15 Trắc Nghiệm (Đề 1)",
        "short_title": "Bài Thi KTMT K15 Trắc Nghiệm (Đề 1)",
        "count": 45,
        "meta": "45 câu • Bộ đề thi KTMT cuối kỳ đề 1 khóa K15"
    },
    {
        "id": "moodle-ktmt-k15-de2.html",
        "num": 4,
        "title": "Kiểm Tra Cuối Kỳ Đề 2 - K15",
        "short_title": "Kiểm Tra Cuối Kỳ Đề 2 - K15",
        "count": 45,
        "meta": "45 câu • Đề thi cuối kỳ đề 2 dành cho sinh viên K15"
    },
    {
        "id": "moodle-ktmt-lopchan-2019.html",
        "num": 5,
        "title": "Thi KTMT & Hợp Ngữ Lớp Chẵn 2019",
        "short_title": "Thi KTMT & Hợp Ngữ Lớp Chẵn 2019",
        "count": 45,
        "meta": "45 câu • Đề thi cuối kỳ dành cho lớp chẵn 2019"
    },
    {
        "id": "moodle-ktmt-midterm-gk.html",
        "num": 6,
        "title": "Online Mid Term Test No-2 HK1 2023-2024",
        "short_title": "Online Mid Term Test No-2 HK1 2023-2024",
        "count": 40,
        "meta": "40 câu • Đề thi giữa kỳ môn Kiến trúc máy tính HK1"
    },
    {
        "id": "moodle-ktmt-thichung-2018.html",
        "num": 7,
        "title": "THI KTMT & Hợp Ngữ - Thi Chung 2018",
        "short_title": "THI KTMT & Hợp Ngữ - Thi Chung 2018",
        "count": 42,
        "meta": "42 câu • Kỳ thi chung môn Kiến trúc máy tính & Hợp ngữ"
    },
    {
        "id": "moodle-ktmt-clc-2017.html",
        "num": 8,
        "title": "KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "short_title": "KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "count": 53,
        "meta": "53 câu • Đề thi Nhóm 06 07 08CLC Chất Lượng Cao"
    },
    {
        "id": "moodle-ktmt-quiz-clc-2017.html",
        "num": 9,
        "title": "Quiz KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "short_title": "Quiz KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "count": 24,
        "meta": "24 câu • Bài kiểm tra nhanh (Quiz 10 phút) Nhóm CLC 2017"
    }
]

CSS_HEADER_BLOCK = """
    /* === UNIFIED MOODLE HEADER CSS === */
    header.site-header {
      background: #ffffff;
      border-bottom: 2px solid var(--primary, #0284c7);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: nowrap;
    }

    .brand-block {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .brand-logo {
      width: 42px;
      height: 42px;
      background: linear-gradient(135deg, #0284c7, #1e3a8a);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 17px;
      flex-shrink: 0;
    }

    .brand-title h1 {
      font-size: 14.5px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      line-height: 1.25;
      white-space: nowrap;
    }

    .brand-title p {
      font-size: 11.5px;
      color: var(--text-muted, #64748b);
      line-height: 1.25;
      white-space: nowrap;
    }

    /* Exam switcher dropdown styling */
    .exam-switcher-container {
      position: relative;
      display: inline-block;
      flex-shrink: 0;
    }

    .exam-switcher-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 7px 13px;
      border-radius: 8px;
      font-size: 13px;
      color: #0f172a;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      white-space: nowrap;
    }

    .exam-switcher-btn:hover {
      background: #e2e8f0;
      border-color: #94a3b8;
    }

    .switcher-icon { font-size: 16px; }
    .switcher-arrow { color: #64748b; font-size: 12px; transition: transform 0.2s; }
    .exam-switcher-container.open .switcher-arrow { transform: rotate(180deg); }

    .exam-switcher-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 340px;
      width: max-content;
      max-width: min(420px, 92vw);
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      box-shadow: 0 12px 28px -4px rgba(0,0,0,0.18), 0 8px 10px -6px rgba(0,0,0,0.1);
      z-index: 2000;
      overflow: hidden;
    }

    .switcher-menu-header {
      background: #f8fafc;
      padding: 10px 14px;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .hub-link-chip {
      color: #0284c7;
      text-decoration: none;
      font-weight: 600;
      font-size: 11px;
    }
    .hub-link-chip:hover { text-decoration: underline; }

    .switcher-items-list {
      max-height: 420px;
      overflow-y: auto;
    }

    .switcher-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 14px;
      text-decoration: none;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
    }
    .switcher-item:hover { background: #f8fafc; }
    .switcher-item.active { background: #f0f9ff; border-left: 3px solid #0284c7; }

    .switcher-badge {
      background: #e2e8f0;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 6px;
      border-radius: 4px;
      white-space: nowrap;
      margin-top: 2px;
    }
    .switcher-item.active .switcher-badge { background: #0284c7; color: white; }

    .switcher-name { font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.3; }
    .current-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      background: #dcfce7;
      color: #15803d;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 4px;
    }
    .switcher-meta { font-size: 11px; color: #64748b; margin-top: 2px; }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .view-mode-toggle {
      display: inline-flex;
      background: #e2e8f0;
      padding: 3px;
      border-radius: 6px;
      gap: 4px;
    }

    .view-mode-btn {
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: #475569;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .view-mode-btn.active {
      background: white;
      color: #0284c7;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }

    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 6px 13px; font-size: 12.5px; font-weight: 500; border-radius: 6px;
      cursor: pointer; border: 1px solid transparent; transition: all 0.15s; white-space: nowrap;
    }
    .btn-primary { background: var(--primary, #0284c7); color: white; }
    .btn-primary:hover { background: var(--primary-hover, #0369a1); }
    .btn-outline { border-color: var(--border-color, #cbd5e1); background: white; color: #334155; }
    .btn-outline:hover { background: #f1f5f9; }

    /* Single Question per page mode styling */
    body.single-question-mode .que {
      display: none !important;
    }
    body.single-question-mode .que.current-page {
      display: grid !important;
    }
"""

def generate_header_html(cur_exam):
    items_html = ""
    for e in exams:
        is_active = (e["id"] == cur_exam["id"])
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

    return f"""  <header class="site-header">
    <div class="header-inner">
      <div class="brand-block">
        <div class="brand-logo">UTE</div>
        <div class="brand-title">
          <h1>HCMUTE - LMS Hệ Thống Thi Trực Tuyến</h1>
          <p>Trường Đại Học Sư Phạm Kỹ Thuật TP. Hồ Chí Minh</p>
        </div>
      </div>

      <div class="exam-switcher-container">
        <button type="button" class="exam-switcher-btn" id="examSwitcherToggle" aria-haspopup="true" aria-expanded="false">
          <span class="switcher-icon">📚</span>
          <span class="switcher-btn-text"><strong>Đề {cur_exam['num']}: {cur_exam['short_title']}</strong></span>
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
      </div>

      <div class="toolbar-actions">
        <div class="view-mode-toggle">
          <button type="button" class="view-mode-btn active" id="btn-mode-single" onclick="setMode(true)">1 Câu / Trang</button>
          <button type="button" class="view-mode-btn" id="btn-mode-all" onclick="setMode(false)">Xem Tất Cả {cur_exam['count']} Câu</button>
        </div>
        <button type="button" class="btn btn-outline" id="btn-reset-all" onclick="resetForm()">Reset All</button>
        <button type="button" class="btn btn-primary" id="btn-detect-test" onclick="triggerDetectTest()">Quét Detect Test</button>
      </div>
    </div>
  </header>"""

JS_UNIVERSAL_BLOCK = """
    // === UNIFIED VIEW MODE & CONTROLLER SCRIPT ===
    function setMode(singlePage) {
      if (typeof singlePage === 'string') {
        singlePage = (singlePage === 'single' || singlePage === '1');
      }
      singlePage = Boolean(singlePage);

      if (typeof isSinglePageMode !== 'undefined') isSinglePageMode = singlePage;
      if (typeof isSingleMode !== 'undefined') isSingleMode = singlePage;
      if (typeof singleQuestionMode !== 'undefined') singleQuestionMode = singlePage;

      document.body.classList.toggle('single-question-mode', singlePage);

      const btnSingle = document.getElementById('btn-mode-single');
      const btnAll = document.getElementById('btn-mode-all');
      if (btnSingle) btnSingle.classList.toggle('active', singlePage);
      if (btnAll) btnAll.classList.toggle('active', !singlePage);

      // Also sync legacy button IDs if present
      document.querySelectorAll('#singlePageModeBtn, #mode-single, #btnModeSingle').forEach(b => b.classList.toggle('active', singlePage));
      document.querySelectorAll('#allQuestionsModeBtn, #mode-all, #btnModeAll').forEach(b => b.classList.toggle('active', !singlePage));

      // Display controls bar
      const moodleNav = document.getElementById('moodleNavControls') || document.getElementById('moodle-nav-bar') || document.querySelector('.moodle-nav-controls') || document.querySelector('.pagination-bar');
      if (moodleNav) moodleNav.style.display = singlePage ? 'flex' : 'none';

      // Update mode text description if present
      const modeText = document.getElementById('display-mode-text');
      if (modeText) {
        modeText.textContent = singlePage 
          ? '1 câu hỏi / 1 trang (Moodle Standard Pagination)' 
          : 'Tất cả câu hỏi trên cùng 1 trang';
      }

      // Call page render function
      const targetPage = (typeof currentPage !== 'undefined' ? currentPage : (typeof currentQuestionIndex !== 'undefined' ? currentQuestionIndex : 1));
      if (typeof renderPage === 'function') {
        renderPage(targetPage);
      } else if (typeof showPage === 'function') {
        showPage(targetPage);
      } else if (typeof showQuestion === 'function') {
        showQuestion(targetPage, false);
      } else if (typeof goToQuestion === 'function') {
        goToQuestion(targetPage);
      }
    }
    window.setMode = setMode;
    window.setViewMode = setMode;
    window.applySingleQuestionMode = setMode;

    // Reset Form
    function resetForm() {
      const form = document.getElementById('responseform') || document.querySelector('form');
      if (form) form.reset();
      document.querySelectorAll('.que .answer .r0, .que .answer .r1').forEach(row => row.classList.remove('active'));
      document.querySelectorAll('.que input[type="radio"], .que input[type="checkbox"]').forEach(i => i.checked = false);
      document.querySelectorAll('.que input[type="text"]').forEach(i => i.value = '');
      document.querySelectorAll('.que select').forEach(s => s.selectedIndex = 0);
      document.querySelectorAll('.qn-btn, .quiz-nav-btn, .qnbutton').forEach(btn => btn.classList.remove('answered'));
      if (typeof updateQuestionStatus === 'function') {
        document.querySelectorAll('.que').forEach(q => updateQuestionStatus(q));
      }
      setMode(true);
    }
    window.resetForm = resetForm;

    // Trigger Detect Test
    function triggerDetectTest() {
      if (typeof window.ExamDomScanner !== 'undefined') {
        const detected = window.ExamDomScanner.scanAll();
        alert('Extension ExamDomScanner phát hiện thành công: ' + detected.length + ' câu hỏi!');
        console.log('[Detect Test] Questions found:', detected);
      } else {
        const visibleQue = document.querySelectorAll('.que.current-page, .que:not([style*="display: none"])');
        alert('Đang hiển thị ' + visibleQue.length + ' câu hỏi (Chế độ 1 câu/trang). Sẵn sàng để Extension quét!');
        console.log('[Detect Test] Active question:', visibleQue);
      }
    }
    window.triggerDetectTest = triggerDetectTest;
    window.triggerMoodleScannerTest = triggerDetectTest;

    // Exam switcher dropdown toggle & click outside
    (function initExamSwitcher() {
      const switcherToggle = document.getElementById('examSwitcherToggle');
      const switcherMenu = document.getElementById('examSwitcherMenu');
      const switcherContainer = document.querySelector('.exam-switcher-container');
      if (!switcherToggle || !switcherMenu) return;

      switcherToggle.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = (switcherMenu.style.display === 'none' || switcherMenu.style.display === '');
        if (isHidden) {
          switcherMenu.style.display = 'block';
          const rect = switcherMenu.getBoundingClientRect();
          if (rect.right > (window.innerWidth || document.documentElement.clientWidth) - 10) {
            switcherMenu.style.left = 'auto';
            switcherMenu.style.right = '0px';
          } else {
            switcherMenu.style.left = '0px';
            switcherMenu.style.right = 'auto';
          }
        } else {
          switcherMenu.style.display = 'none';
        }
        if (switcherContainer) switcherContainer.classList.toggle('open', isHidden);
        switcherToggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      };

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

for e in exams:
    file_path = os.path.join("fixtures", e["id"])
    if not os.path.exists(file_path):
        continue
    with open(file_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Update <body ...> to ensure class="single-question-mode" is present
    if 'class="single-question-mode"' not in html and "class='single-question-mode'" not in html:
        html = re.sub(r'<body([^>]*)>', r'<body\1 class="single-question-mode">', html, count=1)
        html = re.sub(r'class="([^"]*)"\s+class="single-question-mode"', r'class="\1 single-question-mode"', html)

    # 2. Replace entire <header class="site-header">...</header>
    new_header = generate_header_html(e)
    html = re.sub(r'<header class=[\'"]site-header[\'"][\s\S]*?</header>', new_header, html, count=1)

    # 3. Clean any old header CSS and inject unified CSS
    html = re.sub(r'/\* === UNIFIED MOODLE HEADER CSS === \*/[\s\S]*?body\.single-question-mode \.que\.current-page\s*\{[^}]*\}', '', html)
    html = re.sub(r'/\* Exam switcher dropdown styling \*/[\s\S]*?\.switcher-meta\s*\{[^}]*\}', '', html)
    html = re.sub(r'\.scan-status-card\s*\{[\s\S]*?\.scan-status-card strong\s*\{[^}]*\}', '', html)
    html = re.sub(r'header\.site-header\s*\{[\s\S]*?\.toolbar-actions\s*\{[^\}]*\}', '/* legacy header styles cleaned */', html, count=1)

    # Insert unified CSS block before </style>
    html = re.sub(r'</style>', CSS_HEADER_BLOCK + '\n  </style>', html, count=1)

    # 4. Remove old setMode(mode) functions from quiz, 2019-exam, k15-exam, lopchan-2019
    html = re.sub(r'function setMode\(mode\)\s*\{[\s\S]*?renderPage\(currentPage\);\s*\}', '', html)
    html = re.sub(r'\s*else\s*\{[^}]*?Tất cả 45 câu hỏi trên một trang[^}]*?\}[^}]*?\}', '', html)
    # Remove old setViewMode(single) from midterm-gk
    html = re.sub(r'function setViewMode\(single\)\s*\{[\s\S]*?classList\.remove\([\'"]current-page[\'"]\);\s*\}\s*\}', '', html)

    # Clean previous injected JS blocks
    html = re.sub(r'// === UNIFIED VIEW MODE & CONTROLLER SCRIPT ===[\s\S]*?\}\)\(\);\s*', '', html)
    html = re.sub(r'\(function initExamSwitcher[\s\S]*?\}\)\(\);\s*', '', html)
    html = re.sub(r'// Exam switcher dropdown toggle[\s\S]*?switcherToggle\.setAttribute\([^\)]*\);\s*\}\);\s*\}\s*', '', html)

    # Clean residual scannerDetectionCard
    if 'scannerDetectionCard' in html:
        html = re.sub(r'<div class=[\'"]scan-status-card[\'"] id=[\'"]scannerDetectionCard[\'"][\s\S]*?</div>', '', html)

    # Null safety for midterm-gk
    html = html.replace("document.getElementById('pageIndicatorText').innerText =", "const _pInd = document.getElementById('pageIndicatorText'); if (_pInd) _pInd.innerText =")
    html = html.replace("document.getElementById('prevQuestionBtn').disabled =", "const _prv = document.getElementById('prevQuestionBtn'); if (_prv) _prv.disabled =")
    html = html.replace("document.getElementById('nextQuestionBtn').innerText =", "const _nxt = document.getElementById('nextQuestionBtn'); if (_nxt) _nxt.innerText =")

    # Inject JS_UNIVERSAL_BLOCK before </script>
    last_script_close = html.rfind('</script>')
    if last_script_close != -1:
        html = html[:last_script_close] + JS_UNIVERSAL_BLOCK + '\n  ' + html[last_script_close:]

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"UNIFIED & CLEANED: {e['id']}")
