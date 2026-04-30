#!/usr/bin/env python3
"""
Ingest a source document into the wiki.

Usage:
    python ingest.py <file>          # ingest a specific file
    python ingest.py                 # ingest everything in _inbox/
"""

import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import anthropic

WIKI_ROOT = Path(__file__).parent.parent
INBOX_DIR = WIKI_ROOT / "_inbox"
SOURCES_DIR = WIKI_ROOT / "_sources"
SCHEMA_FILE = WIKI_ROOT / "CLAUDE.md"

SKIP_DIRS = {"_inbox", "_sources", "_scripts", ".obsidian"}

client = anthropic.Anthropic()


def get_existing_pages() -> dict[str, str]:
    pages = {}
    for md_file in sorted(WIKI_ROOT.rglob("*.md")):
        rel = md_file.relative_to(WIKI_ROOT)
        if rel.parts[0] in SKIP_DIRS:
            continue
        pages[str(rel)] = md_file.read_text(encoding="utf-8", errors="replace")
    return pages


def build_pages_context(pages: dict[str, str]) -> str:
    if not pages:
        return "(no pages yet — this is the first ingest)"
    parts = []
    for path, content in pages.items():
        # Truncate very long pages to keep context manageable
        body = content if len(content) < 1500 else content[:1500] + "\n...[truncated]"
        parts.append(f"FILE: {path}\n{body}")
    return "\n\n---\n\n".join(parts)


def apply_page_updates(page_ops: list[dict]) -> int:
    count = 0
    for op in page_ops:
        path_str = op.get("path", "").strip()
        action = op.get("action", "create")
        content = op.get("content", "")

        if not path_str or not content:
            continue

        page_path = WIKI_ROOT / path_str
        page_path.parent.mkdir(parents=True, exist_ok=True)

        if action == "append" and page_path.exists():
            existing = page_path.read_text(encoding="utf-8")
            page_path.write_text(existing.rstrip() + "\n\n" + content, encoding="utf-8")
        else:
            page_path.write_text(content, encoding="utf-8")

        verb = "Updated" if action == "update" else ("Appended" if action == "append" else "Created")
        print(f"  {verb}: {path_str}")
        count += 1
    return count


def ingest_file(source_path: Path):
    if not source_path.exists():
        print(f"Error: file not found: {source_path}")
        sys.exit(1)

    schema = SCHEMA_FILE.read_text(encoding="utf-8")
    source_content = source_path.read_text(encoding="utf-8", errors="replace")
    existing_pages = get_existing_pages()
    pages_context = build_pages_context(existing_pages)
    today = datetime.now().strftime("%Y-%m-%d")

    prompt = f"""You are maintaining an Obsidian personal wiki. Study the schema carefully, then ingest the source.

<schema>
{schema}
</schema>

<existing_wiki_pages>
{pages_context}
</existing_wiki_pages>

<source filename="{source_path.name}" ingested="{today}">
{source_content}
</source>

Your task:
1. Extract every significant concept, entity, and topic from the source
2. Create new wiki pages or update existing ones — minimum 10 page operations for substantial sources
3. Use Obsidian wikilinks [[Exact Page Name]] for ALL cross-references
4. Every page must link to at least 3 other pages
5. Update index.md to list every new page under its correct section
6. Add source citation to every page you touch: `- [{source_path.name}](../_sources/{source_path.name}) — {today}`
7. If the source contradicts an existing page, note it under `## Contradictions` and add `#contradiction` tag

Respond with ONLY a valid JSON object — no prose, no code fences:
{{
  "pages": [
    {{
      "path": "concepts/Example Concept.md",
      "action": "create",
      "content": "full markdown content"
    }},
    {{
      "path": "index.md",
      "action": "update",
      "content": "full updated index.md content"
    }}
  ],
  "summary": "one-sentence description of what was ingested"
}}

Actions: "create" (new file), "update" (replace entire file), "append" (add to end).
Always include index.md as the last operation."""

    print(f"\nIngesting: {source_path.name}")
    print(f"Existing pages: {len(existing_pages)}")
    print("Calling Claude (this may take 30–60s for large sources)...")

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text.strip()

    # Strip markdown code fences if Claude wrapped the JSON
    if response_text.startswith("```"):
        response_text = re.sub(r"^```[a-z]*\n?", "", response_text)
        response_text = re.sub(r"\n?```$", "", response_text)

    try:
        result = json.loads(response_text)
    except json.JSONDecodeError as e:
        print(f"\nError: Claude returned invalid JSON.\nRaw response saved to _scripts/last_response.txt")
        (WIKI_ROOT / "_scripts" / "last_response.txt").write_text(response_text)
        raise e

    pages_written = apply_page_updates(result["pages"])

    # Archive the source
    SOURCES_DIR.mkdir(exist_ok=True)
    dest = SOURCES_DIR / source_path.name
    if dest.exists():
        dest = SOURCES_DIR / f"{source_path.stem}_{today}{source_path.suffix}"
    shutil.move(str(source_path), str(dest))

    print(f"\n✓ Ingested {pages_written} page(s) — {result['summary']}")
    print(f"  Source archived to: _sources/{dest.name}")


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        if not path.is_absolute():
            path = Path.cwd() / path
        ingest_file(path)
    else:
        INBOX_DIR.mkdir(exist_ok=True)
        files = [f for f in INBOX_DIR.iterdir() if f.is_file() and not f.name.startswith(".")]
        if not files:
            print("No files in _inbox/. Drop files there, or run: python ingest.py <file>")
            return
        for f in sorted(files):
            ingest_file(f)
        print(f"\nAll done. Processed {len(files)} file(s).")


if __name__ == "__main__":
    main()
