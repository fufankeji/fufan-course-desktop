# Web Runtime Console Discovery & Scope

Date: 2026-06-18

## Status

In discovery.

This document records the product and technical decisions that must be settled
before Feature 001 enters code development.

Feature 001 is the first Web product surface for FuFan Teaching Agent. It should
let a teacher or student operate the local Agent runtime from a browser and see
basic teaching visibility in the right column.

## Confirmed So Far

### Product Direction

- Build a new Web runtime console.
- Do not reuse the existing `web/` project because it is a community/site
  surface, not a runtime operation console.
- Create a new independent frontend project named `web-console/`.
- Use a desktop-first three-column layout:
  - Left: workspace, sessions, file tree.
  - Center: model connection, prompt input, live Agent output, tool cards.
  - Right: basic teaching event stream.
- Treat `siteboon/claudecodeui` as a UX reference only. Do not copy source code
  because it is AGPL-3.0-or-later.

### Backend Capability Audit

Existing Rust Runtime API can support:

- Runtime status and metadata.
- Thread-backed sessions.
- Creating/selecting/resuming threads.
- Starting turns from the backend.
- Streaming runtime events through SSE.
- Interrupting running turns.
- Skills listing and toggling.
- MCP server and tool discovery.
- Approval decisions.
- Workspace git status.

Confirmed backend gaps:

- No workspace file-tree endpoint.
- No read-only file preview endpoint.
- No Web-facing provider/model/base URL/API key connection contract.
- No dedicated Runtime API stream for structured education events.

### Implementation Direction

- Use the existing Rust Runtime API as the active backend.
- Map frontend sessions directly to Runtime threads.
- Expose structured education events through the Runtime API before building the
  Web right-side teaching timeline.
- Leave advanced Web Teaching Sidebar features, such as student/teacher
  visibility modes, richer filtering, and report affordances, to Phase 2 Feature
  002.
- Leave guided Superpowers install/use flow to Phase 2 Feature 003.

## Decisions To Make Before Coding

### 1. Feature Boundary

Decide the exact first-release scope:

- Session creation and selection.
- Historical sessions.
- Prompt submission.
- Interrupt.
- Approval handling.
- Read-only file tree and preview.
- Model connection behavior.
- Skills visibility and toggling.
- Whether any feature can be delayed from Feature 001.

### 2. Runtime API Contracts

Define request and response shapes for:

- `GET /v1/workspace/files`
- `GET /v1/workspace/files/content`
- `GET /v1/providers`
- `POST /v1/providers/test`
- `POST /v1/providers/connection`

Each contract should define:

- Query/body parameters.
- Response schema.
- Error schema.
- Auth/token behavior.
- Safety limits.
- Example JSON.

### 3. Frontend Information Architecture

Define what each column shows in the first release:

- Left column order and behavior.
- Center column states and output cards.
- Right column event categories and density.
- Empty, loading, error, unauthorized, and runtime-offline states.

### 4. Teaching Event Mapping

Define how Runtime events become teaching events:

- Skills.
- Tools.
- Shell.
- Files.
- Context.
- Safety.

Also define what is intentionally left for Feature 002.

### 5. Model Configuration And Secret Safety

Decide:

- Whether API keys are temporary or persisted.
- Whether provider config writes to backend config.
- What happens after browser refresh.
- What happens after Runtime restart.
- Whether failed connection attempts are logged.
- What the browser is allowed to remember.

### 6. Startup And Usage Flow

Define:

- How a teacher starts Runtime API.
- How a teacher starts Web Console.
- How runtime URL and token are entered.
- What the UI shows when Runtime is offline.
- What the UI shows when token is missing or invalid.
- Whether student usage is local-only in Feature 001.

### 7. Acceptance Criteria

Define what "Feature 001 done" means:

- Runtime connectivity.
- Model connection.
- Session create/select.
- Prompt execution.
- Live output.
- Tool cards.
- Read-only files.
- Right-side teaching event stream.
- Secret safety.
- No copied AGPL code.

## Decision Log

- 2026-06-18: Feature 001 session scope is `new + historical sessions`. The Web
  Console must let users create a new Runtime thread/session and select an
  existing historical Runtime thread/session.
