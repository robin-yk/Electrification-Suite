# LLM Wiki — Schema & Operating Guide

This file governs everything about this wiki. Read it in full before performing any operation.

---

## Purpose

This is a personal, compounding knowledge base maintained by an LLM. It synthesizes raw sources into interlinked wiki pages so that knowledge accumulates over time rather than being re-derived on every query. Cross-references are pre-built. Contradictions are flagged. The human curates; the LLM does bookkeeping.

---

## Folder Structure

| Path | Contents |
|------|----------|
| `concepts/` | Definitions, mechanisms, frameworks, ideas |
| `entities/` | People, organizations, projects, products |
| `topics/` | High-level topic overviews that link out to concepts and entities |
| `queries/` | Saved answers to important questions (become permanent knowledge) |
| `_inbox/` | Drop new source files here for ingestion |
| `_sources/` | Archived original sources (read-only after ingest) |
| `_scripts/` | Python scripts for ingest, query, lint |
| `index.md` | Master index — every page is reachable from here |
| `CLAUDE.md` | This file — the wiki schema |

---

## Page Types & Templates

### Concept Page (`concepts/`)
```markdown
# [Concept Name]

**Type:** Concept  
**Tags:** #concept #[domain]  
**Related:** [[Related Concept]], [[Another Concept]]

## Definition
One-paragraph precise definition.

## How It Works
Mechanism, process, or logic. Use subheadings if needed.

## Key Properties
- Property 1
- Property 2

## Connections
- **Contrast with:** [[Opposing Concept]] — brief note on difference
- **Enables:** [[Downstream Concept]]
- **Part of:** [[Parent Topic]]

## Open Questions
- Unresolved questions or things to investigate further

## Sources
- [Source Title](../_sources/filename) — date ingested
```

### Entity Page (`entities/`)
```markdown
# [Entity Name]

**Type:** Entity — Person | Organization | Project | Product  
**Tags:** #entity #[type] #[domain]  
**Related:** [[Related Entity]], [[Relevant Topic]]

## Overview
Brief factual summary (who/what, role, significance).

## Key Facts
- Founded/Born: ...
- Domain: ...
- Notable for: ...

## Contributions / Work
Major outputs, ideas, or impact.

## Relationships
- **Works with:** [[Other Entity]]
- **Created:** [[Project or Concept]]
- **Part of:** [[Organization]]

## Sources
- [Source Title](../_sources/filename) — date ingested
```

### Topic Page (`topics/`)
```markdown
# [Topic Name]

**Type:** Topic  
**Tags:** #topic #[domain]  
**Related:** [[Related Topic]]

## Overview
What this topic is about and why it matters.

## Key Concepts
- [[Concept A]] — one-line summary
- [[Concept B]] — one-line summary

## Key Entities
- [[Person or Org]] — role in this topic

## Subtopics
- [[Subtopic A]]
- [[Subtopic B]]

## Open Questions
Unresolved questions at the frontier of this topic.

## Sources
- [Source Title](../_sources/filename) — date ingested
```

---

## Naming Conventions

- **Files:** `Title Case With Spaces.md` (Obsidian wikilinks work natively)
- **Concepts:** noun phrases — `Attention Mechanism.md`, `Gradient Descent.md`
- **Entities:** proper name — `Andrej Karpathy.md`, `OpenAI.md`
- **Topics:** broad area — `Large Language Models.md`, `Reinforcement Learning.md`
- **No abbreviations** in filenames — spell it out so links are unambiguous

---

## Cross-Reference Rules

1. Every page must link to **at least 3 other pages** using `[[Page Name]]`
2. Use the exact filename (without `.md`) inside `[[...]]`
3. When mentioning an entity or concept that has a page, **always** wikilink it on first mention
4. Bidirectional links: if A links to B, add A to B's **Related** or **Connections** section
5. `index.md` must list every page — update it on every ingest

---

## Tagging Convention (Obsidian)

- Domain tags: `#ml`, `#biology`, `#finance`, `#history`, `#philosophy`, etc.
- Type tags: `#concept`, `#entity`, `#topic`
- Status tags: `#stub` (thin content, needs expansion), `#contradiction` (flagged conflict)

---

## Ingest Protocol

When ingesting a new source:

1. Read the source fully
2. Identify: key concepts, key entities, key claims, key relationships
3. For each item, decide: does a page exist? → update it; or create new?
4. Minimum **10 page operations** for any substantial source (article, paper, chapter)
5. Add source citation to every page touched
6. Update `index.md` with any new pages
7. Flag contradictions with `#contradiction` and note conflicting claims inline
8. Prefer **depth** over breadth: update existing pages richly rather than creating many thin stubs

---

## Query Protocol

When answering a query:

1. Search the wiki for relevant pages
2. Synthesize across pages — don't just quote, reason across them
3. Cite specific pages: `[Page Name]`
4. Note if the wiki lacks information on an aspect
5. If the answer is valuable standing knowledge, offer to save it as a `queries/` page

---

## Lint Protocol

When auditing the wiki, check for:

- **Contradictions**: conflicting claims across pages — tag `#contradiction`
- **Orphans**: pages with no incoming links (not linked from any other page)
- **Broken links**: `[[wikilinks]]` pointing to non-existent pages
- **Missing links**: concept/entity mentioned by name but not wikilinked, when a page exists
- **Stubs**: pages with fewer than 5 substantive bullet points / sentences — tag `#stub`
- **Stale sources**: claims that may have been superseded

---

## Contradiction Handling

When two sources disagree:

1. Note the contradiction inline on the relevant page under `## Contradictions`
2. State both claims with their sources
3. Tag the page `#contradiction`
4. Add the page to `index.md` under a `## Contradictions` section
5. Do NOT silently pick one — preserve the conflict for human resolution

---

## What NOT to Do

- Do not delete existing content without flagging it as superseded
- Do not create pages with only a title and no content (use `#stub` with at least 2 sentences)
- Do not use external URLs as links in page body — only `[[wikilinks]]` for cross-refs and `../_sources/` for source citations
- Do not rename existing pages without updating all wikilinks that point to them
