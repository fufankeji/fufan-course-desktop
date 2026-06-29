# Web Runtime Console Spec

Date: 2026-06-18

## Status

Draft for review.

## Purpose

Web Runtime Console is the first Phase 2 teaching-platform feature. It turns the
local terminal-first FuFan Teaching Agent into a browser-operable Agent console
for teachers and students.

The first release should let a user connect a model, create or choose a session,
send tasks to the FuFan runtime backend, see live Agent output, inspect a
workspace with read-only file previews, and watch a basic teaching event stream
on the right side.

This feature is intentionally separate from Superpowers. It creates the Web
operation surface that the later Superpowers integration will reuse.

## Research Reference

The reference product is `siteboon/claudecodeui`, now branded as CloudCLI:

- https://github.com/siteboon/claudecodeui

Useful ideas from that project:

- Project and session list in a left sidebar.
- Web chat surface for coding agents.
- Provider or CLI selection.
- Session history and resumable conversations.
- Tool result cards.
- File explorer and read/edit surfaces.
- Permission and tool safety controls.
- Mobile and remote access patterns.

Important constraints:

- `claudecodeui` is AGPL-3.0-or-later. FuFan Teaching Agent should not copy its
  source code into this repository.
- Its backend is Node/Express/WebSocket and wraps multiple external CLI agents.
  FuFan already has a Rust Runtime API and should use that first.
- The product difference is teaching visibility. The right-side teaching event
  stream is a core requirement, not an optional plugin.

## Decisions

### Layout

Use a desktop three-column layout inspired by CloudCLI:

- Left: projects, sessions, and read-only workspace files.
- Center: model connection, current session, prompt input, live output, and tool
  result cards.
- Right: basic teaching event stream.

The layout should target desktop screens first and only guarantee a polished
experience at 1280px width and above.

### Backend Strategy

Use the existing FuFan/CodeWhale Rust Runtime API as the only active backend in
the first release.

Preserve a provider abstraction in the frontend state and UI so future providers
can be added without rewriting the console:

- Active provider in Phase 2 Feature 001: `fufan-runtime`.
- Future provider placeholders: Claude Code, Codex CLI, Cursor CLI, OpenCode,
  Gemini CLI.

The first release must not spawn or manage external CLI agents directly.

### Frontend Project

Create a new independent frontend workspace:

```text
web-console/
```

Use:

- Vite
- React
- TypeScript

Do not add this console into the existing `web/` project. The current `web/`
directory is a Next.js community/site surface, not the product operation
console.

### Brand Theme

The Web Console should reuse the Beyondata/FuFan brand token language from:

```text
/Users/muyu/MuYuWorkSpace/Beyondata-Website/src/styles/global.css
```

Implementation should extract a focused console token file instead of copying
the whole website stylesheet:

```text
web-console/src/styles/tokens.css
```

The console should map its dense product UI to the existing semantic vocabulary:

- `surface-*`
- `fill-*`
- `content-*`
- `border-*`
- `brand-accent`
- `brand-purple`
- `cta`
- `cta-foreground`

The console defaults to the light theme, supports switching to dark theme, and
may persist the light/dark preference in browser local storage. Runtime auth
tokens and model API keys must not use browser local storage.

### Teaching Sidebar Depth

The first release should include a basic real-time teaching event stream backed
by structured Runtime API teaching events, not a full teaching sidebar.

Show events for:

- Skills
- Tools
- Shell
- Files
- Context
- Safety

Detailed filters, event detail drawers, report export UI, and full parity with
the TUI sidebar belong to Phase 2 Feature 002: Web Teaching Sidebar.

Each event is compact by default and can be expanded for sanitized structured
details. Student/teacher visibility mode switching is deferred to Feature 002.
Feature 001 is teacher-operated local use and may show all redacted teaching
events available to the current local user.

## User Experience

### First Run

1. Teacher starts the FuFan Runtime API locally.
2. Teacher opens the Web Runtime Console.
3. Console checks `/v1/runtime/info`.
4. If the runtime is reachable, the console shows workspace and session state.
5. If not reachable, the console shows a connection panel with the expected local
   runtime URL and token instructions.

### Model Connection

The first release supports light model connection from the Web page:

- provider
- model
- base URL, optional
- API key

The goal is to let a teacher or student connect their own model and immediately
run one Agent session from the browser.

Non-goals:

- Full provider administration.
- Multi-user key management.
- Bulk model editing.
- Cloud account management.
- Secret migration across machines.

API keys must not be persisted in local browser storage unless explicitly
designed and reviewed later. Feature 001 supports both temporary and persisted
backend provider connections:

- `persist: false`: apply credentials only to the active Runtime
  process/session path.
