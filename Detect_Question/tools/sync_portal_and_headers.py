import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

# The 9 official exams
exams = [
    {
        "id": "moodle-ktmt-quiz.html",
        "num": 1,
        "title": "Cuối Kỳ KTMT & Hợp Ngữ 2019",
        "subtitle": "Đề thi trắc nghiệm cuối kỳ năm 2019",
        "desc": "Bộ đề thi tổng hợp 50 câu gồm trắc nghiệm đơn, đa lựa chọn, bảng nối và câu hỏi điền đáp án số học.",
        "tags": ["Cuối kỳ", "2019", "50 câu"],
        "count": 50
    },
    {
        "id": "moodle-ktmt-2019-exam.html",
        "num": 2,
        "title": "Cuối Kỳ Môn KTMT 2019 (Đề 2)",
        "subtitle": "Đề thi chính thức môn KTMT & Hợp ngữ",
        "desc": "Đề thi chính thức 45 câu bao quát lệnh hợp ngữ 8086, cấu trúc bộ nhớ cache, ngắt và bus hệ thống.",
        "tags": ["Cuối kỳ", "2019", "45 câu"],
        "count": 45
    },
    {
        "id": "moodle-ktmt-k15-exam.html",
        "num": 3,
        "title": "Bài Thi KTMT K15 Trắc Nghiệm (Đề 1)",
        "subtitle": "Bộ đề thi KTMT cuối kỳ đề 1 khóa K15",
        "desc": "Bộ đề 45 câu dành cho sinh viên khóa K15 với các bài toán tính chu kỳ lệnh, biểu đồ flowchart và stack frame.",
        "tags": ["K15", "Đề 1", "45 câu"],
        "count": 45
    },
    {
        "id": "moodle-ktmt-k15-de2.html",
        "num": 4,
        "title": "Kiểm Tra Cuối Kỳ Đề 2 - K15",
        "subtitle": "Đề thi cuối kỳ đề 2 dành cho sinh viên K15",
        "desc": "Bộ đề 45 câu gồm câu hỏi chu kỳ lệnh, vi xử lý IA-32, bảng nhớ memory dump và thanh ghi con trỏ stack.",
        "tags": ["K15", "Đề 2", "45 câu"],
        "count": 45
    },
    {
        "id": "moodle-ktmt-lopchan-2019.html",
        "num": 5,
        "title": "Thi KTMT & Hợp Ngữ Lớp Chẵn 2019",
        "subtitle": "Đề thi cuối kỳ dành cho lớp chẵn 2019",
        "desc": "Đề thi phân loại lớp chẵn với nhiều câu hỏi ghép nối kỹ thuật bộ nhớ, cờ trạng thái PSW và chế độ địa chỉ.",
        "tags": ["Lớp chẵn", "2019", "45 câu"],
        "count": 45
    },
    {
        "id": "moodle-ktmt-midterm-gk.html",
        "num": 6,
        "title": "Online Mid Term Test No-2 HK1 2023-2024",
        "subtitle": "Đề thi giữa kỳ môn Kiến trúc máy tính HK1",
        "desc": "Đề thi online giữa kỳ HK1 năm học 2023-2024 gồm 40 câu hỏi trắc nghiệm và điền giá trị thanh ghi, cờ hiệu.",
        "tags": ["Giữa kỳ", "2023-2024", "40 câu"],
        "count": 40
    },
    {
        "id": "moodle-ktmt-thichung-2018.html",
        "num": 7,
        "title": "THI KTMT & Hợp Ngữ - Thi Chung 2018",
        "subtitle": "Đề thi chung trắc nghiệm Moodle năm 2018",
        "desc": "Đề thi chung năm 2018 gồm 42 câu với đầy đủ sơ đồ logic phân nhánh, bảng trạng thái thanh ghi và cờ hiệu.",
        "tags": ["Thi chung", "2018", "42 câu"],
        "count": 42
    },
    {
        "id": "moodle-ktmt-clc-2017.html",
        "num": 8,
        "title": "KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "subtitle": "Đề thi trắc nghiệm lớp Chất Lượng Cao 2017",
        "desc": "Bộ đề thi 53 câu bao gồm chu trình lệnh instruction cycle, bộ nhớ cache hit/miss, pipeline và bảng mã máy debug.",
        "tags": ["CLC", "2017", "53 câu"],
        "count": 53
    },
    {
        "id": "moodle-ktmt-quiz-clc-2017.html",
        "num": 9,
        "title": "Quiz KTMT & Hợp Ngữ - Nhóm CLC 2017",
        "subtitle": "Bài kiểm tra nhanh (Quiz 10 phút) Nhóm CLC 2017",
        "desc": "Bài kiểm tra 24 câu hỏi trọng tâm về định dạng số thực dấu chấm động 8-bit, phép chia số học IDIV và lệnh debug.",
        "tags": ["Quiz", "CLC 2017", "24 câu"],
        "count": 24
    }
]

