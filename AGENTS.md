# Project Agent Instructions

## Project Identity

- Project: marketscanner
- Purpose: Real-time market scanner — single-process TypeScript monolith (Express HTTP + WebSocket realtime + quantitative scanner engine + React SPA) over provider-agnostic normalized market data.
- Primary owner: Sashi

## Scope

This file defines project-specific instructions.
Global governance remains authoritative.

## Architecture

- Current architecture: Single-process TS monolith — `server/index.ts` bootstrap; `server/config|logging|baseline|persistence|scanner|events|realtime|providers|sierra-integration|health|metrics|lifecycle` subsystems (see ARCHITECTURE.md). Node single-threaded event loop, no workers.
- Important boundaries: `MarketProvider` interface (new sources without touching scanner math); `server/sierra-integration` abstractions (no direct edits to `server/providers/sierra/` codecs); persistence via repository interfaces.
- External interfaces: Express HTTP, WebSocket realtime transport, Sierra DTC/TAL/ACSIL feeds, Vite React SPA.

## Development

- Build command: `npm run build` (vite build + esbuild server bundle → `dist/server.cjs`)
- Test command: `npm run test` (vitest run)
- Lint command: `npm run lint` (tsc --noEmit)
- Dev command: `npm run dev` (tsx server.ts)

## Rules

- Inspect before modifying.
- Preserve existing behavior unless the task explicitly changes it.
- Prefer small, coherent changes.
- Do not introduce dependencies casually.
- Verify changes with the strongest practical test.
- Never expose or commit secrets.

## Git

- Work on a feature branch unless explicitly instructed otherwise.
- Do not push without approval.
- Do not perform destructive Git operations without approval.

## PR Workflow (Paperclip isolated worktrees)

Project workspace: `cwd=/home/sashi/workspace/marketscanner`, `repoUrl=https://github.com/SashiPeri/marketscanner.git`, base `main`, mode Isolated (one git worktree per issue under `.paperclip-worktrees/`).

- You are already on the right feature branch inside your worktree — never work on `main` directly.
- Before exit: commit (one conventional-commit message per logical change), `git push -u origin HEAD`, open a PR if none exists (`gh pr create --fill --base main`), paste the PR URL as the first line of the issue status comment.
- Move the issue to `in_review` when the PR is up and CI is green, with a one-paragraph summary + test commands run. Never self-merge.
- Auth: runs require `GH_TOKEN` or `GITHUB_TOKEN` bound at project/agent scope, else blocked with `push_write_credential_missing`.

## Known Constraints

-

## Current Work

-

## Handoff Notes

-