- 2026-06-18: Feature 001 prompt execution is P0. The Web Console must let users
  enter a prompt in the browser, submit it to the Rust Runtime API, and display
  the resulting Agent activity.
- 2026-06-18: Feature 001 live output must use Runtime API SSE. The Web Console
  should stream Agent text, tool activity, shell/file events, and teaching
  events in near real time instead of polling or waiting for task completion.
- 2026-06-18: Feature 001 must support interrupting a running Agent turn from
  the Web Console. The UI should expose a clear stop/interrupt control while a
  turn is running and call the Runtime API interrupt endpoint.
- 2026-06-18: Feature 001 approval handling is display-only. The Web Console
  should clearly show approval-required events and tell the user to resolve them
  in the terminal. In-browser approve/reject controls are deferred.
- 2026-06-18: Feature 001 must include read-only workspace browsing. The Web
  Console should show a file tree and file preview, but must not support manual
  editing or saving files in this release.
- 2026-06-18: Feature 001 Skills support is view-only. The Web Console should
  show loaded/available Skills and their descriptions for teaching visibility,
  but should not allow enabling or disabling Skills in this release.
- 2026-06-18: Feature 001 model connection is P0. The Web Console must allow the
  user to enter provider, model, optional base URL, and API key, then test and
  apply that connection through backend Runtime API contracts.

## Feature 001 Scope Summary

P0 scope for the first Web Runtime Console release:

- Create a new Runtime session.
- List and select historical Runtime sessions.
- Submit prompts from the browser.
- Stream Agent output and runtime events through SSE.
- Interrupt a running Agent turn from the browser.
- Display approval-required events, with actual approval resolution deferred to
  the terminal.
- Browse workspace files through a read-only file tree.
- Preview workspace files read-only.
- Display Skills and descriptions without allowing Web-side toggles.
- Configure and test model connection from the Web page through backend APIs.

Explicitly deferred from Feature 001:

- In-browser approve/reject controls.
- Manual Web file editing or saving.
- Web-side Skills enable/disable controls.
- Full structured Web Teaching Sidebar parity.
- Superpowers install and guided integration flow.

## Runtime API Contract Decisions

- 2026-06-18: `GET /v1/workspace/files` should use lazy directory loading. The
  client requests one directory at a time by relative path, and the backend
  returns that directory's immediate children instead of returning the whole
  workspace tree at once.
- 2026-06-18: The workspace file-tree endpoint should use query parameters:
  `GET /v1/workspace/files?path=<relative-path>`. The root directory may be
  requested by omitting `path` or passing an empty path.
- 2026-06-18: The workspace file-tree response should include current directory
  metadata plus an `entries` list. Each entry should include at least `name`,
  `path`, `kind`, and cheap metadata such as size and modified time when
  available.
- 2026-06-18: `GET /v1/workspace/files/content` should return at most 200KB of
  preview content. Larger text files should return truncated content plus
  metadata that tells the UI the preview is incomplete.
- 2026-06-18: The workspace file preview endpoint should use query parameters:
  `GET /v1/workspace/files/content?path=<relative-path>`.
- 2026-06-18: The workspace file preview endpoint should return JSON, not raw
  text. The response should include file path, preview kind, content when
  textual, encoding if known, truncation state, file size, and an unsupported
  reason for binary or unreadable files.
- 2026-06-18: Workspace file APIs must reject path traversal or workspace escape
  attempts with a structured 400/403-style error. They must never auto-correct
  such paths or silently return empty data.
- 2026-06-18: Binary files should not render content in Feature 001. The file
  preview API should return metadata and a structured unsupported/binary reason
  instead of raw binary content.
- 2026-06-18: Workspace file APIs should hide heavy or low-value directories by
  default, including `.git`, `target`, `node_modules`, and common build
  artifacts. Filtering should happen in the backend, not only in the browser.
- 2026-06-18: Model API keys entered in the Web Console should be persisted to
  the local backend configuration file, not browser storage. The Web UI must
  clearly tell the user that the key will be saved locally, and Runtime API
  responses must never echo raw API keys.
- 2026-06-18: Saving model API keys requires explicit user confirmation. The UI
  must make persistence clear through a checkbox or an explicit save action such
  as "test and save to this machine".
