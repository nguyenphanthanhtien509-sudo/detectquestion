import os
import sys
import json
import html

sys.stdout.reconfigure(encoding='utf-8')

def esc(s):
    return html.escape(str(s), quote=True)

with open('scratch/k15_de2_questions_clean.json', 'r', encoding='utf-8') as f:
    questions_de2 = json.load(f)

exam_title = "Kiểm Tra Cuối Kỳ Đề 2 - KTMT &amp; Hợp Ngữ K15 - HCMUTE"
total_questions = len(questions_de2)

def render_question(q):
    num = q["num"]
    mark = q["mark"]
    q_type = q["type"]
    stem = q["qtext"]
    
    que_type_class = "multichoice" if q_type in ["single", "multiple"] else ("matching" if q_type == "dropdown" else "shortanswer")
    
    html_out = f"""    <!-- Question {num} -->
    <div class="que {que_type_class} clearfix{' current-page' if num == 1 else ''}" id="q{num}">
      <div class="info">
        <h3 class="no">{num}</h3>
        <div class="state">Chưa trả lời</div>
        <div class="grade">Đạt điểm {mark}</div>
        <div class="questionflag">🚩 Đặt cờ</div>
      </div>
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext">{stem}</div>"""
          
    if q_type == "single":
        html_out += """\n          <div class="prompt">Chọn một câu trả lời:</div>\n          <div class="answer">"""
        for idx, opt in enumerate(q["options"]):
            opt_id = f"q{num}_opt{idx}"
            opt_val = chr(97 + idx)
            html_out += f"""
            <div class="r0" style="padding: 6px 10px; border-radius: 4px; margin-bottom: 4px; display: flex; align-items: flex-start; gap: 8px;">
              <input type="radio" name="q{num}_answer" value="{esc(opt)}" id="{opt_id}" style="margin-top: 3px; cursor: pointer;">
              <label for="{opt_id}" class="m-0" style="cursor: pointer; flex: 1;">
                <span class="answernumber" style="font-weight: 600; margin-right: 4px;">{opt_val}.</span>
                {esc(opt)}
              </label>
            </div>"""
        html_out += "\n          </div>"
    elif q_type == "multiple":
        html_out += """\n          <div class="prompt">Chọn một hoặc nhiều hơn:</div>\n          <div class="answer">"""
        for idx, opt in enumerate(q["options"]):
            opt_id = f"q{num}_opt{idx}"
            opt_val = chr(97 + idx)
            html_out += f"""
            <div class="r0" style="padding: 6px 10px; border-radius: 4px; margin-bottom: 4px; display: flex; align-items: flex-start; gap: 8px;">
              <input type="checkbox" name="q{num}_choice_{idx}" value="{esc(opt)}" id="{opt_id}" style="margin-top: 3px; cursor: pointer;">
              <label for="{opt_id}" class="m-0" style="cursor: pointer; flex: 1;">
                <span class="answernumber" style="font-weight: 600; margin-right: 4px;">{opt_val}.</span>
                {esc(opt)}
              </label>
            </div>"""
        html_out += "\n          </div>"
    elif q_type == "dropdown":
        html_out += """\n          <div class="prompt">Chọn câu trả lời phù hợp cho từng mục:</div>
          <div class="absubpart matching" style="margin-top: 14px;">
            <table class="generaltable matching-table" style="width: 100%; border-collapse: collapse;">
              <tbody>"""
        for idx, (label, opts, corr) in enumerate(q["subparts"]):
            sel_id = f"q{num}_m{idx}"
            html_out += f"""
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td class="text" style="padding: 8px 12px; font-size: 14px; font-weight: 500;">{label}</td>
                  <td class="control" style="padding: 8px 12px; width: 45%;">
                    <label for="{sel_id}" class="accesshide" style="display:none;">{label}</label>
                    <select id="{sel_id}" name="{sel_id}" class="custom-select form-control text-input-styled" style="width: 100%;">
                      <option value="">Chọn...</option>"""
            for o_idx, o in enumerate(opts, 1):
                html_out += f"""\n                      <option value="{esc(o)}">{esc(o)}</option>"""
            html_out += f"""
                    </select>
                  </td>
                </tr>"""
        html_out += """
              </tbody>
            </table>
          </div>"""
    elif q_type == "short":
        inp_id = f"q{num}_ans"
        html_out += f"""\n          <div class="absubpart shortanswer" style="margin-top: 14px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <label for="{inp_id}" class="short-answer-label" style="font-weight: 600; color: #334155;">Câu trả lời:</label>
            <input type="text" id="{inp_id}" name="{inp_id}" class="form-control text-input-styled" placeholder="Điền đáp án..." style="width: 280px; padding: 7px 12px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-family: monospace;">
          </div>"""
          
    html_out += """
        </div>
      </div>
    </div>\n"""
    return html_out

