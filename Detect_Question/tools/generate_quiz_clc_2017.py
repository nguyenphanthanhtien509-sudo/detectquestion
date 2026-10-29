import os
import sys
import json
import html

sys.stdout.reconfigure(encoding='utf-8')

def esc(s):
    return html.escape(str(s), quote=True)

# Define all 24 questions for Quiz CLC 2017
questions_quiz_clc = [
    {
        "num": 1,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>Given 8-bit floating point binary format: <strong>1 (sign) + 3 (exponent) + 4 (mantissa)</strong>.</p><p>Convert the 8-bit floating point number <code>57</code> (in hex) to decimal.</p>",
        "correct": "5.75"
    },
    {
        "num": 2,
        "mark": "1.50",
        "type": "dropdown",
        "qtext": """<p>A system programmer needs to divide 6247 by 300 (decimal). Instruct him to code in debug (number must be in hex) and what should the result be?</p>
<pre class="asm-code">Step 1: MOV AX, E799h
Step 2: CDW
Step 3: MOV BX, 012Ch
Step 4: IDIV BX
Result:</pre>""",
        "subparts": [
            ("Step 1:", ["MOV AX, E799h", "MOV AX, 6247h", "MOV EAX, E799h"], "MOV AX, E799h"),
            ("Step 2:", ["CDW", "CWD", "CBW"], "CDW"),
            ("Step 3:", ["MOV BX, 012Ch", "MOV BX, 300h", "MOV CX, 012Ch"], "MOV BX, 012Ch"),
            ("Step 4:", ["IDIV BX", "DIV BX", "IDIV AX"], "IDIV BX"),
            ("Result AX =", ["FFEC", "FF09", "0014", "E799"], "FFEC"),
            ("Result DX =", ["FF09", "FFEC", "002F", "012C"], "FF09")
        ]
    },
    {
        "num": 3,
        "mark": "0.50",
        "type": "short",
        "qtext": "<p>Write mask byte (in hex) to clear the lower 4 bits of a byte value with <code>AND</code> instruction.</p>",
        "correct": "F0"
    },
    {
        "num": 4,
        "mark": "0.50",
        "type": "single",
        "qtext": "<p>To isolate one or more bits in a byte value, use _______ instruction.</p>",
        "options": ["OR", "NOT", "AND", "XOR"],
        "correct": "AND"
    },
    {
        "num": 5,
        "mark": "0.25",
        "type": "short",
        "qtext": "<p>EAX now stores a 32-bit IP address of a host. The network ID (netID) is 20-bit and can be extracted from IP byte ANDing with a 32-bit mask. Write the correct instruction to extract netID from EAX register.<br><em>Note: Immediate value must be written in hex.</em></p>",
        "correct": "and EAX, FFFFF000h"
    },
    {
        "num": 6,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>The following sequence of instructions are executed. What is the correct values at watch point?</p>
<pre class="asm-code">MOV AX, 67FEh
MOV BX, AX
MOV CL, BH
MOV CH, BL
watch point:</pre>""",
        "subparts": [
            ("CX =", ["FE67", "67FE", "7E6F", "0000"], "FE67"),
            ("BX =", ["67FE", "FE67", "6700", "00FE"], "67FE")
        ]
    },
    {
        "num": 7,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>The following sequence of instructions are executed. What is the correct value of flag bits at watch point?</p>
<pre class="asm-code">MOV EAX, 12AEh
SUB EAX, 12AFh
watch point:</pre>""",
        "subparts": [
            ("Sign flag (SF) =", ["set", "reset"], "set"),
            ("Zero flag (ZF) =", ["set", "reset"], "reset"),
            ("Carry flag (CF) =", ["set", "reset"], "set")
        ]
    },
    {
        "num": 8,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>Physical address of the stack pointer is <code>2DA82h</code>, stack segment located at <code>1DAEh</code>. Compute the value of SP register (in hex):</p>",
        "correct": "FFA2"
    },
    {
        "num": 9,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": "<p>Match the following hexadecimal numbers to octal:</p>",
        "subparts": [
            ("E7 (hex) =", ["347", "156", "251", "167"], "347"),
            ("6E (hex) =", ["156", "347", "251", "176"], "156"),
            ("A9 (hex) =", ["251", "347", "156", "252"], "251")
        ]
    },
    {
        "num": 10,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>Enter debug command to fill 256 bytes in data segment starting from <code>100</code> with value <code>0D</code>:</p>",
        "correct": "f 100 1FF 0D"
    },
    {
        "num": 11,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>Given 8-bit floating point binary format: <strong>1 (sign) + 3 (exponent) + 4 (mantissa)</strong>.</p><p>Convert the 8-bit floating point number <code>E7</code> (in hex) to decimal.</p>",
        "correct": "-11.5"
    },
    {
        "num": 12,
        "mark": "1.50",
        "type": "dropdown",
        "qtext": "<p>Match the correct answer for binary operations on the left:</p>",
        "subparts": [
            ("1111111 - 111 =", ["1111000", "1100000", "1101010", "1010001"], "1111000"),
            ("1100111 - 111 =", ["1100000", "1111000", "10001100", "10011110"], "1100000"),
            ("1010101 + 10101 =", ["1101010", "1010001", "1111000", "10001100"], "1101010"),
            ("1010110 - 101 =", ["1010001", "1101010", "1100000", "10011110"], "1010001"),
            ("1110011 + 11001 =", ["10001100", "10011110", "1101010", "1111000"], "10001100"),
            ("1111111 + 11111 =", ["10011110", "10001100", "1111000", "1100000"], "10011110")
        ]
    },
    {
        "num": 13,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": "<p>Convert the following binary numbers to hexadecimal:</p>",
        "subparts": [
            ("10101001 =", ["A9", "6E", "E5", "E7"], "A9"),
            ("01101110 =", ["6E", "A9", "E5", "E7"], "6E"),
            ("11100101 =", ["E5", "A9", "6E", "E7"], "E5"),
            ("11100111 =", ["E7", "A9", "6E", "E5"], "E7")
        ]
    },
    {
        "num": 14,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>The following sequence of instructions are executed. What is the correct value of CF and OF at watch point?</p>
<pre class="asm-code">MOV AX, 140h
MOV CX, 8h
MUL CX
watch point:</pre>""",
        "subparts": [
            ("CF =", ["set", "reset"], "reset"),
            ("OF =", ["set", "reset"], "reset")
        ]
    },
    {
        "num": 15,
        "mark": "0.50",
        "type": "single",
        "qtext": "<p>To test one bit in a byte value without destructing the byte, use _______ instruction.</p>",
        "options": ["NOT", "AND", "TEST", "OR"],
        "correct": "TEST"
    },
    {
        "num": 16,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>Given a row of memory image in debug:</p>
<pre class="asm-code">0AE8:0120  13 96 D0 E0 D0 E0 A2 1E - 99 80 3E 20 99 00 75 24</pre>
<p>Initially, AX=BX=CX=DX=0, SI=121h. What are values of CX, DX after execution of the following instructions?</p>
<pre class="asm-code">MOV DX, [SI]
MOV CX, [SI+2]
watch point:</pre>""",
        "subparts": [
            ("DX =", ["D096", "D0E0", "9613", "E0D0"], "D096"),
            ("CX =", ["D0E0", "D096", "E0D0", "A21E"], "D0E0")
        ]
    },
    {
        "num": 17,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>Select correct match for register values at watch points:</p>
<pre class="asm-code">MOV AX, 152Dh
ADD AX, 003Fh
watch point #1:
ADD AH, 10
watch point #2:
......</pre>""",
        "subparts": [
            ("watch point #1 (AL) =", ["6C", "6Ch", "2D", "3F"], "6C"),
            ("watch point #2 (AH) =", ["25", "25h", "15", "1F"], "25")
        ]
    },
    {
        "num": 18,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>A memory location located in extra segment which now has value of <code>564Fh</code>. This memory is mapped by <code>ES:SI</code> register pair. SI now points to <code>905Fh</code>. Compute the physical address of this memory location (in hex):</p>",
        "correct": "5F54F"
    },
    {
        "num": 19,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>Select correct match for AL and carry flag at watch point #1:</p>
<pre class="asm-code">MOV BL, 8Ch
MOV AL, 7Eh
ADD AL, BL
watch point #1:
......</pre>""",
        "subparts": [
            ("AL =", ["0A", "0Ah", "set", "reset"], "0A"),
            ("Carry flag =", ["set", "reset"], "set")
        ]
    },
    {
        "num": 20,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>Convert the 32-bit floating point number <code>C4361000</code> (in hex) to decimal:</p>",
        "correct": "-728.25"
    },
    {
        "num": 21,
        "mark": "1.00",
        "type": "multiple",
        "qtext": "<p>Which of the following instructions are not legal addressing?</p>",
        "options": [
            "MOV AX, [DI]",
            "MOV AX, [BX+SP]",
            "MOV AX, [SP+1]",
            "MOV CX, [SI]"
        ],
        "correct": ["MOV AX, [BX+SP]", "MOV AX, [SP+1]"]
    },
    {
        "num": 22,
        "mark": "1.00",
        "type": "short",
        "qtext": "<p>Compute the physical address of stack top if stack pointer is <code>FFAEh</code> and stack segment located at <code>1DAEh</code> (in hex):</p>",
        "correct": "2DA8E"
    },
    {
        "num": 23,
        "mark": "0.50",
        "type": "short",
        "qtext": "<p>Sign extend number <code>1011 0101</code> (8-bit binary) to 16-bit binary:</p>",
        "correct": "1111111110110101"
    },
    {
        "num": 24,
        "mark": "1.00",
        "type": "dropdown",
        "qtext": """<p>The following sequence of instructions are executed. What is the correct value of AX, CX, DX at watch point?</p>
<pre class="asm-code">MOV AX, 30
MOV CX, FFFFh
MUL CX
watch point:</pre>""",
        "subparts": [
            ("CX =", ["FFFF", "FFFFh", "0030", "0000"], "FFFF"),
            ("AX =", ["FFD0", "FFD0h", "002F", "0030"], "FFD0"),
            ("DX =", ["002F", "002Fh", "FFFF", "0000"], "002F")
        ]
    }
]