- `persist: true`: write confirmed settings to the local backend configuration
  file after explicit user confirmation.

Runtime API responses, logs, teaching events, and Web UI state must never echo
raw API keys or masked key fragments. Provider responses should expose only
whether an API key is configured.

### Project And Session List

The left column should show:

- Current workspace.
- Recent sessions or threads.
- Session title or prompt preview.
- Model name.
- Last updated time.
- Current running state if available.

The first release may map "session" to existing Runtime API threads if that is
the most direct backend fit. It does not need to preserve a separate frontend
session database.

### Prompt And Output

The center column should support:

- Prompt input.
- Submit button.
- Running/interrupt state when the backend supports it.
- Streaming Agent text output.
- Tool result cards for tool calls and results.
- Basic error display.

The user should be able to complete a simple lesson task without opening a
terminal.

### Read-Only Files

The first release supports read-only file browsing:

- Workspace file tree.
- File preview.
- Highlight files recently read or changed by the Agent.

The Web Console must not support manual file editing or saving in this feature.
All code changes should still be made by the Agent through the backend runtime.

### Teaching Event Stream

The right column shows the classroom trace as a chronological list.

Each event should show:

- timestamp
- category
- short title
- compact summary
- status or severity when available

The stream consumes structured `EducationEvent`-style backend data through
Runtime API contracts:

- `GET /v1/threads/{id}/teaching-events`
- `GET /v1/threads/{id}/teaching-events/stream`

The historical endpoint must support bounded retrieval with parameters such as
`limit` and `afterSeq`. Each teaching event must include a stable per-thread
`seq` value for ordering, de-duplication, and reconnect/backlog handling.

## Runtime API Dependencies

Audited on 2026-06-18 against the local Rust Runtime API implementation.

Existing Runtime API endpoints that are relevant:

- `GET /v1/runtime/info`
- `GET /v1/workspace/status`
- `GET /v1/threads/summary`
- `GET /v1/threads`
- `POST /v1/threads`
- `GET /v1/threads/{id}`
- `PATCH /v1/threads/{id}`
- `POST /v1/threads/{id}/resume`
- `POST /v1/threads/{id}/fork`
- `POST /v1/threads/{id}/undo`
- `POST /v1/threads/{id}/retry`
- `POST /v1/threads/{id}/turns`
- `GET /v1/threads/{id}/events`
- `POST /v1/threads/{id}/turns/{turn_id}/steer`
- `POST /v1/threads/{id}/turns/{turn_id}/interrupt`
- `POST /v1/threads/{id}/compact`
- `POST /v1/approvals/{approval_id}`
- `POST /v1/user-input/{thread_id}/{input_id}`
- `GET /v1/skills`
- `POST /v1/skills/{name}`
- `GET /v1/apps/mcp/servers`
- `GET /v1/apps/mcp/tools`

Existing Runtime API capabilities that are enough for the first Web Console
skeleton, plus the new endpoints below:

- Runtime reachability, service metadata, auth requirement, and CORS support.
- Thread-backed session list, thread details, create/update/resume/fork/undo,
  retry, compact, and turn execution.
- Live thread events through SSE with backlog replay support for Agent output.
- Runtime events for user messages, agent messages, reasoning, tool calls,
  command execution, file-change-like tools, context compaction, approvals,
  sandbox denial, user input requests, errors, and status updates.
- Skills discovery and enable/disable toggling.
- MCP server and tool discovery.
- Workspace git status: branch, head, dirty state, staged/unstaged/untracked
  counts, ahead/behind counts.

The Web Console should map Runtime threads directly to frontend sessions in
Feature 001. It does not need a separate session database.

### Confirmed Backend Gaps

The following gaps were verified in the current source and should be treated as
required backend work before a polished Feature 001 frontend can be completed:

- No Runtime API endpoint exposes a workspace file tree. Existing `GET
  /v1/workspace/status` only returns git/status metadata.
- No Runtime API endpoint exposes read-only file preview content for the Web
  file pane.
- No Runtime API endpoint accepts or tests lightweight model connection settings
  from the browser, such as provider, model, base URL, and API key. Runtime
  thread creation can set a model string, and backend config supports provider
  API keys/base URLs, but there is no Web-facing provider connection contract.
- Structured education events currently live in the TUI education observer. They
  are not exposed as a Runtime API stream. Feature 001 must expose structured
  education events through Runtime API before building the right teaching
  timeline.

### Required Backend Additions For Feature 001

Add a small Runtime API layer before or alongside the frontend skeleton:

- `GET /v1/workspace/files?path=<relative-path>`: lazily returns immediate
  children for one safe workspace-relative directory.
