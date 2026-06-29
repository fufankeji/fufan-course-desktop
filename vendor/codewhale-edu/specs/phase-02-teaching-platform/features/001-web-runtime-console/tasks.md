# Web Runtime Console Tasks

Date: 2026-06-18

## Status

Implementation in progress. Backend workspace/provider/teaching contracts and
the first Vite web-console scaffold are implemented. The local page can connect
to Runtime API, browse workspace files, configure providers, create turns, and
render structured teaching events.

These tasks are derived from `discovery.md`, `spec.md`, `plan.md`, and
`contracts/runtime-api.md`. Do not start Superpowers install/integration work in
this feature.

## Phase A: Backend Contracts

- [x] Implement consistent Feature 001 Runtime API error shape.
- [x] Add `GET /v1/workspace/files?path=<relative-path>`.
- [x] Add safe workspace-relative path resolution and traversal rejection.
- [x] Add backend filtering for `.git`, `target`, `node_modules`, and common
  build artifacts.
- [x] Add deterministic file tree sorting: directories first, then files.
- [x] Add `GET /v1/workspace/files/content?path=<relative-path>`.
- [x] Cap text preview at 200KB.
- [x] Return JSON preview metadata for text, truncated, and binary files.
- [x] Return JSON preview metadata for unreadable files.
- [x] Add Runtime API tests for file tree, preview, filtering, path traversal,
  binary handling, and truncation.
- [x] Add Runtime API tests for unreadable file handling.

## Phase B: Provider Connection

- [x] Add `GET /v1/providers`.
- [x] Return backend-supported provider catalog from Runtime API.
- [x] Return current provider/model/base URL state.
- [x] Return only `apiKeyConfigured`; never return raw or masked API keys.
- [x] Add `POST /v1/providers/test`.
- [x] Ensure test endpoint does not persist credentials.
- [x] Redact provider test failures in responses.
- [x] Add `POST /v1/providers/connection`.
- [x] Support `persist: false` for active Runtime use.
- [x] Support `persist: true` for explicit local backend config persistence.
- [ ] Add tests proving raw API keys do not appear in responses, errors, logs,
  or teaching events.

## Phase C: Structured Teaching Events

- [ ] Extract or reuse the TUI education event mapper for Runtime API use.
- [x] Add stable per-thread `seq` values for teaching events.
- [x] Add `GET /v1/threads/{id}/teaching-events`.
- [x] Support `limit` and `afterSeq` or `since` on teaching event history.
- [x] Add `GET /v1/threads/{id}/teaching-events/stream` SSE endpoint.
- [ ] Emit Skills, Tools, Shell, Files, Context, and Safety categories.
- [ ] Redact secrets, sensitive paths, sensitive headers, and sensitive file
  contents before events reach the Web UI.
- [ ] Add tests for event ordering, event redaction, history retrieval, SSE
  stream payloads, and reconnect/backlog behavior.

## Phase D: Web Console Scaffold

- [x] Create independent `web-console/` Vite React TypeScript project.
- [x] Add `dev`, `build`, `preview`, and `typecheck` scripts.
- [x] Extract focused Beyondata/FuFan brand tokens into
  `web-console/src/styles/tokens.css`.
- [x] Add default-light theme and switchable dark theme.
- [x] Persist only theme preference in browser local storage.
- [x] Add desktop-oriented three-column layout shell.
- [x] Add Runtime API client and typed response models.
- [x] Add SSE helpers for teaching events.
- [x] Add SSE helpers for general Runtime thread output events.

## Phase E: Runtime Connection And Sessions

- [x] Add Runtime connection panel for URL and token.
- [x] Persist Runtime URL only; keep Runtime token in memory.
- [x] Show runtime offline, unauthorized, and connected states.
- [x] Load `/v1/runtime/info`.
- [x] Load workspace git status.
- [x] Load thread summaries and map Runtime threads to sessions.
- [x] Create new Runtime session/thread.
- [x] Select historical Runtime session/thread.

## Phase F: Model Connection UI

- [x] Render provider choices from `GET /v1/providers`.
- [x] Add provider/model/base URL/API key form.
- [x] Add test action using `POST /v1/providers/test`.
- [x] Add temporary apply flow using `persist: false`.
- [x] Add explicit confirmation for local backend persistence.
- [x] Add save/apply flow using `POST /v1/providers/connection`.
- [x] Ensure API key is not stored in browser local storage.

## Phase G: Agent Operation UI

- [x] Add center top model/session status area.
- [x] Add live output stream area.
- [x] Add fixed bottom prompt composer.
- [x] Submit prompt through `POST /v1/threads/{id}/turns`.
- [x] Subscribe to Runtime thread event SSE for live Agent output.
- [ ] Render assistant text, user prompts, tool cards, command execution, file
  activity, status, and errors.
- [x] Add browser interrupt control for running turns.
- [x] Display approval-required events and instruct user to resolve them in the
  terminal.

## Phase H: Workspace UI

- [x] Render left column Runtime/workspace status.
- [x] Render sessions below Runtime/workspace status.
- [x] Render lazy-loaded read-only file tree.
- [x] Render file preview inside the left column.
- [x] Show binary/unsupported/truncated preview states.
- [x] Do not add manual file edit or save controls.

## Phase I: Teaching Timeline UI

- [x] Load historical structured teaching events.
- [x] Subscribe to teaching event SSE stream.
- [x] Use `seq` for ordering, de-duplication, and reconnect gap filling.
- [x] Render compact right-side timeline.
- [x] Support expandable sanitized event details.
- [x] Render Skills, Tools, Shell, Files, Context, and Safety categories.
- [x] Do not add student/teacher visibility switching in Feature 001.

## Phase J: Verification

- [x] Run backend tests for Runtime API additions.
- [x] Run `cargo build -p codewhale-tui`.
- [x] Run `web-console` typecheck and build.
- [x] Start Runtime API locally.
- [x] Start `web-console` locally.
- [x] Verify Runtime URL/token connection flow.
- [ ] Verify real provider/API key connection.
- [x] Verify prompt submission creates a Runtime turn and Runtime event output.
- [ ] Verify real file read and shell command activity.
- [x] Verify structured teaching history and SSE updates.
- [x] Verify read-only file tree and preview.
- [ ] Verify API key does not appear in Web UI, Runtime API responses, logs, or
  teaching event payloads.
- [x] Verify default-light and switchable dark theme using extracted
  Beyondata/FuFan tokens.
- [x] Verify no AGPL source, components, or styles from `claudecodeui` were
  copied.
