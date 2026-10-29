import os
import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("=== COA EXAM PRACTICE DATA EXTRACTION ===")

md_path = r'C:\Users\Admin\.gemini\antigravity-ide\brain\16cd820d-b572-49eb-80b7-36a26d9ec9d2\.system_generated\steps\3155\content.md'

with open(md_path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Parse MASTER_DATA
m = re.search(r'const\s+MASTER_DATA\s*=\s*(\{[\s\S]*?\});\s*(?:\n|const|let|var|function|//)', text)
if not m:
    print("ERROR: Could not locate MASTER_DATA block!")
    sys.exit(1)

master_data = json.loads(m.group(1))

output_dir = os.path.join("data", "coa_exam_data")
os.makedirs(output_dir, exist_ok=True)

# 2. Save full raw MASTER_DATA
full_db_path = os.path.join(output_dir, "coa_master_data.json")
with open(full_db_path, "w", encoding="utf-8") as f:
    json.dump(master_data, f, ensure_ascii=False, indent=2)
print(f"Saved complete database: {full_db_path} ({len(master_data['questions'])} questions)")

# 3. Save all_questions.json
all_q_path = os.path.join(output_dir, "all_questions.json")
with open(all_q_path, "w", encoding="utf-8") as f:
    json.dump(master_data["questions"], f, ensure_ascii=False, indent=2)
print(f"Saved all questions: {all_q_path}")

# 4. Save chapters and documents metadata
chapters_meta_path = os.path.join(output_dir, "chapters_metadata.json")
with open(chapters_meta_path, "w", encoding="utf-8") as f:
    json.dump(master_data["chapters"], f, ensure_ascii=False, indent=2)

docs_meta_path = os.path.join(output_dir, "documents_metadata.json")
with open(docs_meta_path, "w", encoding="utf-8") as f:
    json.dump(master_data["documents"], f, ensure_ascii=False, indent=2)

# 5. Save by chapter
chapter_filenames = {
    "ch1": "chapter_1_computer_system_and_performance.json",
    "ch2": "chapter_2_top_level_view_of_computer_function.json",
    "ch3": "chapter_3_computer_memory_cache_internal_external.json",
    "ch4": "chapter_4_central_processing_unit.json",
    "ch5": "chapter_5_data_representation_and_computer_arithmetic.json",
    "ch6": "chapter_6_x86_assembly_and_instruction_set.json"
}

chapter_meta_dict = {ch["id"]: ch for ch in master_data["chapters"]}

questions_by_ch = {}
for q in master_data["questions"]:
    ch_id = q.get("chapterId", "unknown")
    questions_by_ch.setdefault(ch_id, []).append(q)

for ch_id, q_list in questions_by_ch.items():
    fn = chapter_filenames.get(ch_id, f"{ch_id}_questions.json")
    ch_out_path = os.path.join(output_dir, fn)
    ch_meta = chapter_meta_dict.get(ch_id, {})
    ch_bundle = {
        "chapterId": ch_id,
        "chapterNumber": ch_meta.get("number"),
        "title": ch_meta.get("title"),
        "subtitle": ch_meta.get("subtitle"),
        "totalQuestions": len(q_list),
        "topics": ch_meta.get("topics", []),
        "questions": q_list
    }
    with open(ch_out_path, "w", encoding="utf-8") as f:
        json.dump(ch_bundle, f, ensure_ascii=False, indent=2)
    print(f"  - [{ch_id}] {ch_meta.get('title')}: {len(q_list)} questions -> {fn}")

# 6. Generate a comprehensive Study/Review Markdown document
md_out_path = os.path.join(output_dir, "COA_QUESTION_BANK.md")
with open(md_out_path, "w", encoding="utf-8") as f:
    f.write("# Computer Organization & Architecture (COA) - Full Question Bank\n\n")
    f.write("> Extracted from [COA Exam Practice Studio](https://coa-exam-vercel-deploy.vercel.app/)\n")
    f.write(f"> Total questions: **{len(master_data['questions'])}** across **6 chapters**\n\n")
    
    # Table of contents
    f.write("## Table of Contents\n\n")
    for ch_id, fn in chapter_filenames.items():
        ch_meta = chapter_meta_dict.get(ch_id, {})
        q_count = len(questions_by_ch.get(ch_id, []))
        f.write(f"- [Chapter {ch_meta.get('number')}: {ch_meta.get('title')} ({q_count} questions)](#chapter-{ch_meta.get('number')}-{ch_id})\n")
    f.write("\n---\n\n")

    for ch in master_data["chapters"]:
        ch_id = ch["id"]
        ch_num = ch["number"]
        ch_title = ch["title"]
        q_list = questions_by_ch.get(ch_id, [])

        f.write(f"<a id=\"chapter-{ch_num}-{ch_id}\"></a>\n")
        f.write(f"## Chapter {ch_num}: {ch_title}\n\n")
        f.write(f"**Total Questions:** {len(q_list)}  \n")
        f.write(f"**Key Topics Covered:**\n")
        for t in ch.get("topics", []):
            f.write(f"- **{t.get('id')}**: {t.get('title')}\n")
        f.write("\n---\n\n")

        for idx, q in enumerate(q_list, 1):
            f.write(f"### Q{idx} ({q['id']}): {q.get('subtopic', '')}\n\n")
            f.write(f"- **Type / Category:** `{q.get('type')}` / `{q.get('category')}`\n")
            f.write(f"- **Difficulty:** `{q.get('difficulty')}`\n")
            f.write(f"- **Source:** {q.get('sourceDoc')} - {q.get('sourcePage')}\n")
            f.write(f"- **Concept:** {q.get('concept')}\n\n")
            
            f.write(f"**Question:**\n> {q['question']}\n\n")
            f.write("**Options:**\n")
            for o_idx, opt in enumerate(q.get("options", [])):
                letter = chr(65 + o_idx)
                is_correct = (o_idx == q.get("correctIndex"))
                prefix = "**[CORRECT]** " if is_correct else ""
                f.write(f"- {letter}. {prefix}{opt}\n")
            
            f.write(f"\n**Correct Answer:** `{chr(65 + q.get('correctIndex', 0))}`\n\n")
            
            if q.get("formula"):
                f.write(f"**Formula:**\n```\n{q['formula']}\n```\n\n")
            if q.get("stepByStep"):
                f.write(f"**Step-by-step Solution:**\n```\n{q['stepByStep']}\n```\n\n")
            
            f.write(f"**English Explanation:**\n> {q.get('explanationEn', '')}\n\n")
            f.write(f"**Giải thích tiếng Việt:**\n> {q.get('explanationVi', '')}\n\n")
            f.write("---\n\n")

print(f"Generated comprehensive markdown question bank: {md_out_path}")
print("=== EXTRACTION COMPLETE ===")
