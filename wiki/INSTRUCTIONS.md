# LLM Wiki — Setup & Usage Guide

A personal knowledge base that Claude maintains for you. You add sources; Claude builds and updates the wiki.

---

## One-Time Setup (5 minutes)

### 1. Install Python dependencies

```bash
cd wiki/_scripts
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Set your Anthropic API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Add that line to your shell profile (`~/.zshrc` or `~/.bashrc`) so it persists.

### 3. Open in Obsidian

File → Open Vault → select the `wiki/` folder. You'll see the folder tree on the left.

---

## Daily Usage

### Ingest a new source

Drop any text file (`.md`, `.txt`, `.pdf` text content) into `wiki/_inbox/`, then run:

```bash
cd wiki/_scripts && source venv/bin/activate
python ingest.py
```

Or ingest a specific file directly:

```bash
python ingest.py ~/Downloads/some-paper.txt
```

Claude will:
- Read the source
- Create/update 10–20 wiki pages
- Add cross-references throughout
- Archive the source to `_sources/`

**Tip:** For PDFs, first extract the text: `pdftotext paper.pdf paper.txt`, then ingest the `.txt`.

---

### Query the wiki

```bash
python query.py "What are the key differences between X and Y?"
```

Save a valuable answer as a permanent wiki page:

```bash
python query.py "How does attention work?" --save "how-attention-works"
```

The saved page appears in `wiki/queries/` and is visible in Obsidian.

---

### Audit the wiki (run monthly or after many ingests)

```bash
python lint.py
```

This checks for:
- Contradictions between pages
- Broken wikilinks
- Orphaned pages (no incoming links)
- Stubs needing expansion

Results print to terminal and save to `_scripts/lint_report.md`.

---

## What to Ingest

Anything text-based works well:
- **Articles / blog posts** — paste text into a `.txt` file
- **Research papers** — extract with `pdftotext`
- **Book highlights** — export from Kindle/Readwise as `.txt`
- **Your own notes** — any `.md` files you want synthesized
- **Transcripts** — podcast or lecture transcripts
- **Documentation** — library docs, API references

**Recommended size:** 500–15,000 words per source. For very long books, ingest chapter by chapter.

---

## Obsidian Tips

- **Graph view** (Ctrl+G): see the knowledge graph — concepts are blue, entities orange, topics purple, contradictions red
- **Backlinks panel**: click any page to see what links to it
- **Search** (Ctrl+F): full-text search across all pages
- **Tags**: filter by `#concept`, `#entity`, `#topic`, `#stub`, `#contradiction`
- **Quick switcher** (Ctrl+O): jump to any page by name

---

## How It Works (Karpathy's Pattern)

```
Raw Sources  →  [Claude ingest]  →  Wiki Pages  →  [Claude query]  →  Answers
     ↑                                   ↓
  _sources/                        [Claude lint]
                                   contradictions, gaps
```

The wiki is a **persistent, compounding artifact**. Each ingest makes the whole thing richer. Cross-references are pre-built so queries can synthesize across topics instantly. You never re-derive the same knowledge twice.

**Your job:** Choose what to ingest. Direct what the wiki covers. Resolve contradictions.  
**Claude's job:** Read, synthesize, cross-reference, maintain consistency.

---

## Troubleshooting

**`ANTHROPIC_API_KEY` not set**  
→ Export it in your shell or add to `.env` and use `python-dotenv`

**Claude returned invalid JSON**  
→ Check `_scripts/last_response.txt` for the raw output. Usually a context-length issue — try a shorter source.

**Ingest is slow**  
→ Normal for large sources. Claude reads the full wiki + source, then writes 10–20 pages. Expect 30–90 seconds.

**Page names have typos or don't match**  
→ Run `python lint.py` — broken links will surface. Fix manually in Obsidian.

**Wiki getting large (100+ pages)**  
→ The scripts currently send all pages to Claude. For very large wikis (300+ pages), consider splitting into sub-vaults by domain.
