#!/usr/bin/env python3
"""
Audit the wiki for quality issues.

Usage:
    python lint.py              # print report
    python lint.py --fix        # let Claude auto-fix low-severity issues
"""

import argparse
import json
import re
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


def find_broken_links(pages: dict[str, str]) -> list[dict]:
    """Fast local check for broken wikilinks before calling Claude."""
    page_names = set()
    for path in pages:
        # Normalize: strip folder prefix and .md
        name = Path(path).stem
        page_names.add(name)

    issues = []
    for path, content in pages.items():
        for link in re.findall(r"\[\[([^\]]+)\]\]", content):
            link_name = link.split("|")[0].strip()  # handle [[Name|Alias]]
            if link_name not in page_names:
                issues.append({
                    "type": "broken_link",
                    "severity": "medium",
                    "page": path,
                    "description": f'Wikilink [[{link_name}]] points to a non-existent page',
                    "suggestion": f"Create '{link_name}.md' in the appropriate folder or fix the link",
                })
    return issues


def find_orphans(pages: dict[str, str]) -> list[dict]:
    """Find pages that no other page links to."""
    incoming: dict[str, int] = {path: 0 for path in pages}
    for path, content in pages.items():
        for link in re.findall(r"\[\[([^\]]+)\]\]", content):
            link_name = link.split("|")[0].strip()
            for other_path in pages:
                if Path(other_path).stem == link_name and other_path != path:
                    incoming[other_path] += 1

    issues = []
    for path, count in incoming.items():
        if count == 0 and path != "index.md" and path != "CLAUDE.md":
            issues.append({
                "type": "orphan",
                "severity": "low",
                "page": path,
                "description": "No other page links to this page",
                "suggestion": "Add a [[wikilink]] from a relevant topic or concept page, or from index.md",
            })
    return issues


def run_claude_audit(pages: dict[str, str]) -> dict:
    wiki_content = "\n\n---\n\n".join(
        f"FILE: {path}\n{content}" for path, content in pages.items()
    )

    prompt = f"""Audit this personal wiki for content quality issues.

<wiki>
{wiki_content}
</wiki>

Check only for:
1. **Contradictions**: claims that directly conflict across pages (high severity)
2. **Missing cross-references**: a concept/entity is mentioned by name but not wikilinked [[...]], when a page exists for it (low severity)
3. **Stubs**: pages with very thin content — fewer than 5 substantive sentences (low severity)

Do NOT flag broken links or orphans (those are checked separately).

Output ONLY valid JSON, no prose or code fences:
{{
  "issues": [
    {{
      "type": "contradiction|missing_link|stub",
      "severity": "high|medium|low",
      "page": "path/to/page.md",
      "description": "specific issue",
      "suggestion": "how to fix"
    }}
  ],
  "summary": "one paragraph overall wiki health assessment"
}}

If there are no issues, return {{"issues": [], "summary": "..."}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text.strip()
    if response_text.startswith("```"):
        response_text = re.sub(r"^```[a-z]*\n?", "", response_text)
        response_text = re.sub(r"\n?```$", "", response_text)

    return json.loads(response_text)


def print_report(all_issues: list[dict], stats: dict, summary: str):
    high = [i for i in all_issues if i["severity"] == "high"]
    medium = [i for i in all_issues if i["severity"] == "medium"]
    low = [i for i in all_issues if i["severity"] == "low"]

    health = max(0, 100 - len(high) * 15 - len(medium) * 5 - len(low) * 2)

    print(f"\n{'=' * 60}")
    print(f"  Wiki Lint Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'=' * 60}")
    print(f"  Pages: {stats['total_pages']}  |  Issues: {len(all_issues)}  |  Health: {health}/100")
    print(f"{'=' * 60}\n")
    print(f"{summary}\n")

    for severity_label, issues in [("HIGH", high), ("MEDIUM", medium), ("LOW", low)]:
        if not issues:
            continue
        print(f"── {severity_label} ({len(issues)}) {'─' * 40}")
        for issue in issues:
            print(f"\n  [{issue['type']}] {issue['page']}")
            print(f"  Issue:  {issue['description']}")
            print(f"  Fix:    {issue['suggestion']}")
        print()

    return health


def save_report(all_issues: list[dict], stats: dict, summary: str, health: int):
    today = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"# Wiki Lint Report — {today}",
        f"\n**Pages:** {stats['total_pages']} | **Issues:** {len(all_issues)} | **Health:** {health}/100",
        f"\n{summary}\n",
    ]
    for sev, label in [("high", "High"), ("medium", "Medium"), ("low", "Low")]:
        group = [i for i in all_issues if i["severity"] == sev]
        if group:
            lines.append(f"## {label} Priority\n")
            for issue in group:
                lines.append(f"### [{issue['type']}] `{issue['page']}`")
                lines.append(f"**Issue:** {issue['description']}  ")
                lines.append(f"**Fix:** {issue['suggestion']}\n")

    report_path = WIKI_ROOT / "_scripts" / "lint_report.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report saved: _scripts/lint_report.md")


def main():
    parser = argparse.ArgumentParser(description="Audit the LLM Wiki")
    parser.add_argument("--fix", action="store_true", help="Not yet implemented — run lint first")
    args = parser.parse_args()

    pages = get_wiki_pages()
    if not pages:
        print("Wiki is empty. Ingest some sources first.")
        return

    print(f"Auditing {len(pages)} page(s)...")

    # Fast local checks
    broken = find_broken_links(pages)
    orphans = find_orphans(pages)

    # Claude semantic checks
    print("Running semantic audit (contradictions, stubs, missing links)...")
    claude_result = run_claude_audit(pages)

    all_issues = broken + orphans + claude_result["issues"]
    stats = {"total_pages": len(pages), "issues_found": len(all_issues)}

    health = print_report(all_issues, stats, claude_result["summary"])
    save_report(all_issues, stats, claude_result["summary"], health)


if __name__ == "__main__":
    main()