total_questions = sum(e["count"] for e in exams)
print(f"Total exams: {len(exams)}, Total questions: {total_questions}")

# 1. Update index.html
cards_html = ""
for e in exams:
    tags = "".join([f'<span class="hub-tag">{t}</span>' for t in e["tags"]])
    cards_html += f"""
      <div class="hub-card">
        <div class="hub-card-header">
          <span class="hub-badge">Đề {e['num']}</span>
          <span class="hub-count">{e['count']} câu hỏi</span>
        </div>
        <h3 class="hub-card-title">{e['title']}</h3>
        <p class="hub-card-subtitle">{e['subtitle']}</p>
        <p class="hub-card-desc">{e['desc']}</p>
        <div class="hub-tags-row">
          {tags}
        </div>
        <div class="hub-card-footer">
          <a href="{e['id']}" class="hub-btn hub-btn-primary">
            Làm bài thi ngay <span>&rarr;</span>
          </a>
        </div>
      </div>"""

index_html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cổng Thi Trắc Nghiệm KTMT &amp; Hợp Ngữ - HCMUTE Moodle LMS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --primary-gradient: linear-gradient(135deg, #0284c7 0%, #1e40af 100%);
      --card-bg: #ffffff;
      --page-bg: #f8fafc;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--page-bg);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }}

    header.hub-header {{
      background: white;
      border-bottom: 2px solid var(--primary);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      position: sticky;
      top: 0;
      z-index: 100;
    }}
    .header-inner {{
      max-width: 1600px;
      margin: 0 auto;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }}
    .brand-block {{ display: flex; align-items: center; gap: 14px; }}
    .brand-logo {{
      width: 44px; height: 44px;
      background: var(--primary-gradient);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 800; font-size: 18px;
      box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);
    }}
    .brand-title h1 {{ font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; }}
    .brand-title p {{ font-size: 12px; color: var(--text-muted); }}

    .hero-banner {{
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0369a1 100%);
      color: white;
      padding: 48px 24px 56px;
      text-align: center;
    }}
    .hero-container {{ max-width: 900px; margin: 0 auto; }}
    .hero-badge {{
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
      color: #e0f2fe;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      backdrop-filter: blur(4px);
    }}
    .hero-title {{
      font-size: 32px;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }}
    .hero-subtitle {{
      font-size: 15px;
      color: #cbd5e1;
      max-width: 680px;
      margin: 0 auto 28px;
      line-height: 1.6;
    }}
    .stats-row {{
      display: flex;
      justify-content: center;
      gap: 32px;
      flex-wrap: wrap;
    }}
    .stat-item {{
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 12px 24px;
      border-radius: 12px;
      min-width: 140px;
      backdrop-filter: blur(8px);
    }}
    .stat-value {{
      font-size: 26px;
      font-weight: 800;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
    }}
    .stat-label {{
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }}

    .hub-main {{
      max-width: 1600px;
      margin: -24px auto 60px;
      padding: 0 24px;
      position: relative;
      z-index: 10;
      flex: 1;
      width: 100%;
    }}

    .hub-grid {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 20px;
    }}
    @media (max-width: 1300px) {{
      .hub-grid {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
    }}
    @media (max-width: 960px) {{
      .hub-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    }}
    @media (max-width: 600px) {{
      .hub-grid {{ grid-template-columns: 1fr; }}
    }}

    .hub-card {{
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 16px rgba(0,0,0,0.04);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }}
    .hub-card:hover {{
      transform: translateY(-4px);
      box-shadow: 0 12px 28px rgba(2, 132, 199, 0.12);
      border-color: #bae6fd;
    }}

    .hub-card-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }}
    .hub-badge {{
      background: #e0f2fe;
      color: #0369a1;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
    }}
    .hub-count {{
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 4px;
    }}

    .hub-card-title {{
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
      margin-bottom: 4px;
    }}
    .hub-card-subtitle {{
      font-size: 13px;
      color: #0284c7;
      font-weight: 500;
      margin-bottom: 10px;
    }}
    .hub-card-desc {{
      font-size: 13px;
      color: #475569;
      line-height: 1.55;
      margin-bottom: 16px;
      flex: 1;
    }}

    .hub-tags-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 18px;
    }}
    .hub-tag {{
      font-size: 11px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #64748b;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
    }}

    .hub-card-footer {{
      border-top: 1px solid #f1f5f9;
      padding-top: 14px;
    }}
    .hub-btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
    }}
    .hub-btn-primary {{
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
    }}
    .hub-btn-primary:hover {{
      background: var(--primary-hover);
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
    }}

    footer.hub-footer {{
      background: white;
      border-top: 1px solid var(--border-color);
      padding: 20px 24px;
      text-align: center;
      font-size: 13px;
      color: var(--text-muted);
      margin-top: auto;
    }}
  </style>
