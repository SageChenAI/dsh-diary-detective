# Diary Detective (赛博日记侦探)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugin — **a warm mirror that reads journals, illuminates blind spots, and gives gentle feedback.**

> 中文文档见 [README.zh.md](./README.zh.md)

## What it is

Diary Detective is a gentle observer for your journal. It helps a person see themselves honestly and gently:

- **Illuminate blind spots** — hidden bad habits and the root causes of recurring mistakes.
- **Illuminate light** — the places where a person is growing. Both matter equally.
- **One warm sentence a day** — echoes today and empathizes. No structure-piling.
- **Speak only real discoveries** — with evidence from the original text, one at a time. It never fabricates a pattern to fill a daily quota.

It is **not** a therapist, not a coach, not a productivity tracker. It is a mirror — the analysis is always offered as a hypothesis the user can confirm, deny, or correct.

## The philosophy (10 articles)

The full charter lives in [SKILL.md](./SKILL.md):

1. **A warm mirror** — on the user's side, feeling for them, never judging them.
2. **The way it speaks** — see the cost *and* the love ("It's tiring, but I think you actually love it"); attribute difficulties to situations before people; one "possible cause" hypothesis at a time, with evidence.
3. **Five harms it never commits** — no labeling, no negative feedback loops, no distorted memory, no privacy leaks, no inauthentic writing.
4. **Honesty over usefulness** — if there is nothing worth saying today, it says so.
5. **Memory** — compress + store + read again next time; always defers to the user; old conclusions retire quietly; never dredges up the past.
6. **Journal form is fluid** — no fixed templates; periodically redesign the form *together* with the user.
7. **Two layers** — mechanical stats (word frequency, streaks) are rough proxies; semantic understanding is the brain's job.
8. **Identity boundary** — not a therapist; when content exceeds its ability, it suggests a real person — with encouragement and belief, never abandonment. User-set boundaries go into the do-not-mention list forever.
9. **Dose** — listen first, speak later; one discovery at a time.
10. **Privacy** — raw text may go to the model for analysis, but it stays local: never shared, never used for training.

## Components

- **Tools** (the mechanical organs — eyes & memory):
  - `diary_write` — save a spoken entry as `YYYY-MM-DD.md` (no forced format).
  - `diary_read` — read original entries (the only source of truth).
  - `diary_index` — mechanical stats: weekday distribution, tag frequency, Chinese bigram frequency, streaks, gaps (rough proxies only).
  - `diary_memory` / `diary_memory_update` — read / rewrite the compressed memory.
  - `diary_feedback` — one-call starter kit: today's entry + memory + stats.
- **Skill** — [SKILL.md](./SKILL.md) is the soul: the Warm Observer's Code that teaches the model how to think, analyze, and speak.

## Install

### 1. Install the tools (bundle)

```sh
dsh plugin --profile <name> add dsh-diary-detective
# or from GitHub:
dsh plugin --profile <name> add github:<your-github-username>/dsh-diary-detective
```

Data defaults are workspace-relative: journal entries live in `<workspace>/diary/`, memory in `<workspace>/diary-memory.md`. Every tool accepts `dir` / `path` arguments to point anywhere.

### 2. Install the skill

Copy the folder into your skills directory:

```sh
# per-user
cp SKILL.md ~/.dsh/skills/diary-detective/SKILL.md
# or per-project
cp SKILL.md <project>/.dsh/skills/diary-detective/SKILL.md
```

## Use

Natural language triggers:

- "今天复盘" / "daily review"
- "写日记：今天……" / "journal: today I…"
- "我最近是不是……" / "have I been… lately?"

The model loads the skill, calls the tools in order (read original → read memory → mechanical stats → analyze → speak → update memory), and replies per the charter.

## Privacy

- All journal content is stored locally, wherever you point the tools.
- Raw text may be sent to the model for analysis but is never shared or used for training by this project.
- Before publishing this repo or any example: no real names, no real paths, no real dated events, no journal quotes — all examples are fictional.

## Roadmap

- v1.1 — `diary_report` (weekly/monthly review), automatic skill registration from the bundle, configurable paths via plugin config.
- v1.2 — a universal prompt version (paste into any AI), browser panel with streaks.

## License

MIT
