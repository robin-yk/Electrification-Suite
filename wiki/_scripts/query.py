#!/usr/bin/env python3
"""
Query the wiki with a natural language question.

Usage:
    python query.py "What is X?"
    python query.py "What is X?" --save "answer-filename"
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

import anthropic

WIKI_ROOT = Path(__file__).parent.parent
SKIP_DIRS = {"_inbox", "_sources", "_scripts", ".obsidian"}

client = anthropic.Anthropic()


def get_wiki_pages() -> dict[str, str]:
    pages = {}
    for md_file in sorted(WIKI_ROOT.rglob("*.md")):
        rel = md_file.relative_to(WIKI_ROOT)
        if rel.parts[0] in SKIP_DIRS:
            continue
        pages[str(rel)] = md_file.read_text(encoding="utf-8", errors="replace")
    return pages


def query(question: str, save_as: str | None = None):
    pages = get_wiki_pages()

    if not pages:
        print("Wiki is empty. Ingest some sources first with: python ingest.py <file>")
        return

    wiki_content = "\n\n---\n\n".join(
        f"FILE: {path}\n{content}" for path, content in pages.items()
    )

    prompt = f"""You are a knowledgeable assistant with access to a personal wiki. Answer the question using the wiki pages below.

Rules:
- Base your answer primarily on wiki content
- Cite pages inline using [Page Name] format
- Reason across multiple pages — synthesize, don't just quote
- If the wiki lacks information on an aspect, say so explicitly
- Structure your answer clearly with headers if the answer is long

<wiki>
{wiki_content}
</wiki>

Question: {question}"""

    print(f"Querying: {question}\n")
    print("─" * 60)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    answer = message.content[0].text
    print(answer)
    print("─" * 60)

    if save_as:
        today = datetime.now().strftime("%Y-%m-%d")
        save_path = WIKI_ROOT / "queries" / f"{save_as}.md"
        save_path.parent.mkdir(exist_ok=True)
        save_path.write_text(
            f"# {question}\n\n*Queried: {today}*\n\n{answer}\n",
            encoding="utf-8",
        )
        print(f"\nSaved to: queries/{save_as}.md")
        print("Add this page to index.md if it's valuable standing knowledge.")


def main():
    parser = argparse.ArgumentParser(description="Query the LLM Wiki")
    parser.add_argument("question", help="Question to ask the wiki")
    parser.add_argument("--save", metavar="FILENAME", help="Save answer as queries/<FILENAME>.md")
    args = parser.parse_args()
    query(args.question, args.save)


if __name__ == "__main__":
    main()
