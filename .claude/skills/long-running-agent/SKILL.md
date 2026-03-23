---
name: long-running-agent
description: "Launch a long-running autonomous agent that works for hours via a bash loop (Ralph Wiggum pattern). Use when the user asks for multi-hour work like SEO sprints, large refactors, content generation, or test writing."
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebSearch, WebFetch, Agent
---

# Long-Running Agent Skill

Launch autonomous agents that work for a defined duration (1-6 hours) using the **Ralph Wiggum loop pattern** — a bash wrapper that re-invokes `claude -p` in iterations, with each iteration reading its own previous work via git history and a progress file.

## When to use

- Multi-hour content sprints (SEO, docs, blog posts)
- Large refactors across many files
- Comprehensive test suites
- Any task too large for a single context window

## Architecture

```
┌─────────────────────────────────────────┐
│  bash loop (seo-agent-loop.sh)          │
│  ├── Iteration 1: claude -p PROMPT      │
│  │   ├── Read progress file             │
│  │   ├── Pick next task                 │
│  │   ├── Do work + quality gate         │
│  │   ├── Commit + update progress       │
│  │   └── Exit                           │
│  ├── Iteration 2: claude -p PROMPT      │
│  │   ├── Read progress file (sees #1)   │
│  │   ├── Pick next uncompleted task     │
│  │   └── ...                            │
│  └── Iteration N: outputs COMPLETE      │
└─────────────────────────────────────────┘
```

Each iteration gets a fresh context window but inherits state via:
1. **Progress file** — markdown checklist + metrics (committed to git)
2. **Git history** — `git log` shows what previous iterations did
3. **File system** — previous iterations' output files exist on disk

## Setup Steps

### 1. Write the prompt file

Save to `/tmp/<agent-name>-prompt.md`. The prompt MUST include:

```markdown
# [Agent Name] — Iteration-Based

You are a [role] working on [repo]. This is part of a continuous development
loop — you don't need to complete everything in one iteration. Make meaningful
progress on ONE thing, then commit and leave clear notes for the next iteration.
Think of it as a relay race where you're passing the baton.

## First thing: Read your state
1. Run `pwd`
2. Read `PROGRESS.md` if it exists
3. Run `git log --oneline -10`
4. Pick the NEXT uncompleted task

## If FIRST iteration (no PROGRESS.md):
1. Create branch: `git checkout -b [branch-name]`
2. Read existing code/content to understand patterns
3. Create PROGRESS.md with full plan and checklist
4. Start on the FIRST task only
5. Commit

## For EVERY subsequent iteration:
1. Read PROGRESS.md
2. Pick next uncompleted task
3. [MANDATORY RESEARCH/PLANNING PHASE — define what this means]
4. [WORK PHASE — one task only]
5. [QUALITY GATE — automated checks that must pass]
6. Update PROGRESS.md
7. Commit with descriptive message

## When ALL tasks complete:
1. Run build/test verification
2. Update PROGRESS.md with final stats
3. Create PR
4. Output exactly: <promise>COMPLETE</promise>

## DO NOT output <promise>COMPLETE</promise> until the PR is created.
```

### Key prompt rules:
- **"Relay race" framing** — explicitly tell the agent to pace itself
- **Mandatory research phase** — prevents rushing; define concrete steps (read competitors, search web, analyze existing code)
- **ONE task per iteration** — prevents the agent from blasting through everything
- **Quality gate** — automated checks that force rewrites if thresholds fail
- **Progress file** — the agent's persistent memory across iterations

### 2. Write the loop script

```bash
#!/bin/bash
set -euo pipefail

REPO="/path/to/repo"
PROMPT_FILE="/tmp/<agent-name>-prompt.md"
MAX_ITERATIONS=15        # safety ceiling
TIMEOUT_HOURS=3          # wall-clock limit
LOG_DIR="/tmp/<agent-name>-logs"
mkdir -p "$LOG_DIR"

START_TIME=$(date +%s)
END_TIME=$((START_TIME + TIMEOUT_HOURS * 3600))

cd "$REPO"
PROMPT_TEXT=$(cat "$PROMPT_FILE")

echo "$(date): Loop starting (${TIMEOUT_HOURS}h, max ${MAX_ITERATIONS} iters)"

for i in $(seq 1 $MAX_ITERATIONS); do
  NOW=$(date +%s)
  if [ "$NOW" -ge "$END_TIME" ]; then
    echo "$(date): Time limit reached."
    break
  fi

  REMAINING=$(( (END_TIME - NOW) / 60 ))
  echo ""
  echo "$(date): === Iteration $i/$MAX_ITERATIONS (${REMAINING}m remaining) ==="

  ITER_LOG="$LOG_DIR/iteration-${i}.log"

  claude -p "$PROMPT_TEXT" \
    --dangerously-skip-permissions \
    --max-turns 30 \
    --output-format text \
    < /dev/null \
    > "$ITER_LOG" 2>&1

  echo "$(date): Iter $i done ($(wc -l < "$ITER_LOG") lines)"
  tail -3 "$ITER_LOG"

  if grep -q "<promise>COMPLETE</promise>" "$ITER_LOG"; then
    echo "$(date): COMPLETE"
    break
  fi

  # Show git progress
  cd "$REPO"
  echo "Latest commit: $(git log --oneline -1)"

  sleep 10
done

echo "$(date): Loop finished"
```