print(f"Loaded {len(questions_quiz_clc)} questions for Quiz CLC 2017.")

# Build HTML for Quiz CLC 2017
exam_title = "Quiz KTMT &amp; Hợp Ngữ - Nhóm CLC (08/04/2017) - HCMUTE"

def render_question(q):
    num = q["num"]
    mark = q["mark"]
    q_type = q["type"]
    stem = q["qtext"]
    
    que_class = "que multichoice" if q_type in ["single", "multiple"] else ("que match" if q_type == "dropdown" else "que shortanswer")
    
    html_out = f"""    <div class='{que_class}{' current-page' if num == 1 else ''}' id='q{num}'>
      <div class='info'>
        <h3 class='no'>{num}</h3>
        <div class='state'>Chưa trả lời</div>
        <div class='grade'>Đạt điểm {mark}</div>
        <div class='questionflag'>Đặt cờ</div>
      </div>
      <div class='content'>
        <div class='formulation'>
          <div class='qtext'>{stem}</div>"""
          
    if q_type == "single":
        html_out += """<div class='prompt'>Select one:</div><div class='answer'>"""
        for idx, opt in enumerate(q["options"]):
            opt_id = f"q{num}_opt_{idx}"
            html_out += f"""
            <div class='r0'>
              <input type='radio' name='q{num}_ans' id='{opt_id}' value='{esc(opt)}'>
              <label for='{opt_id}'>{esc(opt)}</label>
            </div>"""
        html_out += "</div>"
    elif q_type == "multiple":
        html_out += """<div class='prompt'>Select one or more:</div><div class='answer'>"""
        for idx, opt in enumerate(q["options"]):
            opt_id = f"q{num}_opt_{idx}"
            html_out += f"""
            <div class='r0'>
              <input type='checkbox' name='q{num}_ans_{idx}' id='{opt_id}' value='{esc(opt)}'>
              <label for='{opt_id}'>{esc(opt)}</label>
            </div>"""
        html_out += "</div>"
    elif q_type == "dropdown":
        html_out += """<div class='absubpart dropdown-matching' style='margin-top: 14px; display: flex; flex-direction: column; gap: 10px;'>"""
        for idx, (label, opts, corr) in enumerate(q["subparts"], 1):
            sel_id = f"q{num}_sel_{idx}"
            html_out += f"""
              <div class='dropdown-row' style='display: flex; align-items: center; gap: 12px; flex-wrap: wrap;'>
                <span class='dropdown-label' style='font-weight: 600; min-width: 140px;'>{label}</span>
                <select id='{sel_id}' name='{sel_id}' class='form-select select-styled'>
                  <option value=''>Choose...</option>"""
            for o in opts:
                html_out += f"""<option value='{esc(o)}'>{esc(o)}</option>"""
            html_out += """
                </select>
              </div>"""
        html_out += "</div>"
    elif q_type == "short":
        html_out += f"""<div class='absubpart short-answer-part' style='margin-top: 14px; display: flex; align-items: center; gap: 10px;'>
            <label for='q{num}_ans' style='font-weight: 600; color: #475569;'>Answer:</label>
            <input type='text' id='q{num}_ans' name='q{num}_ans' class='form-control short-answer-input' placeholder='Nhập câu trả lời...' style='padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 6px; width: 280px; font-family: monospace;'>
          </div>"""
          
    html_out += """
        </div>
      </div>
    </div>
"""
    return html_out

