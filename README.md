# Gaokao Advisor

> 中文版见 [README.zh.md](README.zh.md)。

An **employment-oriented, risk-tiered** college-application advisor for China's *gaokao* (高考). It helps a student turn a score into a concrete, defensible application list using the **冲 / 稳 / 保** (reach / match / safety) framework, an LLM for narration, and a real data pipeline that ingests official provincial admission data.

The product philosophy borrows from 张雪峰-style advice and mainstream services (夸克高考, 掌上高考, 优志愿): pragmatic, employment- and city-aware, risk-tiered, with AI-generated full application plans.

> ⚠️ **Predictions carry risk and are for reference only.** This is an advisory aid, not a substitute for official guidance. See [Validating results](#validating-results) for exactly what is and isn't provable.

---

## Status & data coverage

This started as a v0 demo with everything mocked. It has since grown a **real, end-to-end data pipeline** for Shandong (official files → parsers → CSV → store → matching), validated against `sdzk.cn` anchors. Honest coverage:

| Province · Track | Data |
| --- | --- |
| **Shandong · Comprehensive** (2025) | ✅ **Real** — official 一分一段 (score-to-rank), admission lines, score lines, 985/211/双一流 tags, and 21,283 major-level records |
| Hebei · Physics / History | Sample (demo only) |
| Sichuan · Science / Liberal-arts | Sample (demo only) |
| Other provinces | None — the UI degrades gracefully and flags the gap |

Every record carries `year` + `lastUpdatedAt`; the UI shows freshness badges and warns on stale/past-year data throughout.

---

## Quick start

Requires Node.js ≥ 18.18 and `pnpm` ≥ 9.

```bash
pnpm install        # install dependencies
pnpm dev            # start the app → http://localhost:3999
```

On first visit any page auto-seeds the local store (`data/store.json`) — no extra step. Zero config required: AI defaults to a local mock and the DB to a JSON file.

Configuration lives in [`.env.example`](.env.example) (copy to `.env` to change AI provider, DB driver, current year, staleness threshold).

### Other commands

| Command | What it does |
| --- | --- |
| `pnpm seed` | Initialize / rebuild the local store from the data source (idempotent, upsert by natural key) |
| `pnpm download [province]` | Download official files per `data/sources/sources.json` → `data/sources/raw/` (with provenance manifest) |
| `pnpm parse` | Parse downloaded official files → `data/sources/*.csv` (Shandong: score-to-rank + admission lines + score lines + 985/211 tags) |
| `pnpm refresh` | Run the collection pipeline once (dedupe + freshness). Add `DATA_SOURCE=real` to use real CSVs |
| `pnpm scheduler` | Start the daily scheduled collection job (node-cron, 03:00 default) |
| `pnpm test` | Unit tests — matching engine, data pipeline, per-province parsers (**40 tests across 7 files**) |
| `pnpm eval` | **Engine-logic** evaluation (deterministic mock data, **24 cases**: recommendation properties + retrieval grounding + dark-horse) |
| `pnpm verify` | **Real-data validation** (Shandong, against official sdzk.cn anchors + integrity + engine soundness) — see [Validating results](#validating-results) |
| `pnpm build` | Production build (full type-check) |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |

---

## Features

1. **Data collection** — provincial score lines, university admission lines (with history), score-to-rank tables, faculty, campus/teaching/dorm environment, transfer policies. Real scheduling, deduping, and freshness logic; only the *network fetch itself* is swappable behind an interface.
2. **Student profile** — province, subject-selection mode and score, interests, target schools/majors, regional preferences (city tier / region / climate), and free-text notes. All fields editable anytime, persisted in the browser (localStorage).
3. **Reactive matching** — any edit recomputes the reach/match/safety ranking (~350ms debounce). Each result card shows predicted line vs. score, rank, admission probability, faculty/environment, transfer difficulty, and a freshness badge.
4. **AI chat** — a "dark-horse" banner (with a prominent risk disclaimer), conversational intake of interests / direction / risk appetite, and one-click generation of three complete plans (conservative / balanced / aggressive) with rationale and risks. The LLM call goes through a swappable interface (see below).
5. **Evaluation set** — `pnpm eval` runs 24 RAG-style cases (varying provinces, score bands, risk appetite, edge cases like borderline scores / missing data) and reports pass rate and quality metrics.

---

## Architecture

A clean layering: **collection → storage → domain/matching → API → UI**. The defining design choice is that **every external dependency sits behind a single swappable interface**, so going from mock to real is a one-file change.

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI (Next.js App Router, client components)                          │
│  /  matching (reactive)   /chat  AI chat + dark-horse + plans        │
│  /search  university lookup   /data  data status & freshness         │
└───────────────┬─────────────────────────────────────────────────────┘
                │ fetch
┌───────────────▼─────────────────────────────────────────────────────┐
│  API routes (/api/match, /darkhorse, /plans, /chat, /data, /admin/*) │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │                                │
┌───────────────▼──────────────┐   ┌─────────────▼──────────────────────┐
│  Domain (pure, testable)      │   │  AI layer (AiClient interface)      │
│  matching · rankConversion    │   │  mock ⇄ deepseek ⇄ anthropic        │
│  darkHorse · freshness        │   └─────────────────────────────────────┘
└───────────────┬──────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────┐
│  Data layer                                                            │
│  Repository (DAO) ── DataStore ── JsonStore / MemoryStore / (SQLite)  │
│  Pipeline (dedupe + freshness) ◀── DataFetcher ◀── Mock / RealFetcher │
│  Scheduler (node-cron, daily)                                         │
└───────────────────────────────────────────────────────────────────────┘
```

The key **seams** (each isolates one external dependency for swapping):

- **`DataFetcher`** (`src/lib/data/fetchers/types.ts`) — the network/data source. `MockFetcher` (heuristic sample data) and `RealFetcher` (reads downloaded official files; Shandong is fully wired end-to-end). Selected by `DATA_SOURCE`.
- **`DataStore`** (`src/lib/data/stores.ts`) — persistence driver. `JsonStore` (default) / `MemoryStore` (tests) / `sqlite` (placeholder, throws). Selected by `DB_DRIVER`.
- **`AiClient`** (`src/lib/ai/types.ts`) — LLM backend. `MockAiClient` (default, offline) / `DeepSeekAiClient` / `AnthropicAiClient`. Selected by `AI_PROVIDER`; a missing key auto-falls back to mock.

See [`DECISIONS.md`](DECISIONS.md) (decisions & trade-offs), [`docs/MOCKS.md`](docs/MOCKS.md) (what's mocked & how to replace it), [`docs/competitive-reference.md`](docs/competitive-reference.md) (张雪峰 / competitor analysis), [`docs/ROADMAP.md`](docs/ROADMAP.md) (v1 and beyond), and [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) (end-user guide).

### Project layout

```
src/
  app/                    Next.js App Router (pages + API routes)
    page.tsx              home: profile form + reactive reach/match/safety
    chat/page.tsx         AI chat + dark-horse banner + plans
    search/page.tsx       university lookup by name
    data/page.tsx         data status + score-line tables (freshness)
    api/                  match / darkhorse / plans / chat / data / admin
  lib/
    config.ts             environment config
    domain/               types · matching · rankConversion · darkHorse
    data/                 repository (DAO) · stores · pipeline · scheduler · freshness · fetchers/ · parsers/
    ai/                   types (AiClient) · mock · deepseek · anthropic · prompt · index (factory)
    profile/              default profile + normalization
    services/             advisor (wires data + domain for the API)
  scripts/                seed · download · parse · refresh · scheduler · verify
  eval/                   cases (dataset) · run (eval runner)
  test/                   matching · pipeline · rankConversion · per-province parsers
docs/                     MOCKS · competitive-reference · ROADMAP · USER_GUIDE
```

---

## Real AI (optional)

The AI layer is provider-agnostic. Set one of these in `.env`:

```bash
# DeepSeek (OpenAI-compatible, low cost)
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat          # or deepseek-reasoner (R1, deeper but slower)

# Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8

# (default) local mock — no key, fully offline, deterministic
AI_PROVIDER=mock
```

With no key configured the app auto-falls back to mock and never hard-fails. The real clients use the official SDKs; the tiering engine (reach/match/safety) is deterministic and **does not** depend on the LLM — the LLM only powers chat and plan narration.

---

## Validating results

"Is it correct?" splits into three layers, each with its own tool:

| Layer | Meaning | Tool |
| --- | --- | --- |
| **Data faithfulness** | Do the stored ranks/lines equal the official data? | `pnpm verify` |
| **Engine soundness** | Given correct data, are the tiers and probabilities computed correctly? | `pnpm eval` (deterministic mock) + `pnpm verify` (real data) |
| **Outcome truth** | Will a given score actually be admitted by a given school? | ⚠️ **Only post-admission tracking can prove this** (see `docs/ROADMAP.md`) — a fundamental limit of *any* application tool |

`pnpm verify` (`src/scripts/verify.ts`) runs three classes of checks against the **real Shandong pipeline** (official files → parse → CSV → store → match):

- **Official anchors** — hardcoded values you can self-check on [sdzk.cn](https://www.sdzk.cn) (e.g. score 600 → cumulative rank 25,061; first-tier line 441). Parsing/data drift turns these red.
- **Integrity invariants** — score-to-rank monotonicity, no orphan admission lines, valid score/rank ranges, self-consistent rank↔score conversion.
- **Engine soundness on real data** — same score → reach, +12 → match, +35 → safety; probability monotonic in score; match tier ordered by fit.

> The boundary: `verify` proves "our numbers faithfully equal the official data, and the engine processes them correctly" — the provable part. It **cannot** prove a recommendation is "right" in reality; that needs a multi-year admission-outcome feedback loop.

---

## Key decisions (at a glance)

Full rationale and trade-offs in [`DECISIONS.md`](DECISIONS.md):

- **Single Next.js app** (App Router) for front- and back-end — one process, shared TS types, Node-only code naturally isolated server-side.
- **Interface seams for every external dependency** (`DataFetcher` / `DataStore` / `AiClient`) — mock→real is a one-file change with zero downstream impact.
- **JSON-file store by default** behind a `DataStore` interface — zero native deps for v0; swap to Postgres/SQLite later by implementing one interface.
- **Score-difference-primary tiering** with rank as a corrector — direct, robust, and testable as a pure function.
- **Real Shandong pipeline + major-level admission lines** — when a target major is set, tiering uses *that major's own line*, not the school's minimum, to avoid "false safety" picks.

---

## Disclaimer

This tool is an advisory aid. For real application decisions, combine **official data, each school's admission charter, and advice from teachers and family**, and decide carefully. **Predictions carry risk and are for reference only.**