questions_html = "\n".join([render_question(q) for q in questions_de2])

nav_buttons_html = "\n".join([
    f'          <a href="?page={i}#q{i}" class="qn-btn" id="nav-btn-{i}" data-q="{i}">{i}</a>'
    for i in range(1, total_questions + 1)
])

page_html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{exam_title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --primary-dark: #075985;
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --success: #10b981;
      --success-light: #ecfdf5;
      --code-bg: #0f172a;
      --code-color: #f8fafc;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.5;
    }}

    .header-bar {{
      background: white; border-bottom: 2px solid var(--primary);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 1000;
    }}
    .header-content {{
      max-width: 1400px; margin: 0 auto; padding: 10px 24px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    }}
    .brand-section {{ display: flex; align-items: center; gap: 14px; }}
    .brand-icon {{
      width: 44px; height: 44px; background: linear-gradient(135deg, #0284c7, #1e40af);
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 800; font-size: 18px;
    }}
    .brand-text h1 {{ font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; }}
    .brand-text p {{ font-size: 12px; color: var(--text-muted); }}

    .toolbar-section {{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }}

    .view-mode-group {{
      display: inline-flex; background: #e2e8f0; padding: 3px; border-radius: 6px; gap: 4px;
    }}
    .mode-btn {{
      padding: 5px 12px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer;
      border: none; background: transparent; color: #475569; transition: all 0.15s;
    }}
    .mode-btn.active {{ background: white; color: var(--primary); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }}

    .btn {{
      display: inline-flex; align-items: center; justify-content: center;
      padding: 7px 14px; font-size: 13px; font-weight: 600; border-radius: 6px;
      cursor: pointer; border: 1px solid transparent; text-decoration: none; transition: all 0.15s;
    }}
    .btn-outline {{ border-color: var(--border-color); background: white; color: #334155; }}
    .btn-outline:hover {{ background: #f1f5f9; }}
    .btn-primary {{ background: var(--primary); color: white; }}
    .btn-primary:hover {{ background: var(--primary-hover); }}

    .nav-breadcrumbs {{
      max-width: 1400px; margin: 12px auto 0; padding: 0 24px; font-size: 12px; color: var(--text-muted);
    }}
    .nav-breadcrumbs a {{ color: var(--primary); text-decoration: none; }}
    .nav-breadcrumbs span {{ margin: 0 6px; color: #94a3b8; }}

    .main-container {{
      max-width: 1400px; margin: 16px auto 50px; padding: 0 24px;
      display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start;
    }}
    @media (max-width: 1024px) {{
      .main-container {{ grid-template-columns: 1fr; }}
      .exam-sidebar {{ order: -1; }}
    }}

    .summary-card {{
      background: white; border: 1px solid var(--border-color); border-radius: 8px;
      padding: 18px 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }}
    .summary-card h2 {{
      font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 12px;
      border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;
    }}
    .meta-table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    .meta-table th {{
      text-align: left; padding: 6px 12px 6px 0; color: var(--text-muted);
      font-weight: 500; width: 150px; vertical-align: top;
    }}
    .meta-table td {{ padding: 6px 0; color: var(--text-main); font-weight: 500; }}

    .que {{
      background: white; border: 1px solid var(--border-color); border-radius: 8px;
      margin-bottom: 24px; display: grid; grid-template-columns: 140px minmax(0, 1fr);
      overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }}
    @media (max-width: 640px) {{
      .que {{ grid-template-columns: 1fr; }}
      .que .info {{ border-right: none !important; border-bottom: 1px solid var(--border-color); }}
    }}

    .single-mode .que {{ display: none; }}
    .single-mode .que.current-page {{ display: grid; }}

    .que .info {{
      background: #f8fafc; border-right: 1px solid var(--border-color);
      padding: 18px 14px; font-size: 12px;
    }}
    .que .info .no {{ font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }}
    .que .info .state {{ color: var(--success); font-weight: 600; margin-bottom: 6px; }}
    .que .info .grade {{ color: var(--text-muted); font-size: 11px; margin-bottom: 8px; line-height: 1.4; }}
    .que .info .questionflag {{ color: #94a3b8; font-size: 11px; cursor: pointer; }}

    .que .content {{ padding: 20px 24px; min-width: 0; }}
    .que .formulation {{ font-size: 14px; line-height: 1.6; color: #1e293b; }}
    .que .qtext {{ font-weight: 500; margin-bottom: 16px; word-break: break-word; }}
    .que .prompt {{ font-size: 12px; font-style: italic; color: var(--text-muted); margin-bottom: 12px; }}

    .asm-code {{
      background: var(--code-bg); color: var(--code-color);
      padding: 12px 16px; border-radius: 6px; font-family: 'JetBrains Mono', monospace;
      font-size: 13px; line-height: 1.5; margin: 10px 0; overflow-x: auto;
    }}

    .text-input-styled {{
      padding: 6px 10px; border: 1.5px solid var(--border-color); border-radius: 5px;
      font-size: 13px; background-color: white; color: #1e293b;
    }}
    .text-input-styled:focus {{
      outline: 2px solid var(--primary); border-color: transparent;
    }}

    .exam-sidebar {{ position: sticky; top: 76px; }}
    .sidebar-card {{
      background: white; border: 1px solid var(--border-color); border-radius: 8px;
      padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }}
    .sidebar-card h3 {{ font-size: 14px; font-weight: 700; margin-bottom: 14px; color: #0f172a; }}

    .quiz-grid {{
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 16px;
    }}
    .qn-btn {{
      display: flex; align-items: center; justify-content: center;
      height: 34px; font-size: 12px; font-weight: 600; text-decoration: none;
      color: #334155; background: #f8fafc; border: 1px solid var(--border-color);
      border-radius: 4px; transition: all 0.1s;
    }}
    .qn-btn:hover {{ background: #e2e8f0; color: #0f172a; }}
    .qn-btn.active {{
      background: var(--primary); color: white; border-color: var(--primary);
    }}
    .qn-btn.answered {{
      background: #e0f2fe; border-color: #7dd3fc; color: #0369a1;
    }}

    .page-controls {{
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);
    }}
  </style>
</head>
<body class="single-mode">
  <header class="header-bar">
    <div class="header-content">
      <div class="brand-section">
        <div class="brand-icon">K15</div>
        <div class="brand-text">
          <h1>HCMUTE - Online Examination System</h1>
          <p>Khoa CNTT - Môn Kiến Trúc Máy Tính &amp; Hợp Ngữ</p>
        </div>
      </div>
      <div class="toolbar-section">
        <div class="exam-selector" style="display: flex; align-items: center; gap: 8px;">
          <label for="exam-switcher" style="font-size: 12px; font-weight: 600; color: #475569;">Bộ đề:</label>
          <select id="exam-switcher" class="text-input-styled" style="font-weight: 600; padding: 6px 12px; border: 1.5px solid #0284c7; color: #0369a1; background: #f0f9ff; border-radius: 6px; cursor: pointer;" onchange="if(this.value) window.location.href=this.value;">
            <option value="moodle-ktmt-quiz.html">Đề 1: Cuối Kỳ KTMT &amp; Hợp Ngữ 2019 (50 câu)</option>
            <option value="moodle-ktmt-2019-exam.html">Đề 2: Cuối Kỳ Môn KTMT 2019 - Đề 2 (45 câu)</option>
            <option value="moodle-ktmt-k15-exam.html">Đề 3: Kiểm Tra Cuối Kỳ Đề 1 - K15 (45 câu)</option>
            <option value="moodle-ktmt-k15-de2.html" selected>Đề 4: Kiểm Tra Cuối Kỳ Đề 2 - K15 (45 câu)</option>
            <option value="moodle-ktmt-lopchan-2019.html">Đề 5: Thi KTMT &amp; Hợp Ngữ Lớp Chẵn 2019 (45 câu)</option>
            <option value="moodle-ktmt-midterm-gk.html">Đề 6: Online Mid Term Test No-2 HK1 23-24 (40 câu)</option>
            <option value="moodle-ktmt-thichung-2018.html">Đề 7: THI KTMT &amp; Hợp Ngữ - Thi Chung 2018 (42 câu)</option>
            <option value="moodle-ktmt-clc-2017.html">Đề 8: KTMT &amp; Hợp Ngữ - Nhóm CLC 2017 (53 câu)</option>
            <option value="moodle-ktmt-quiz-clc-2017.html">Đề 9: Quiz KTMT &amp; Hợp Ngữ - Nhóm CLC 2017 (24 câu)</option>
            <option value="index.html">📋 Cổng Menu Điều Hướng Tất Cả Bộ Đề</option>
          </select>
        </div>
        <div class="view-mode-group">
          <button id="btnModeSingle" class="mode-btn active" title="Hiển thị từng câu">Một câu / trang</button>
          <button id="btnModeAll" class="mode-btn" title="Hiển thị tất cả {total_questions} câu">Toàn bộ đề</button>
        </div>
        <a href="index.html" class="btn btn-outline">Menu Đề</a>
      </div>
    </div>
  </header>

  <nav class="nav-breadcrumbs">
    <a href="index.html">Dashboard</a> <span>►</span>
    <a href="#">Học kỳ 2 năm 2016 - 2017</a> <span>►</span>
    <a href="#">Lớp Chất lượng cao</a> <span>►</span>
    <a href="#">CAAL240180_16_2_8506</a> <span>►</span>
    <a href="#">Kiểm tra cuối kỳ đề 2</a>
  </nav>

  <div class="main-container">
    <main class="exam-content">
      <div class="exam-header-card" style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px 22px; margin-bottom: 20px;">
        <h2 style="font-size: 19px; color: #0f172a; margin-bottom: 6px;">Kiểm Tra Cuối Kỳ Đề 2 - KTMT &amp; Hợp Ngữ K15</h2>
        <table class="exam-meta-table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Môn học:</td><td style="padding: 4px 8px;">Kiến trúc máy tính & Hợp ngữ K15 (Đề 2)</td></tr>
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Mã học phần:</td><td style="padding: 4px 8px;">CAAL240180_16_2_8506</td></tr>
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Trạng thái:</td><td style="padding: 4px 8px;"><span style="color:#0284c7; font-weight:700;">Đang làm bài</span></td></tr>
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Tổng số câu:</td><td style="padding: 4px 8px;">{total_questions} câu hỏi</td></tr>
        </table>
      </div>

      <form id="responseform" method="post" action="#" onsubmit="return false;">
{questions_html}
        <div class="page-controls">
          <button type="button" id="prevQuestionBtn" class="btn btn-outline" style="display:none;">◄ Trang trước</button>
          <div id="pageIndicatorText" style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Câu hỏi 1 / {total_questions}</div>
          <button type="button" id="nextQuestionBtn" class="btn btn-primary">Trang tiếp theo ►</button>
        </div>
      </form>
    </main>

    <aside class="exam-sidebar">
      <div class="sidebar-card">
        <h3>Điều hướng câu hỏi</h3>
        <div class="quiz-grid">
{nav_buttons_html}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); text-align: center; border-top: 1px solid #f1f5f9; padding-top: 10px;">
          Tổng số: {total_questions} câu hỏi
        </div>
      </div>
    </aside>
  </div>

  <script>
    const totalQuestions = {total_questions};
    let currentPage = 1;
    let singleQuestionMode = true;

    function getPageFromLocation() {{
      const params = new URLSearchParams(window.location.search);
      const pageParam = parseInt(params.get('page'), 10);
      if (!isNaN(pageParam) && pageParam >= 1 && pageParam <= totalQuestions) {{
        return pageParam;
      }}
      if (window.location.hash) {{
        const hashMatch = window.location.hash.match(/^#q(\\d+)$/);
        if (hashMatch) {{
          const hashPage = parseInt(hashMatch[1], 10);
          if (!isNaN(hashPage) && hashPage >= 1 && hashPage <= totalQuestions) {{
            return hashPage;
          }}
        }}
      }}
      return 1;
    }}

    function applySingleQuestionMode(enabled) {{
      singleQuestionMode = enabled;
      document.body.classList.toggle('single-mode', enabled);
      document.getElementById('btnModeSingle').classList.toggle('active', enabled);
      document.getElementById('btnModeAll').classList.toggle('active', !enabled);

      const prevBtn = document.getElementById('prevQuestionBtn');
      const nextBtn = document.getElementById('nextQuestionBtn');
      const indicator = document.getElementById('pageIndicatorText');

      if (enabled) {{
        indicator.style.display = 'block';
        showQuestion(currentPage, false);
      }} else {{
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        indicator.style.display = 'none';
        document.querySelectorAll('.que').forEach(card => card.classList.remove('current-page'));
      }}
    }}

    function showQuestion(pageNumber, updateUrl = true) {{
      if (pageNumber < 1 || pageNumber > totalQuestions) return;
      currentPage = pageNumber;

      document.querySelectorAll('.que').forEach(card => {{
        card.classList.remove('current-page');
      }});
      const targetCard = document.getElementById('q' + currentPage);
      if (targetCard) {{
        targetCard.classList.add('current-page');
      }}

      document.querySelectorAll('.qn-btn').forEach(btn => {{
        btn.classList.remove('active');
      }});
      const targetBtn = document.getElementById('nav-btn-' + currentPage);
      if (targetBtn) {{
        targetBtn.classList.add('active');
      }}

      const indicator = document.getElementById('pageIndicatorText');
      if (indicator) {{
        indicator.textContent = 'Câu hỏi ' + currentPage + ' / ' + totalQuestions;
      }}

      const prevBtn = document.getElementById('prevQuestionBtn');
      const nextBtn = document.getElementById('nextQuestionBtn');
      if (prevBtn) prevBtn.style.display = (currentPage > 1 && singleQuestionMode) ? 'inline-flex' : 'none';
      if (nextBtn) nextBtn.style.display = (currentPage < totalQuestions && singleQuestionMode) ? 'inline-flex' : 'none';

      if (updateUrl) {{
        const url = new URL(window.location.href);
        url.searchParams.set('page', currentPage);
        window.history.replaceState(null, '', url.pathname + url.search + '#q' + currentPage);
      }}

      if (targetCard && !singleQuestionMode) {{
        targetCard.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
      }}
    }}

    const bSingle = document.getElementById('btnModeSingle') || document.getElementById('btn-mode-single');
    if (bSingle) bSingle.addEventListener('click', () => applySingleQuestionMode(true));
    const bAll = document.getElementById('btnModeAll') || document.getElementById('btn-mode-all');
    if (bAll) bAll.addEventListener('click', () => applySingleQuestionMode(false));

    document.getElementById('prevQuestionBtn').addEventListener('click', () => showQuestion(currentPage - 1));
    document.getElementById('nextQuestionBtn').addEventListener('click', () => showQuestion(currentPage + 1));

    document.querySelectorAll('.qn-btn').forEach(btn => {{
      btn.addEventListener('click', (e) => {{
        e.preventDefault();
        const qNum = parseInt(btn.getAttribute('data-q'), 10);
        showQuestion(qNum);
      }});
    }});

    document.querySelectorAll('.que .answer input').forEach(input => {{
      input.addEventListener('change', () => {{
        const qCard = input.closest('.que');
        const qNum = qCard.id.replace('q', '');
        const navBtn = document.getElementById('nav-btn-' + qNum);
        if (navBtn) navBtn.classList.add('answered');

        if (input.type === 'radio') {{
          qCard.querySelectorAll('.answer .r0').forEach(row => row.classList.remove('active'));
          input.closest('div').classList.add('active');
        }} else if (input.type === 'checkbox') {{
          input.closest('div').classList.toggle('active', input.checked);
        }}
      }});
    }});

    document.querySelectorAll('.que input[type="text"], .que select').forEach(control => {{
      control.addEventListener('input', () => {{
        const qCard = control.closest('.que');
        const qNum = qCard.id.replace('q', '');
        const navBtn = document.getElementById('nav-btn-' + qNum);
        if (navBtn && control.value.trim() !== '') {{
          navBtn.classList.add('answered');
        }}
      }});
    }});

    window.addEventListener('DOMContentLoaded', () => {{
      const initialPage = getPageFromLocation();
      applySingleQuestionMode(true);
      showQuestion(initialPage, false);
    }});
  </script>
</body>
</html>
"""

with open('fixtures/moodle-ktmt-k15-de2.html', 'w', encoding='utf-8') as f:
    f.write(page_html)

print(f"Generated fixtures/moodle-ktmt-k15-de2.html successfully with {total_questions} questions!")