questions_html = "\n".join([render_question(q) for q in questions_quiz_clc])
nav_grid_html = "\n".join([f'<a href="?page={i}#q{i}" class="qnbutton answered" id="qnbutton-{i}" data-qnum="{i}">{i}</a>' for i in range(1, 25)])

full_page_html = f"""<!DOCTYPE html>
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
      --border-color: #cbd5e1;
      --card-bg: #ffffff;
      --page-bg: #f8fafc;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --info-bg: #f8fafc;
      --selected-bg: #e0f2fe;
      --code-bg: #0f172a;
      --code-color: #f8fafc;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--page-bg);
      color: var(--text-main);
      line-height: 1.5;
    }}

    header.site-header {{
      background: #ffffff;
      border-bottom: 2px solid var(--primary);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      position: sticky;
      top: 0;
      z-index: 100;
    }}

    .header-inner {{
      max-width: 1360px;
      margin: 0 auto;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      flex-wrap: wrap;
    }}

    .brand-block {{ display: flex; align-items: center; gap: 14px; }}
    .brand-logo {{
      width: 44px; height: 44px;
      background: linear-gradient(135deg, #0284c7, #1e3a8a);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 18px;
      letter-spacing: 0.5px;
    }}
    .brand-title h1 {{
      font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase;
    }}
    .brand-title p {{ font-size: 12px; color: var(--text-muted); }}

    .toolbar-actions {{ display: flex; align-items: center; gap: 10px; }}
    .btn {{
      display: inline-flex; align-items: center; justify-content: center;
      padding: 7px 14px; font-size: 13px; font-weight: 500; border-radius: 6px;
      cursor: pointer; border: 1px solid transparent; transition: all 0.15s;
    }}
    .btn-primary {{ background: var(--primary); color: white; }}
    .btn-primary:hover {{ background: var(--primary-hover); }}
    .btn-outline {{ border-color: var(--border-color); background: white; color: #334155; }}
    .btn-outline:hover {{ background: #f1f5f9; }}

    .view-mode-toggle {{
      display: inline-flex;
      background: #e2e8f0;
      padding: 3px;
      border-radius: 6px;
      gap: 4px;
    }}
    .view-mode-btn {{
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: #475569;
      transition: all 0.15s;
    }}
    .view-mode-btn.active {{
      background: white;
      color: #0284c7;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }}

    .breadcrumb-nav {{
      max-width: 1360px; margin: 12px auto 0; padding: 0 20px; font-size: 12px; color: var(--text-muted);
    }}
    .breadcrumb-nav a {{ color: #0284c7; text-decoration: none; }}
    .breadcrumb-nav span {{ margin: 0 6px; color: #9ca3af; }}

    .layout-container {{
      max-width: 1360px; margin: 16px auto 50px; padding: 0 20px;
      display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 24px; align-items: start;
    }}

    @media (max-width: 1024px) {{
      .layout-container {{ grid-template-columns: 1fr; }}
      .quiz-nav-sidebar {{ order: -1; }}
    }}

    .exam-header-card {{
      background: white; border: 1px solid var(--border-color); border-radius: 8px;
      padding: 16px 22px; margin-bottom: 20px;
    }}
    .exam-header-card h2 {{
      font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 12px;
      border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;
    }}
    .exam-meta-table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    .exam-meta-table th {{
      text-align: left; padding: 6px 12px 6px 0; color: var(--text-muted);
      font-weight: 500; width: 140px; vertical-align: top;
    }}
    .exam-meta-table td {{ padding: 6px 0; color: var(--text-main); font-weight: 500; }}

    .que {{
      background: white; border: 1px solid var(--border-color); border-radius: 8px;
      margin-bottom: 24px; display: grid; grid-template-columns: 140px minmax(0, 1fr);
      overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }}
    @media (max-width: 640px) {{
      .que {{ grid-template-columns: 1fr; }}
      .que .info {{ border-right: none !important; border-bottom: 1px solid var(--border-color); }}
    }}

    .que .info {{
      background: var(--info-bg); border-right: 1px solid var(--border-color);
      padding: 18px 14px; font-size: 12px;
    }}
    .que .info .no {{ font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }}
    .que .info .state {{ color: #15803d; font-weight: 600; margin-bottom: 6px; }}
    .que .info .grade {{ color: var(--text-muted); font-size: 11px; margin-bottom: 8px; line-height: 1.4; }}
    .que .info .questionflag {{ color: #94a3b8; font-size: 11px; cursor: pointer; }}

    .que .content {{ padding: 20px 24px; min-width: 0; }}
    .que .formulation {{ font-size: 14px; line-height: 1.6; color: #1e293b; }}
    .que .qtext {{ font-weight: 500; margin-bottom: 16px; word-break: break-word; }}
    .que .prompt {{
      font-size: 12px; font-style: italic; color: var(--text-muted); margin-bottom: 12px;
    }}

    .asm-code {{
      background: var(--code-bg); color: var(--code-color);
      padding: 12px 16px; border-radius: 6px; font-family: 'JetBrains Mono', monospace;
      font-size: 13px; line-height: 1.5; margin: 10px 0; overflow-x: auto;
    }}

    .answer {{ display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }}
    .answer .r0, .answer .r1 {{
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 12px; border-radius: 6px; border: 1px solid transparent;
      cursor: pointer; transition: background 0.1s;
    }}
    .answer .r0:hover, .answer .r1:hover {{ background: #f1f5f9; }}
    .answer input[type="radio"], .answer input[type="checkbox"] {{
      margin-top: 3px; cursor: pointer; accent-color: var(--primary);
    }}
    .answer label {{ cursor: pointer; flex: 1; user-select: none; font-size: 13.5px; }}

    .select-styled {{
      padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 5px;
      font-size: 13px; background-color: white; color: #1e293b; min-width: 140px;
    }}
    .select-styled:focus {{
      outline: 2px solid var(--primary); border-color: transparent;
    }}

    .quiz-nav-sidebar {{ position: sticky; top: 76px; }}
    .nav-card {{
      background: white; border: 1px solid var(--border-color); border-radius: 8px;
      padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }}
    .nav-card h3 {{ font-size: 14px; font-weight: 700; margin-bottom: 14px; color: #0f172a; }}

    .qn_buttons {{
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 16px;
    }}
    .qnbutton {{
      display: flex; align-items: center; justify-content: center;
      height: 34px; font-size: 12px; font-weight: 600; text-decoration: none;
      color: #334155; background: #f8fafc; border: 1px solid var(--border-color);
      border-radius: 4px; transition: all 0.1s;
    }}
    .qnbutton:hover {{ background: #e2e8f0; color: #0f172a; }}
    .qnbutton.current {{
      background: var(--primary); color: white; border-color: var(--primary);
    }}
    .qnbutton.answered {{
      background: #e0f2fe; border-color: #7dd3fc; color: #0369a1;
    }}

    .pagination-bar {{
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);
    }}
  </style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <div class="brand-block">
        <div class="brand-logo">CLC</div>
        <div class="brand-title">
          <h1>HCMUTE - Online Examination System</h1>
          <p>Khoa CNTT - Môn Kiến Trúc Máy Tính &amp; Hợp Ngữ (Nhóm CLC)</p>
        </div>
      </div>
      <div class="toolbar-actions">
        <div class="exam-selector" style="display: flex; align-items: center; gap: 8px;">
          <label for="exam-switcher" style="font-size: 12px; font-weight: 600; color: #475569;">Bộ đề:</label>
          <select id="exam-switcher" class="select-styled" style="font-weight: 600; padding: 6px 12px; border: 1.5px solid #0284c7; color: #0369a1; background: #f0f9ff; border-radius: 6px; cursor: pointer;" onchange="if(this.value) window.location.href=this.value;">
            <option value="moodle-ktmt-quiz.html">Đề 1: Cuối Kỳ KTMT &amp; Hợp Ngữ 2019 (50 câu)</option>
            <option value="moodle-ktmt-2019-exam.html">Đề 2: Cuối Kỳ Môn KTMT 2019 - Đề 2 (45 câu)</option>
            <option value="moodle-ktmt-k15-exam.html">Đề 3: Kiểm Tra Cuối Kỳ Đề 1 - K15 (45 câu)</option>
            <option value="moodle-ktmt-k15-de2.html">Đề 4: Kiểm Tra Cuối Kỳ Đề 2 - K15 (45 câu)</option>
            <option value="moodle-ktmt-lopchan-2019.html">Đề 5: Thi KTMT &amp; Hợp Ngữ Lớp Chẵn 2019 (45 câu)</option>
            <option value="moodle-ktmt-midterm-gk.html">Đề 6: Online Mid Term Test No-2 HK1 23-24 (40 câu)</option>
            <option value="moodle-ktmt-thichung-2018.html">Đề 7: THI KTMT &amp; Hợp Ngữ - Thi Chung 2018 (42 câu)</option>
            <option value="moodle-ktmt-clc-2017.html">Đề 8: KTMT &amp; Hợp Ngữ - Nhóm CLC 2017 (53 câu)</option>
            <option value="moodle-ktmt-quiz-clc-2017.html" selected>Đề 9: Quiz KTMT &amp; Hợp Ngữ - Nhóm CLC 2017 (24 câu)</option>
            <option value="index.html">📋 Cổng Menu Điều Hướng Tất Cả Bộ Đề</option>
          </select>
        </div>
        <div class="view-mode-toggle">
          <button id="mode-single" class="view-mode-btn active" title="Hiển thị từng câu">Một câu / trang</button>
          <button id="mode-all" class="view-mode-btn" title="Hiển thị tất cả 24 câu">Toàn bộ đề</button>
        </div>
        <a href="index.html" class="btn btn-outline" style="text-decoration: none; font-weight: 600;">Menu Đề</a>
      </div>
    </div>
  </header>

  <nav class="breadcrumb-nav">
    <a href="index.html">NHÀ CỦA TÔI</a> <span>►</span>
    <a href="#">CÁC KHOÁ HỌC CỦA TÔI</a> <span>►</span>
    <a href="#">HỌC KỲ 2 NĂM HỌC 2016 2017</a> <span>►</span>
    <a href="#">Nhóm 06 07 08CLC Kiến trúc máy tính và hợp ngữ</a> <span>►</span>
    <a href="#">Bài kiểm tra nhanh (Quiz)</a>
  </nav>

  <div class="layout-container">
    <main class="quiz-content-area">
      <div class="exam-header-card" style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px 22px; margin-bottom: 20px;">
        <h2 style="font-size: 19px; color: #0f172a; margin-bottom: 6px;">Quiz KTMT &amp; Hợp Ngữ - Nhóm CLC 2017</h2>
        <table class="exam-meta-table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Môn học:</td><td style="padding: 4px 8px;">Quiz KTMT & Hợp ngữ - Nhóm 06 07 08CLC (08/04/2017)</td></tr>
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Thời gian:</td><td style="padding: 4px 8px;">10 phút</td></tr>
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Trạng thái:</td><td style="padding: 4px 8px;"><span style="color:#0284c7; font-weight:700;">Đang làm bài</span></td></tr>
          <tr><td class="cell-label" style="font-weight: 600; width: 160px; color: #475569; padding: 4px 8px;">Tổng số câu:</td><td style="padding: 4px 8px;">24 câu hỏi</td></tr>
        </table>
      </div>

      <form id="responseform" method="post" action="#" onsubmit="return false;">
{questions_html}
        <div class="pagination-bar">
          <button type="button" id="btn-prev" class="btn btn-outline" style="display:none;">◄ Trang trước</button>
          <div style="flex:1;"></div>
          <button type="button" id="btn-next" class="btn btn-primary">Trang tiếp ►</button>
          <a href="#" id="btn-finish" class="btn btn-outline" style="display:none; margin-left: 10px;">Finish review...</a>
        </div>
      </form>
    </main>

    <aside class="quiz-nav-sidebar">
      <div class="nav-card">
        <h3>Điều hướng câu hỏi</h3>
        <div class="qn_buttons" id="quiz-nav-grid">
{nav_grid_html}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); text-align: center; border-top: 1px solid #f1f5f9; padding-top: 10px;">
          Tổng số: 24 câu hỏi
        </div>
      </div>
    </aside>
  </div>

  <script>
    (function() {{
      const TOTAL_QUESTIONS = 24;
      let currentPage = 1;
      let isSingleMode = true;

      function getUrlPage() {{
        const params = new URLSearchParams(window.location.search);
        const p = parseInt(params.get('page'), 10);
        if (!isNaN(p) && p >= 1 && p <= TOTAL_QUESTIONS) return p;
        if (window.location.hash) {{
          const m = window.location.hash.match(/^#q(\\d+)$/);
          if (m) {{
            const h = parseInt(m[1], 10);
            if (!isNaN(h) && h >= 1 && h <= TOTAL_QUESTIONS) return h;
          }}
        }}
        return 1;
      }}

      function showPage(p) {{
        currentPage = p;
        for (let i = 1; i <= TOTAL_QUESTIONS; i++) {{
          const qElem = document.getElementById('q' + i);
          const navBtn = document.getElementById('qnbutton-' + i);
          if (!qElem) continue;

          if (isSingleMode) {{
            if (i === p) {{
              qElem.classList.add('current-page');
              qElem.style.display = 'grid';
              if (navBtn) navBtn.classList.add('current');
            }} else {{
              qElem.classList.remove('current-page');
              qElem.style.display = 'none';
              if (navBtn) navBtn.classList.remove('current');
            }}
          }} else {{
            qElem.classList.add('current-page');
            qElem.style.display = 'grid';
            if (navBtn) navBtn.classList.remove('current');
          }}
        }}

        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');
        const btnFinish = document.getElementById('btn-finish');

        if (isSingleMode) {{
          btnPrev.style.display = p > 1 ? 'inline-flex' : 'none';
          btnNext.style.display = p < TOTAL_QUESTIONS ? 'inline-flex' : 'none';
          btnFinish.style.display = p === TOTAL_QUESTIONS ? 'inline-flex' : 'none';
        }} else {{
          btnPrev.style.display = 'none';
          btnNext.style.display = 'none';
          btnFinish.style.display = 'inline-flex';
        }}
      }}

      document.getElementById('btn-prev').addEventListener('click', () => {{
        if (currentPage > 1) {{
          showPage(currentPage - 1);
          window.location.hash = 'q' + currentPage;
        }}
      }});

      document.getElementById('btn-next').addEventListener('click', () => {{
        if (currentPage < TOTAL_QUESTIONS) {{
          showPage(currentPage + 1);
          window.location.hash = 'q' + currentPage;
        }}
      }});

      document.querySelectorAll('#quiz-nav-grid .qnbutton').forEach(btn => {{
        btn.addEventListener('click', (e) => {{
          e.preventDefault();
          const qn = parseInt(btn.getAttribute('data-qnum'), 10);
          showPage(qn);
          window.location.hash = 'q' + qn;
        }});
      }});

      const bSingle = document.getElementById('mode-single') || document.getElementById('btn-mode-single');
      if (bSingle) bSingle.addEventListener('click', () => {{
        isSingleMode = true;
        bSingle.classList.add('active');
        const bAll = document.getElementById('mode-all') || document.getElementById('btn-mode-all');
        if (bAll) bAll.classList.remove('active');
        showPage(currentPage);
      }});

      const bAll = document.getElementById('mode-all') || document.getElementById('btn-mode-all');
      if (bAll) bAll.addEventListener('click', () => {{
        isSingleMode = false;
        bAll.classList.add('active');
        const bSingle = document.getElementById('mode-single') || document.getElementById('btn-mode-single');
        if (bSingle) bSingle.classList.remove('active');
        showPage(currentPage);
      }});

      window.addEventListener('hashchange', () => {{
        showPage(getUrlPage());
      }});

      showPage(getUrlPage());
    }})();
  </script>
</body>
</html>
"""

with open('fixtures/moodle-ktmt-quiz-clc-2017.html', 'w', encoding='utf-8') as f:
    f.write(full_page_html)

print("Generated fixtures/moodle-ktmt-quiz-clc-2017.html successfully!")
