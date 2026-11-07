# Assistant context implementation progress

- Status: running
- Active stage: 0 / baseline and stage 1 preparation
- Checkpoint UTC: 2026-11-07T03:47:00Z
- Backend branch: `feature/assistant-shared-context` from `dev` (`8dcfa149863b26ed0645767c237dd6646e6e351c`)
- Web branch: `feature/assistant-shared-context` from `dev` (`396588c91bdd641f5840d4b7c92d2a375d9ce29f`)
- Specification: `docs/ASSISTANT_CONTEXT.md`
- Authorization: proceed automatically through implementation, reviews/fixes, commits and both PRs; stop only for unresolved blockers. Do not merge or deploy.
- Commits: one-line Conventional Commit; no message body, author override or coauthor trailers.
- Reviews/delegation: medium reasoning.

## Completed

- Inspected backend, frontend and bridge/firmware contracts; confirmed frontend Supabase session is available.
- Created remote feature branches from each repository's `dev` branch.
- Closed scope: six entries, no expiry, one backend instance, context only with transport-local responses, no migration, OpenAI, up to 20 items/type and 16000-character data budget.

## Current work

- Install dependencies and record baseline checks. Backend uses npm lockfile; web has pnpm lockfile and no npm lockfile.
- Stage 1 personal service and Redis methods/tests are being prepared locally; not yet reviewed or committed.

## Next steps

1. Finish stage 1 targeted tests and independent review; apply verified fixes and checkpoint.
2. Integrate Slack/REST/web without double-writing AI context or broadcasting cross-transport.
3. Add assistant-only socket authentication and frontend session/reconnect handling.
4. Add bounded question data/history and classifier diagnostics/output allowance.
5. Regression checks, documentation, final review and two PRs to `dev`.

## Verification

Baseline checks pending. No implementation tests, live provider calls or hardware tests claimed.

## Recovery and automation

If this document says running and was updated recently, avoid concurrent implementation. Check whether the existing chat is still active before taking over. A scheduled recovery run may read this checkpoint and continue stale/paused work, but cannot bypass account usage limits or guarantee detection of their reset time. Once both PRs exist, mark this checkpoint complete and pause recovery automation.
