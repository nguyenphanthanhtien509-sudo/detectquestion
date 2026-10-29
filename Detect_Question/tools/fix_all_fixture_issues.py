import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

files_info = [
    {
        "file": "moodle-ktmt-quiz.html",
        "num": 1,
        "title": "Cuối Kỳ KTMT & Hợp Ngữ 2019",
        "subject": "Kiến trúc máy tính & Hợp ngữ",
        "total": 50
    },
    {
        "file": "moodle-ktmt-2019-exam.html",
        "num": 2,
        "title": "Cuối Kỳ Môn KTMT 2019 (Đề 2)",
        "subject": "Kiến trúc máy tính & Hợp ngữ (Đề 2)",
        "total": 45
    },
    {
        "file": "moodle-ktmt-k15-exam.html",
        "num": 3,
        "title": "Bài Thi KTMT K15 Trắc Nghiệm (Đề 1)",
        "subject": "Kiến trúc máy tính & Hợp ngữ K15",
        "total": 45
    },
    {
        "file": "moodle-ktmt-k15-de2.html",
        "num": 4,
        "title": "Kiểm Tra Cuối Kỳ Đề 2 - K15",
        "subject": "Kiến trúc máy tính & Hợp ngữ K15 (Đề 2)",
        "total": 45
    },
    {
        "file": "moodle-ktmt-lopchan-2019.html",
        "num": 5,
        "title": "Thi KTMT & Hợp Ngữ Lớp Chẵn 2019",
        "subject": "Kiến trúc máy tính & Hợp ngữ - Lớp chẵn 2019",
        "total": 45
    },
    {
        "file": "moodle-ktmt-midterm-gk.html",
        "num": 6,
        "title": "Online Mid Term Test No-2 HK1 2023-2024",
        "subject": "Kiến trúc máy tính & Hợp ngữ (Nhóm 02)",
        "total": 40
    },
    {
        "file": "moodle-ktmt-thichung-2018.html",
        "num": 7,
        "title": "THI KTMT & Hợp Ngữ - Thi Chung 2018",
        "subject": "Kiến trúc máy tính & Hợp ngữ (Thi Chung 2018)",
        "total": 42
    },
    {
        "file": "moodle-ktmt-clc-2017.html",
        "num": 8,
        "title": "KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "subject": "Kiến trúc máy tính & Hợp ngữ - Nhóm 06 07 08CLC",
        "total": 53
    },
    {
        "file": "moodle-ktmt-quiz-clc-2017.html",
        "num": 9,
        "title": "Quiz KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "subject": "Quiz KTMT & Hợp ngữ - Nhóm 06 07 08CLC (08/04/2017)",
        "total": 24
    }
]

print("=== FIXING ALL ISSUES ON ALL 9 FIXTURES ===")