- `GET /v1/workspace/files/content?path=<relative-path>`: returns bounded
  read-only JSON preview content with file size, 200KB truncation metadata, and
  binary/unsupported metadata.
- `GET /v1/providers`: returns supported provider identifiers, current selected
  provider/model if available, and whether each provider has a configured key.
- `POST /v1/providers/test`: tests a temporary provider/model/base URL/API key
  connection without storing the raw secret in browser storage.
- `POST /v1/providers/connection`: applies a validated provider/model
  connection to the current Runtime process/session path and optionally persists
  confirmed settings to the local backend configuration file.
- `GET /v1/threads/{id}/teaching-events`: returns bounded structured teaching
  event history for one Runtime thread/session.
- `GET /v1/threads/{id}/teaching-events/stream`: streams new structured teaching
  events through SSE.

### Teaching Event Strategy

Feature 001 should expose structured teaching events in the backend and render
the right column from those events:

- tool started/completed -> `Tools`
- shell command execution -> `Shell`
- file reads/changes and file tool names -> `Files`
- context compaction and turn usage -> `Context`
- approval, sandbox denial, user input, and errors -> `Safety`
- skill loading/discovery state -> `Skills`

Feature 002 should build on this foundation with richer filtering, classroom
visibility modes, report affordances, and full Web Teaching Sidebar parity.

## Architecture

### Frontend Modules

Suggested module boundaries:

- `runtime-client`: typed API client for Runtime API and SSE.
- `providers`: provider abstraction and active `fufan-runtime` provider.
- `sessions`: thread/session list, selected session, running state.
- `chat`: prompt composer, messages, streaming output, tool cards.
- `workspace`: read-only file tree and preview.
- `teaching-events`: structured teaching event client, timeline, expand/collapse
  details, and category rendering.
- `settings`: runtime URL, token, light model connection.
- `layout`: desktop three-column shell.
- `theme`: Beyondata token extraction, light/dark switching, and theme
  persistence for non-secret preferences.

### Data Flow

1. Browser loads the console.
2. Console checks runtime health and capabilities.
3. Console fetches thread summaries and current workspace state.
4. User creates or selects a thread.
5. User submits a prompt.
6. Frontend starts the turn through the Runtime API.
7. Frontend subscribes to thread events through SSE.
8. Chat output updates from Runtime thread event streams.
9. Teaching timeline updates from structured teaching-event history and SSE.

### Security Boundary

The browser must not execute shell commands directly. All execution goes through
the Runtime API and its existing approval, sandbox, and policy mechanisms.

The console should treat the Runtime API token as sensitive. The spec does not
require a cloud authentication system for the first release.

The browser may persist the Runtime URL and theme preference, but it must not
persist the Runtime auth token or model API keys. Model API keys may be written
only by the backend after explicit user confirmation.

## Non-Goals

- No direct Claude Code, Codex CLI, Cursor CLI, Gemini CLI, or OpenCode process
  management.
- No full Web IDE.
- No manual file editing or saving.
- No mobile-first layout.
- No complete model management backend.
- No student/teacher visibility mode switch in Feature 001.
- No in-browser approve/reject controls.
- No Superpowers install flow.
- No full teaching report export UI.
- No class, account, tenant, or SaaS management.

## Acceptance Criteria

- A developer can start the Runtime API and open `web-console/` locally.
- The console can connect to the Runtime API and display runtime status.
- A user can enter provider/model/base URL/API key settings, test them, and
  apply them with explicit persistence choice.
- A user can create or select a runtime thread/session.
- A user can submit a prompt from the browser and receive live output.
- The center output distinguishes assistant text from tool activity.
- A running turn can be interrupted from the browser.
- Approval-required events are visible, while approve/reject resolution remains
  in the terminal for Feature 001.
- The backend exposes structured teaching event history and SSE stream.
- The right column shows a compact chronological teaching event stream with
  expandable sanitized details.
- The left column shows workspace/session context and read-only file browsing.
- Workspace file preview is capped, read-only, rejects path escape attempts, and
  does not render raw binary content.
- Raw API keys do not appear in Web UI, Runtime API responses, logs, or teaching
  event payloads.
- The Web Console uses extracted Beyondata/FuFan brand tokens and supports
  default-light plus switchable dark theme.
- Manual acceptance includes a real model-provider run and real tool activity
  including file read and shell command events.
- The first release works well at 1280px desktop width or wider.
- The implementation does not copy AGPL code from `claudecodeui`.

## Follow-Up Features

Phase 2 Feature 002 should turn the basic event stream into a full Web Teaching
Sidebar with richer grouping, details, filtering, summaries, and export affordances.

Phase 2 Feature 003 should add a guided Superpowers integration page with
one-click install, verification, and skill visibility using the same Web console
and Runtime API foundation.