### 3. Launch

```bash
# Clean old logs
rm -f /tmp/<agent-name>-logs/*.log

# Launch in background
nohup /tmp/<agent-name>-loop.sh > /tmp/<agent-name>-logs/main.log 2>&1 &
echo "PID: $!"
```

### 4. Monitor

```bash
# Watch main log
tail -f /tmp/<agent-name>-logs/main.log

# Check git progress
cd /path/to/repo && git log --oneline -10

# Read progress file
cat /path/to/repo/PROGRESS.md

# Check current iteration output (buffered until iteration completes)
wc -l /tmp/<agent-name>-logs/iteration-*.log
```

## Critical flags

| Flag | Purpose |
|------|---------|
| `--dangerously-skip-permissions` | Required for unattended execution |
| `--max-turns 30` | Enough turns for real work per iteration, prevents hanging |
| `--output-format text` | Clean text output for logging |
| `< /dev/null` | Prevents stdin warning/hanging |

## Quality gate examples

### For content/writing:
```
- Clutter ratio (filler words / total words × 100) < 3%
- Passive voice % < 10%
- Adverb density (-ly words / 100 words) < 2%
- Cliché count = 0 (check against banned word list)
- Flesch-Kincaid grade 8-10
```

### For code:
```
- Tests pass: `cargo test` or `bun test`
- Type check: `npx tsc` or `cargo check`
- Lint clean: no new warnings
- No TODO/FIXME left behind
- Each function < 50 lines
```

### For refactors:
```
- All existing tests still pass
- No new dependencies added
- No public API changes (unless intended)
- Build succeeds
```

## Progress file format

The progress file is the agent's brain across iterations. It MUST contain:

```markdown
# [Task Name] — [date]

## Plan
[What we're doing and why]

## Checklist
- [x] Task 1 — done in iter 1
- [x] Task 2 — done in iter 2
- [ ] Task 3 — next up
- [ ] Task 4

## Quality Metrics
| # | Item | Metric1 | Metric2 | ... | Pass? |
|---|------|---------|---------|-----|-------|

## Iteration Log
| Iter | What was done | Files changed |
|------|---------------|---------------|

## Final Stats
- Items completed:
- Quality score:
- Build/test status:
```

## Safety constraints

Always include in the prompt:
1. **File scope** — explicitly list which directories/file types the agent can touch
2. **No dependency changes** — forbid package manager commands
3. **No config changes** — forbid touching CI, build configs, env files
4. **Branch isolation** — must work on a new branch
5. **PR review** — nothing merges without human approval
6. **Commit frequency** — commit after every task for visibility + killability

## Stopping a runaway agent

```bash
# Find and kill the loop
pkill -f "<agent-name>-loop"

# Or kill all claude processes from the loop
pkill -f "dangerously-skip-permissions"

# Check what it did
cd /path/to/repo && git log --oneline -20
cat PROGRESS.md

# Revert if needed
git checkout main
git branch -D <branch-name>
```

## Tuning

| Parameter | Conservative | Normal | Aggressive |
|-----------|-------------|--------|------------|
| `--max-turns` | 15 | 30 | 50 |
| `MAX_ITERATIONS` | 8 | 15 | 30 |
| `TIMEOUT_HOURS` | 1 | 3 | 6 |
| Sleep between iters | 30s | 10s | 5s |
| Tasks per iteration | 1 | 1 | 2-3 |

Start conservative. Scale up after verifying quality on first 2-3 iterations.

## Cost estimate

Claude Sonnet: ~$5-10/hour for autonomous loops.
Claude Opus: ~$15-30/hour.

A 3-hour Sonnet loop costs ~$15-30. Budget accordingly.