</head>
<body>
  <header class="hub-header">
    <div class="header-inner">
      <div class="brand-block">
        <div class="brand-logo">KTMT</div>
        <div class="brand-title">
          <h1>Đại Học Sư Phạm Kỹ Thuật TP.HCM</h1>
          <p>Hệ Thống Luyện Thi &amp; Kiểm Thử Moodle LMS - Khoa CNTT</p>
        </div>
      </div>
      <div>
        <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">9 Bộ Đề Thi Chuẩn Hóa</span>
      </div>
    </div>
  </header>

  <section class="hero-banner">
    <div class="hero-container">
      <span class="hero-badge">Trung Tâm Khảo Thí &amp; Kiểm Định Chất Lượng</span>
      <h2 class="hero-title">Cổng Điều Hướng Các Bộ Đề Thi Trắc Nghiệm</h2>
      <p class="hero-subtitle">
        Tổng hợp 9 bộ đề thi chính thức môn Kiến Trúc Máy Tính &amp; Hợp Ngữ qua các năm học.
        Hỗ trợ giao diện Moodle chuẩn hóa, chế độ làm bài 1 câu / trang và thanh điều hướng linh hoạt.
      </p>

      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value">{len(exams)}</div>
          <div class="stat-label">Bộ Đề Thi</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{total_questions}</div>
          <div class="stat-label">Tổng Số Câu Hỏi</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">100%</div>
          <div class="stat-label">Moodle Chuẩn Hóa</div>
        </div>
      </div>
    </div>
  </section>

  <main class="hub-main">
    <div class="hub-grid">
{cards_html}
    </div>
  </main>

  <footer class="hub-footer">
    <p>&copy; 2017 - 2026 HCMUTE - Bộ Môn Kỹ Thuật Máy Tính &amp; Hệ Thống Nhúng. All rights reserved.</p>
  </footer>
</body>
</html>
"""

with open('fixtures/index.html', 'w', encoding='utf-8') as f:
    f.write(index_html)
print("Updated fixtures/index.html successfully!")

# 2. Update exam-switcher across all 9 fixture HTML files
switcher_template = """<select id="exam-switcher" class="select-styled" style="font-weight: 600; padding: 6px 12px; border: 1.5px solid #0284c7; color: #0369a1; background: #f0f9ff; border-radius: 6px; cursor: pointer;" onchange="if(this.value) window.location.href=this.value;">
            <option value="moodle-ktmt-quiz.html"{sel_1}>Đề 1: Cuối Kỳ KTMT &amp; Hợp Ngữ 2019 (50 câu)</option>
            <option value="moodle-ktmt-2019-exam.html"{sel_2}>Đề 2: Cuối Kỳ Môn KTMT 2019 - Đề 2 (45 câu)</option>
            <option value="moodle-ktmt-k15-exam.html"{sel_3}>Đề 3: Kiểm Tra Cuối Kỳ Đề 1 - K15 (45 câu)</option>
            <option value="moodle-ktmt-k15-de2.html"{sel_4}>Đề 4: Kiểm Tra Cuối Kỳ Đề 2 - K15 (45 câu)</option>
            <option value="moodle-ktmt-lopchan-2019.html"{sel_5}>Đề 5: Thi KTMT &amp; Hợp Ngữ Lớp Chẵn 2019 (45 câu)</option>
            <option value="moodle-ktmt-midterm-gk.html"{sel_6}>Đề 6: Online Mid Term Test No-2 HK1 23-24 (40 câu)</option>
            <option value="moodle-ktmt-thichung-2018.html"{sel_7}>Đề 7: THI KTMT &amp; Hợp Ngữ - Thi Chung 2018 (42 câu)</option>
            <option value="moodle-ktmt-clc-2017.html"{sel_8}>Đề 8: KTMT &amp; Hợp Ngữ - Nhóm CLC 2017 (53 câu)</option>
            <option value="moodle-ktmt-quiz-clc-2017.html"{sel_9}>Đề 9: Quiz KTMT &amp; Hợp Ngữ - Nhóm CLC 2017 (24 câu)</option>
            <option value="index.html">📋 Cổng Menu Điều Hướng Tất Cả Bộ Đề</option>
          </select>"""

for idx, e in enumerate(exams, 1):
    file_path = os.path.join("fixtures", e["id"])
    if not os.path.exists(file_path):
        continue
    content = open(file_path, "r", encoding="utf-8").read()
    
    # build custom switcher with selected
    sels = {f"sel_{i}": " selected" if i == idx else "" for i in range(1, 10)}
    custom_switcher = switcher_template.format(**sels)
    
    # Replace existing exam-switcher
    new_content = re.sub(
        r'<select id=["\']exam-switcher["\'][\s\S]*?</select>',
        custom_switcher,
        content
    )
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"Synced exam-switcher in {e['id']}")
