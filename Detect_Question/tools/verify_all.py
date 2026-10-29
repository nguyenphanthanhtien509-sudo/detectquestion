import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

fixtures = [
    ("moodle-ktmt-quiz.html", 1, 50),
    ("moodle-ktmt-2019-exam.html", 2, 45),
    ("moodle-ktmt-k15-exam.html", 3, 45),
    ("moodle-ktmt-k15-de2.html", 4, 45),
    ("moodle-ktmt-lopchan-2019.html", 5, 45),
    ("moodle-ktmt-midterm-gk.html", 6, 40),
    ("moodle-ktmt-thichung-2018.html", 7, 42),
    ("moodle-ktmt-clc-2017.html", 8, 53),
    ("moodle-ktmt-quiz-clc-2017.html", 9, 24)
]

for fn, num, expected_count in fixtures:
    path = os.path.join("fixtures", fn)
    with open(path, "r", encoding="utf-8") as f:
        c = f.read()

    # Ensure onclick on examSwitcherToggle
    if 'id="examSwitcherToggle"' in c and 'onclick="toggleExamSwitcher(event)"' not in c:
        c = c.replace('id="examSwitcherToggle"', 'id="examSwitcherToggle" onclick="toggleExamSwitcher(event)"')
        with open(path, "w", encoding="utf-8") as f:
            f.write(c)

    # Verification checks
    completed_matches = len(re.findall(r'Đã hoàn thành', c, re.IGNORECASE))
    finished_matches = len(re.findall(r'\bFinished\b', c, re.IGNORECASE))
    
    # Question count
    q_matches = re.findall(r'<div class=[\'"][^\'"]*que[^\'"]*[\'"] id=[\'"]q(\d+)[\'"]', c)
    total_found = len(q_matches)

    # Check q1 visibility
    q1_has_current = bool(re.search(r'class=[\'"][^\'"]*current-page[^\'"]*[\'"][^>]*id=[\'"]q1[\'"]|id=[\'"]q1[\'"][^>]*class=[\'"][^\'"]*current-page[^\'"]*[\'"]', c))

    # Switcher items count
    switcher_items = re.findall(r'<a href="([^"]+)" class="switcher-item', c)

    print(f"[{fn}] (Đề {num}):")
    print(f"  - Questions: {total_found}/{expected_count} (q1 present: {'1' in q_matches}, q1 current-page: {q1_has_current})")
    print(f"  - 'Đã hoàn thành': {completed_matches}, 'Finished': {finished_matches}")
    print(f"  - Switcher items: {len(switcher_items)} links, Toggle onclick: {'onclick=\"toggleExamSwitcher(event)\"' in c}")
    print(f"  - Toggle function defined: {'function toggleExamSwitcher' in c}")