for info in files_info:
    fn = info["file"]
    path = os.path.join("fixtures", fn)
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. FIX EXAM SWITCHER BUTTON: Add inline onclick="toggleExamSwitcher(event)" so it NEVER fails
    html = re.sub(
        r'<button type="button" class="exam-switcher-btn" id="examSwitcherToggle"[^>]*>',
        '<button type="button" class="exam-switcher-btn" id="examSwitcherToggle" onclick="toggleExamSwitcher(event)" aria-haspopup="true" aria-expanded="false">',
        html
    )

    # 2. FIX QUESTION 1 INITIAL VISIBILITY IN HTML
    # Ensure id="q1" has class "current-page"
    def fix_q1(m):
        cls_str = m.group(1)
        if "current-page" not in cls_str:
            cls_str = cls_str.strip() + " current-page"
        return f'class="{cls_str}" id="q1"'
    html = re.sub(r'class="([^"]*que[^"]*)"\s+id="q1"', fix_q1, html, count=1)

    # 3. FIX "ĐÃ HOÀN THÀNH" / "FINISHED" IN QUESTIONS
    # In info blocks, change "Đã hoàn thành" to "Chưa trả lời"
    html = re.sub(r'<div class="state">\s*Đã hoàn thành\s*</div>', '<div class="state">Chưa trả lời</div>', html)
    html = re.sub(r'<div class="grade">\s*Đạt điểm [0-9,]+ trên [0-9,]+\s*</div>', '<div class="grade">Đạt điểm 1.00</div>', html)

    # 4. FIX EXAM HEADER META CARD: Change "Đã hoàn thành" / "Finished" to "Đang làm bài"
    # Replace Finished / Đã hoàn thành in meta tables
    html = re.sub(r'(<tr>\s*<td[^>]*>(?:Trạng thái|State):?</td>\s*<td[^>]*>)(?:Đã hoàn thành|Finished)(</td>\s*</tr>)',
                  r'\1<span style="color:#0284c7; font-weight:700;">Đang làm bài</span>\2', html, flags=re.IGNORECASE)
    
    # In k15-de2 and quiz-clc-2017, replace the old review table with standardized exam-header-card
    if fn in ["moodle-ktmt-k15-de2.html", "moodle-ktmt-quiz-clc-2017.html"]:
        std_card = f"""      <div class="exam-header-card">
        <h2>{info['title']}</h2>
        <table class="exam-meta-table">
          <tr><td class="cell-label">Môn học:</td><td>{info['subject']}</td></tr>
          <tr><td class="cell-label">Trạng thái:</td><td><span style="color:#0284c7; font-weight:700;">Đang làm bài</span></td></tr>
          <tr><td class="cell-label">Tổng số câu:</td><td>{info['total']} câu hỏi</td></tr>
        </table>
      </div>"""
        html = re.sub(r'<div class=[\'"]exam-header-card[\'"][\s\S]*?</div>\s*</div>', std_card, html, count=1)
        # Also clean any old quiz-summary-table or quiz-info-table if present
        html = re.sub(r'<table class=[\'"]generaltable quizreviewsummary[\'"][\s\S]*?</table>', '', html)

    # 5. FIX NULL POINTER CRASHES IN ĐỀ 7 (thichung-2018) & ĐỀ 8 (clc-2017)
    # Remove faulty top-level addEventListener calls on btnModeSingle / btnModeAll
    html = html.replace("document.getElementById('btnModeSingle').addEventListener('click', () => applySingleQuestionMode(true));", "")
    html = html.replace("document.getElementById('btnModeAll').addEventListener('click', () => applySingleQuestionMode(false));", "")
    html = html.replace("document.getElementById('btnModeSingle').classList.toggle", "const _b1 = document.getElementById('btnModeSingle'); if (_b1) _b1.classList.toggle")
    html = html.replace("document.getElementById('btnModeAll').classList.toggle", "const _b2 = document.getElementById('btnModeAll'); if (_b2) _b2.classList.toggle")

    # 6. FIX QUESTION VISIBILITY IN showPage FOR ĐỀ 4 (k15-de2) & ĐỀ 9 (quiz-clc-2017)
    # In showPage(p): make sure qElem.classList.add('current-page') is added when i === p!
    if "function showPage(p)" in html:
        # replace the loop body inside showPage
        old_loop = r'if\s*\(\s*isSingleMode\s*\)\s*\{\s*if\s*\(\s*i\s*===\s*p\s*\)\s*\{\s*qElem\.style\.display\s*=\s*[\'"]grid[\'"];\s*if\s*\(\s*navBtn\s*\)\s*navBtn\.classList\.add\([\'"]current[\'"]\);\s*\}\s*else\s*\{\s*qElem\.style\.display\s*=\s*[\'"]none[\'"];\s*if\s*\(\s*navBtn\s*\)\s*navBtn\.classList\.remove\([\'"]current[\'"]\);\s*\}\s*\}\s*else\s*\{\s*qElem\.style\.display\s*=\s*[\'"]grid[\'"];\s*if\s*\(\s*navBtn\s*\)\s*navBtn\.classList\.remove\([\'"]current[\'"]\);\s*\}'
        new_loop = """if (isSingleMode) {
            if (i === p) {
              qElem.classList.add('current-page');
              qElem.style.display = 'grid';
              if (navBtn) navBtn.classList.add('current');
            } else {
              qElem.classList.remove('current-page');
              qElem.style.display = 'none';
              if (navBtn) navBtn.classList.remove('current');
            }
          } else {
            qElem.classList.add('current-page');
            qElem.style.display = 'grid';
            if (navBtn) navBtn.classList.remove('current');
          }"""
        html = re.sub(old_loop, new_loop, html)

    # 7. INJECT GLOBAL toggleExamSwitcher FUNCTION
    toggle_func = """
    function toggleExamSwitcher(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const menu = document.getElementById('examSwitcherMenu');
      const container = document.querySelector('.exam-switcher-container');
      const toggle = document.getElementById('examSwitcherToggle');
      if (!menu) return;
      const isHidden = (menu.style.display === 'none' || menu.style.display === '');
      if (isHidden) {
        menu.style.display = 'block';
        const rect = menu.getBoundingClientRect();
        if (rect.right > (window.innerWidth || document.documentElement.clientWidth) - 10) {
          menu.style.left = 'auto';
          menu.style.right = '0px';
        } else {
          menu.style.left = '0px';
          menu.style.right = 'auto';
        }
      } else {
        menu.style.display = 'none';
      }
      if (container) container.classList.toggle('open', isHidden);
      if (toggle) toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    }
    window.toggleExamSwitcher = toggleExamSwitcher;
"""
    # Clean previous toggleExamSwitcher if present
    html = re.sub(r'function toggleExamSwitcher\([^\)]*\)\s*\{[\s\S]*?window\.toggleExamSwitcher\s*=\s*toggleExamSwitcher;\s*', '', html)
    # Insert before </script>
    last_script = html.rfind('</script>')
    if last_script != -1:
        html = html[:last_script] + toggle_func + '\n  ' + html[last_script:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✓ FIXED ALL: {fn}")

print("ALL FIXTURES UPDATED SUCCESSFULLY!")
