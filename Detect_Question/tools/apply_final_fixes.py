import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("=== APPLYING FINAL COMPREHENSIVE FIXES ===")

# 1. FIX "Đã hoàn thành" -> "Đang làm bài" in all fixtures
all_fixtures = [
    "moodle-ktmt-quiz.html",
    "moodle-ktmt-2019-exam.html",
    "moodle-ktmt-k15-exam.html",
    "moodle-ktmt-k15-de2.html",
    "moodle-ktmt-lopchan-2019.html",
    "moodle-ktmt-midterm-gk.html",
    "moodle-ktmt-thichung-2018.html",
    "moodle-ktmt-clc-2017.html",
    "moodle-ktmt-quiz-clc-2017.html"
]

for fn in all_fixtures:
    fpath = os.path.join("fixtures", fn)
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace any "Đã hoàn thành" in meta tables or spans
    content = content.replace("Đã hoàn thành", "Đang làm bài")
    content = content.replace("Finished", "Đang làm bài")

    # In question info state: if any says "Đang làm bài", it should be "Chưa trả lời"
    content = re.sub(r'<div class="state">\s*Đang làm bài\s*</div>', '<div class="state">Chưa trả lời</div>', content)
    content = re.sub(r'<div class="state unanswered">\s*Đang làm bài\s*</div>', '<div class="state unanswered">Chưa trả lời</div>', content)

    # Write back
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Cleaned states in: {fn}")


# 2. UNIFY HEADER ON moodle-ktmt-quiz-clc-2017.html
from unify_all_headers import generate_header_html, CSS_HEADER_BLOCK, exams

quiz_clc_meta = next(e for e in exams if e["id"] == "moodle-ktmt-quiz-clc-2017.html")
quiz_clc_path = os.path.join("fixtures", "moodle-ktmt-quiz-clc-2017.html")

with open(quiz_clc_path, "r", encoding="utf-8") as f:
    q_html = f.read()

# Ensure body has class="single-question-mode"
if 'class="single-question-mode"' not in q_html:
    q_html = re.sub(r'<body([^>]*)>', r'<body\1 class="single-question-mode">', q_html, count=1)
    q_html = re.sub(r'class="([^"]*)"\s+class="single-question-mode"', r'class="\1 single-question-mode"', q_html)

# Replace <header class="site-header">...</header>
new_header_html = generate_header_html(quiz_clc_meta)
# Make sure toggle has onclick="toggleExamSwitcher(event)"
new_header_html = new_header_html.replace(
    'id="examSwitcherToggle"',
    'id="examSwitcherToggle" onclick="toggleExamSwitcher(event)"'
)
q_html = re.sub(r'<header class=[\'"]site-header[\'"][\s\S]*?</header>', new_header_html, q_html, count=1)

# Inject unified CSS into style
if '/* === UNIFIED MOODLE HEADER CSS === */' not in q_html:
    q_html = q_html.replace('</style>', CSS_HEADER_BLOCK + '\n  </style>', 1)

# Make sure toggleExamSwitcher is present in script
switcher_js = """
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

    function setMode(singlePage) {
      singlePage = Boolean(singlePage);
      isSingleMode = singlePage;
      document.body.classList.toggle('single-question-mode', singlePage);
      const btnSingle = document.getElementById('btn-mode-single') || document.getElementById('mode-single');
      const btnAll = document.getElementById('btn-mode-all') || document.getElementById('mode-all');
      if (btnSingle) btnSingle.classList.toggle('active', singlePage);
      if (btnAll) btnAll.classList.toggle('active', !singlePage);
      showPage(currentPage);
    }
    window.setMode = setMode;

    function resetForm() {
      const form = document.querySelector('form');
      if (form) form.reset();
      document.querySelectorAll('.que input[type="text"]').forEach(i => i.value = '');
      document.querySelectorAll('.que select').forEach(s => s.selectedIndex = 0);
      document.querySelectorAll('.qnbutton').forEach(b => b.classList.remove('answered'));
      setMode(true);
    }
    window.resetForm = resetForm;

    function triggerDetectTest() {
      if (typeof window.ExamDomScanner !== 'undefined') {
        const detected = window.ExamDomScanner.scanAll();
        alert('Extension ExamDomScanner phát hiện thành công: ' + detected.length + ' câu hỏi!');
      } else {
        const visibleQue = document.querySelectorAll('.que.current-page, .que:not([style*="display: none"])');
        alert('Đang hiển thị ' + visibleQue.length + ' câu hỏi (Chế độ 1 câu/trang). Sẵn sàng để Extension quét!');
      }
    }
    window.triggerDetectTest = triggerDetectTest;
"""

if 'function toggleExamSwitcher' not in q_html:
    last_script = q_html.rfind('</script>')
    if last_script != -1:
        q_html = q_html[:last_script] + switcher_js + '\n  ' + q_html[last_script:]

with open(quiz_clc_path, "w", encoding="utf-8") as f:
    f.write(q_html)
print("Updated moodle-ktmt-quiz-clc-2017.html with unified header & switcher!")


# 3. VERIFY QUESTION 1 ON ALL 9 FIXTURES HAS class="current-page"
for fn in all_fixtures:
    fpath = os.path.join("fixtures", fn)
    with open(fpath, "r", encoding="utf-8") as f:
        c = f.read()
    
    # Check if id="q1" has current-page
    m = re.search(r'<div\s+class=[\'"]([^\'"]*que[^\'"]*)[\'"]\s+id=[\'"]q1[\'"]', c)
    if not m:
        m = re.search(r'<div\s+id=[\'"]q1[\'"]\s+class=[\'"]([^\'"]*que[^\'"]*)[\'"]', c)
    
    if m:
        cls_val = m.group(1)
        if "current-page" not in cls_val:
            print(f"Adding current-page to q1 in {fn}")
            new_cls = cls_val.strip() + " current-page"
            c = c.replace(m.group(0), m.group(0).replace(cls_val, new_cls))
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(c)
        else:
            print(f"✓ q1 already has current-page in {fn}")
    else:
        print(f"⚠️ WARNING: q1 div not found in {fn}!")

print("\n=== FINAL FIXES COMPLETE ===")
