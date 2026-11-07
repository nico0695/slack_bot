# Shared personal assistant context

## Accepted specification

- Slack normal DMs, the web assistant and authenticated `POST /conversations/assistant` share recent context using the existing internal user ID. Existing Slack/Supabase account linking remains unchanged; no automatic account merges.
- Keep six entries total (user and assistant), each at most 2000 Unicode characters, in Redis without expiration. New entries displace old ones. Redis durability remains an infrastructure responsibility.
- Start with a new, explicit per-user key. Do not import ambiguous synthetic-channel histories or migrate existing entities. New personal entities have no channel.
- Share AI context only. Responses and progress stay with their originating transport. The web-visible history stays separate, contains only web messages and uses a noncolliding server-derived key.
- Slack channels, generic socket conversations and the explicit Slack START/END flow retain their separate behavior and history.
- Serialize the complete read/process/save operation per user in one backend process; different users run independently. Multiple backend replicas are out of scope. Queue waits count toward existing client timeout budgets; never retry a mutation automatically.
- Persist only a usable user/assistant exchange. Skip `+`, missing responses and thrown/unknown results. Store plain text, no blocks, images or base64. A persistence failure never repeats actions or changes a successful execution result.
- Missing Redis key means empty history. Failed/corrupt reads mean context unavailable: execute without history and do not overwrite it.
- Both `question` and `.q` use history plus current personal data: up to 20 alerts, tasks, notes and links per type with useful fields, maximum 16000 characters in total. Classifier data stays compact. Clearly mark omitted, incomplete or unavailable data; never infer that missing context proves absence of records. Treat stored text as data, not instructions.
- Keep the REST body, response envelope, limits, status mapping, authentication and no-retry behavior. The ESP32 and bridge need no protocol changes.
- Authenticate assistant socket join/send events with a current Supabase token and derive identity server-side. Do not trust client `userId` or `channel`, or require authentication for unrelated anonymous socket conversations. Handle reconnect, account changes and logout without leaking previous responses.
- OpenAI only for this iteration. Increase classification output allowance to about 400 tokens, move dynamic date after stable instructions and log parse failure metadata without user content. Keep the current model until a real evaluation supports changing it. No SDK migration, Gemini work or automatic summary memory.

## Implementation stages

0. Record spec, checkpoints and baseline checks; create feature branches from `dev`.
1. Add the personal-context service and Redis methods, with focused tests; independent review and fix substeps.
2. Wire normal Slack DM and REST; wire web context with a separate visible history; review and fixes.
3. Protect assistant socket events and coordinate the minimal web session/reconnect change; review and fixes.
4. Supply question context and improve classifier robustness; evaluation fixture and focused tests; review and fixes.
5. Run regression checks, update documentation, final review/fixes and open backend/web PRs targeting `dev`.

The user authorized automatic progression through these stages, commits, pushes and PR creation. Stop only for an unresolved blocker. Do not deploy or merge. Commit messages are one-line Conventional Commits with no body, author override or coauthor trailers. Reviews use medium reasoning.

## Acceptance and verification

- A normal DM exchange can be used by REST and then web; responses never broadcast between those interfaces.
- Users including IDs 1 and 91 have different histories; channels never read personal history.
- Six-entry trimming, Unicode text bounds and no TTL are tested; no binary payload persists.
- Concurrent requests preserve order for one user; errors release the queue; other users remain independent.
- Redis read failure does not destroy existing history; write failure does not change execution outcome.
- Authentication tests cover absent/invalid tokens, disabled users, forbidden profiles, forged IDs/rooms and account changes.
- Both question paths receive descriptions and recent history; omission/unavailability is explicit.
- REST validation, status/error envelope and content omission remain compatible with the existing bridge.
- Backend: `npx tsc --noEmit`, `npm run lint`, `npm test -- --runInBand`, `npm run build`; targeted tests after each step.
- Web: use the existing pnpm lockfile, targeted lint and type/build checks; document existing failures separately.
- Live OpenAI, Supabase, Redis and hardware checks are separate from mocks. Never claim unavailable live checks passed.

## Resume protocol

Read `docs/ASSISTANT_CONTEXT_PROGRESS.md` on the remote feature branch before resuming. Inspect actual commits and working-tree changes; never restart completed stages. Run only one implementing session. Checkpoint reviewed changes and remaining fixes remotely after each stage so recovery does not depend on a scratch directory. The same feature branch exists in `nico0695/slack_bot_web`; its coordinated change targets `dev` too.