- 2026-06-18: Model connection test failures may be logged only in redacted
  form. Logs can include provider, model, base URL host, and error class, but
  must not include API keys, sensitive headers, or full request bodies.
- 2026-06-18: `GET /v1/providers` should expose the backend's supported provider
  catalog instead of hard-coding only a small Web-specific subset. The frontend
  should render provider choices from the Runtime API response.
- 2026-06-18: Provider connection should use separate test and apply/save
  actions. `POST /v1/providers/test` validates the connection without
  persistence, while `POST /v1/providers/connection` applies the confirmed
  provider settings and persists API keys only after explicit user confirmation.
- 2026-06-18: The provider apply/save endpoint should be named
  `POST /v1/providers/connection`, not `/session`, because it represents the Web
  Console's active provider connection and may include `persist: true`.
- 2026-06-18: `POST /v1/providers/connection` should support `persist: true` and
  `persist: false`. `persist: false` applies credentials only for the active
  Runtime process/session path; `persist: true` writes confirmed settings to the
  local backend configuration file after explicit user confirmation.
- 2026-06-18: Provider API responses should expose only whether an API key is
  configured, not the raw key or masked key fragments. Use fields like
  `apiKeyConfigured: true` instead of `apiKeyPreview`.
- 2026-06-18: New Runtime API endpoints for Feature 001 should use a consistent
  structured error shape, for example `{ "error": { "code": "...", "message":
  "...", "details": {} } }`, rather than ad hoc per-endpoint errors or empty
  error bodies.

## Frontend Information Architecture Decisions

- 2026-06-18: The left column should be ordered as Runtime/workspace status,
  Sessions, then workspace file tree. Runtime and workspace context must be
  visible before the user selects a session or browses files.
- 2026-06-18: The center column should use an Agent console layout: current
  model/session status at the top, live output stream in the middle, and fixed
  prompt composer at the bottom.
- 2026-06-18: The model connection entry should live in the center column's top
  status area as a visible connection panel or action. It should not require a
  separate settings page in Feature 001.
- 2026-06-18: The right teaching column should use a compact timeline. Each
  event should show category/icon, title, short summary, timestamp, and
  status/severity when available. Full detail cards are deferred.
- 2026-06-18: File preview should stay inside the left column, below or adjacent
  to the file tree. Selecting a file must not replace the center Agent output or
  the right teaching timeline in Feature 001.
- 2026-06-18: Feature 001 is desktop-first and only needs to guarantee a polished
  experience at 1280px width and above. Mobile adaptation is deferred.
- 2026-06-18: Feature 001 Web Console should reuse the brand design token system
  from `/Users/muyu/MuYuWorkSpace/Beyondata-Website`, especially
  `src/styles/global.css`. The console should preserve Beyondata/FuFan brand
  consistency by mapping its own UI surfaces to the existing semantic token
  language: `surface-*`, `fill-*`, `content-*`, `border-*`, `brand-accent`,
  `brand-purple`, `cta`, and `cta-foreground`.
- 2026-06-18: Feature 001 should support the same dark/light token model used by
  Beyondata-Website, but the Web Console should default to the light theme and
  allow switching to dark theme. The console can adapt the token application for
  dense product UI, but should not invent an unrelated visual system.
- 2026-06-18: Brand token reuse should be done by extracting a focused
  `web-console/src/styles/tokens.css` from Beyondata-Website's token vocabulary.
  Do not copy the entire website `global.css`, and do not make `web-console`
  depend on the external website project path at runtime.
- 2026-06-18: The Web Console may persist the user's light/dark theme preference
  in browser local storage. This is allowed because theme preference is not a
  secret, unlike Runtime auth tokens or model API keys.

## Teaching Event Mapping Decisions

- 2026-06-18: Feature 001 should expose structured education events through the
  Runtime API before implementing the Web teaching timeline. The Web right
  column should consume backend `EducationEvent`-style data instead of deriving
  teaching events only in frontend code from generic Runtime SSE events.
- 2026-06-18: Structured teaching events should support both historical replay
  and live updates. The preferred contract is a teaching-event list/backlog plus
  an SSE stream for new `EducationEvent` records.
- 2026-06-18: Structured teaching events should use separate thread-scoped
  endpoints: `GET /v1/threads/{id}/teaching-events` for historical/backlog data
  and `GET /v1/threads/{id}/teaching-events/stream` for live SSE updates.
- 2026-06-18: `GET /v1/threads/{id}/teaching-events` should support bounded
  history retrieval with parameters such as `limit` and `afterSeq` or `since`,
  instead of returning unbounded full history.
- 2026-06-18: Structured teaching events need a stable monotonically increasing
  `seq` field per thread. The Web client should use `seq` for ordering,
  de-duplication, and reconnect/backlog requests.
- 2026-06-18: Feature 001 teaching timeline categories are Skills, Tools, Shell,
  Files, Context, and Safety. These categories should align with the Phase 1 TUI
  teaching sidebar language.
- 2026-06-18: Teaching timeline events should be compact by default and
  expandable on demand. Expanded details may show structured event data such as
  command summaries, file paths, tool names, status, and sanitized metadata.
- 2026-06-18: Feature 001 Web teaching timeline should show all structured
  teaching events available to the current local user, instead of filtering by
  `student` visibility by default. This is intended for teacher-operated local
  use. All events must still be redacted before reaching the Web UI; raw secrets,
  tokens, sensitive headers, and sensitive file contents must never be shown.
- 2026-06-18: Feature 001 does not include a student/teacher visibility mode
  switch. Student-specific filtering and classroom display modes are deferred to
  the fuller Web Teaching Sidebar work.

## Startup And Usage Flow Decisions

- 2026-06-18: Feature 001 startup uses two explicit local processes: the teacher
  starts the Rust Runtime API and starts the Web Console separately. One-command
  process orchestration and Web-driven Runtime launch are deferred.
- 2026-06-18: The Web Console should provide a Runtime connection panel where
  the user enters the Runtime URL and token. Connection state and auth failures
  should be visible in the UI.
- 2026-06-18: The browser may remember the Runtime URL for convenience, but must
  not persist the Runtime auth token in local storage. The token should be kept
  only in memory for the active browser session in Feature 001.
- 2026-06-18: When the Runtime API is offline or unreachable, the Web Console
  should show the connection panel plus clear startup guidance instead of only a
  toast, blank page, or endless loading state.
- 2026-06-18: Feature 001 is local/trusted-environment only. It does not support
  student remote access to the teacher's machine, LAN classroom sharing, or
  public network exposure.

## Acceptance Decisions

- 2026-06-18: Feature 001 acceptance must include a real model-provider run. Mock
  tests are useful for automation, but final acceptance requires connecting a
  real provider/API key, submitting a prompt, and observing live Agent output and
  events.
- 2026-06-18: Feature 001 acceptance must include real tool activity. The
  acceptance scenario should trigger at least file read activity, shell command
  activity, and generic tool/runtime events so the teaching timeline can be
  verified.
- 2026-06-18: Feature 001 acceptance must verify API key safety. Raw API keys
  must not appear in the Web UI, Runtime API responses, logs, or teaching event
  payloads.
- 2026-06-18: Feature 001 acceptance must include structured teaching event API
  coverage. The backend should expose historical `EducationEvent`-style records
  and live SSE updates, and the Web timeline should consume that contract.
- 2026-06-18: Feature 001 acceptance must include running the local Web Console
  and manually checking the key screens and interactions: three-column layout,
  Runtime connection, session selection, prompt execution, live output, file
  preview, and teaching timeline.
- 2026-06-18: Feature 001 acceptance must verify AGPL compliance for
  `claudecodeui`: the project may use it as UX reference, but must not copy its
  source code, components, styles, or implementation details into `web-console/`.
- 2026-06-18: Feature 001 acceptance must verify brand consistency with
  Beyondata-Website tokens. The Web Console should use the existing brand token
  vocabulary and support dark/light theme behavior consistent with the company
  website.

## Remaining Spec Work Before Coding

- Convert Runtime API decisions into concrete contract documents with request
  and response JSON examples.
- Update `spec.md` so it matches the discovery decisions, especially structured
  teaching events, provider connection persistence, and Beyondata theme tokens.
- Update `plan.md` so backend tasks include structured teaching event APIs.
- Create `tasks.md` only after contracts and `spec.md` are aligned.
