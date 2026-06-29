# Web Runtime Console Implementation Plan

> For agentic workers: implement this plan task-by-task. Keep Feature 001 scoped
> to a local Web runtime console. Do not start Superpowers install flow work in
> this feature.

**Goal:** Provide a browser-operated FuFan Runtime console where a teacher or
student can connect a model, create/select a runtime session, submit prompts,
watch live Agent output, browse workspace files read-only, and see a basic
right-side teaching event stream.

**Architecture:** Reuse the existing Rust Runtime API for sessions, turns, SSE
runtime events, Skills, MCP, approvals, and workspace git status. Add the
missing Runtime API endpoints for workspace files, provider connection, and
structured teaching events, then build an independent Vite/React/TypeScript
frontend in `web-console/`.

**Tech Stack:** Rust workspace, Axum Runtime API, Vite, React, TypeScript, CSS
modules or plain scoped CSS, SSE client, extracted Beyondata/FuFan design
tokens, existing Cargo target on external disk when local disk space is
constrained.

---

## Source Context

Confirmed backend sources:

- `crates/tui/src/runtime_api.rs`: Runtime HTTP routes, auth, workspace status,
  Skills, MCP, approvals, threads, turns, SSE events.
- `crates/tui/src/runtime_threads.rs`: Thread, turn, item, and runtime event
  persistence and event mapping.
- `crates/tui/src/config.rs`: Provider/model/API key/base URL config model.
- `crates/tui/src/config_persistence.rs`: Existing config write helpers for
  saved provider values.
- `crates/tui/src/education/observer.rs`: TUI-only mapping from engine events to
  structured education events; should be extracted or reused for Runtime API
  teaching events.
- `crates/tui/src/education/events.rs`: Education event schema.
- `crates/tui/src/tui/file_tree.rs`: Existing TUI file-tree behavior that may
  inform the read-only Web file API.
- `/Users/muyu/MuYuWorkSpace/Beyondata-Website/src/styles/global.css`: source
  brand token vocabulary for Web Console theme extraction.
- `specs/phase-02-teaching-platform/features/001-web-runtime-console/contracts/runtime-api.md`:
  API contract source of truth for new Feature 001 Runtime endpoints.

Existing frontend source `web/` is a Next.js community/site surface and should
not be reused for the runtime console.

## File Structure

Files and directories to create:

- `web-console/`
- `web-console/package.json`
- `web-console/vite.config.ts`
- `web-console/tsconfig.json`
- `web-console/index.html`
- `web-console/src/main.tsx`
- `web-console/src/App.tsx`
- `web-console/src/styles/tokens.css`
- `web-console/src/styles/app.css`
- `web-console/src/runtime/client.ts`
- `web-console/src/runtime/types.ts`
- `web-console/src/providers/`
- `web-console/src/sessions/`
- `web-console/src/chat/`
- `web-console/src/workspace/`
- `web-console/src/teaching-events/`
- `web-console/src/settings/`
- `web-console/src/layout/`
- `web-console/src/theme/`

Backend files likely to modify:

- `crates/tui/src/runtime_api.rs`
- `crates/tui/src/config.rs` if provider serialization helpers are needed
- `crates/tui/src/config_persistence.rs` for explicit provider persistence
- `crates/tui/src/runtime_threads.rs` for teaching event persistence or event
  bridging if needed
- `crates/tui/src/education/observer.rs` if the mapper must be made reusable

## Task 1: Add Workspace File Runtime APIs

**Files:**
- Modify: `crates/tui/src/runtime_api.rs`
- Test: Runtime API unit tests near existing workspace status tests.

- [ ] Add request/response structs for read-only workspace file tree entries.
- [ ] Add safe relative path resolution that prevents escaping the active
  workspace.
- [ ] Add `GET /v1/workspace/files?path=<relative-path>`.
- [ ] Exclude heavy/generated folders by default, including `target`,
  `node_modules`, `.git`, and build artifacts.
- [ ] Add deterministic sorting: directories first, then files, both by name.
- [ ] Return current directory metadata plus an `entries` list.
- [ ] Return entry metadata needed by UI: name, relative path, kind, size when
  cheap, modified timestamp when cheap, and `hasChildren` when cheap.
- [ ] Add `GET /v1/workspace/files/content?path=<relative-path>`.
- [ ] Bound preview size to 200KB and return truncation metadata.
- [ ] Detect binary/unreadable files and return a structured non-preview result.
- [ ] Return JSON for previews; do not return raw text or raw binary data.
- [ ] Add tests for normal tree, path traversal rejection, hidden/generated
  exclusions, text preview, binary preview, and truncation.

## Task 2: Add Provider Connection APIs

**Files:**
- Modify: `crates/tui/src/runtime_api.rs`
- Possibly modify: `crates/tui/src/config.rs`
- Modify: `crates/tui/src/config_persistence.rs` if existing helpers do not
  cover the selected provider/base URL/model fields.

- [ ] Add `GET /v1/providers` to expose supported provider identifiers, current
  provider/model, base URL presence, and key presence without returning secrets.
- [ ] Add `POST /v1/providers/test` to validate provider/model/base URL/API key
  inputs without persistence.
- [ ] Add `POST /v1/providers/connection` to apply the selected connection for
  the current Runtime process/session path.
- [ ] Support `persist: false` for temporary active Runtime use.
- [ ] Support `persist: true` for explicit local backend config persistence.
- [ ] Require frontend confirmation before sending `persist: true`.
- [ ] Keep raw API keys out of browser local storage.
- [ ] Return `apiKeyConfigured` only; never return raw keys or masked key
  fragments.
- [ ] Add tests that responses, errors, logs, and teaching events never echo the
  raw API key.

## Task 3: Add Structured Teaching Event Runtime APIs

**Files:**
- Modify: `crates/tui/src/runtime_api.rs`
- Modify: `crates/tui/src/runtime_threads.rs` if event persistence/seq support is
  needed there.
- Modify: `crates/tui/src/education/observer.rs` if the current mapper needs to
  be extracted for Runtime API reuse.
- Test: Runtime API teaching event unit tests.

- [ ] Expose structured `EducationEvent`-style records for Runtime threads.
- [ ] Add a stable monotonically increasing `seq` field per thread.
- [ ] Add `GET /v1/threads/{id}/teaching-events`.
- [ ] Support bounded history with `limit` and `afterSeq` or `since`.
- [ ] Add `GET /v1/threads/{id}/teaching-events/stream` as SSE.
- [ ] Map events into categories: Skills, Tools, Shell, Files, Context, Safety.
- [ ] Redact all event payloads before they reach Runtime API responses.
- [ ] Add tests for history, SSE payload shape, ordering, redaction, and
  reconnect/backlog behavior.

## Task 4: Scaffold `web-console/`

**Files:**
- Create: `web-console/` project files.

- [ ] Initialize Vite React TypeScript.
- [ ] Add local dev scripts: `dev`, `build`, `preview`, `typecheck`.
- [ ] Extract focused brand tokens from Beyondata-Website into
  `web-console/src/styles/tokens.css`.
- [ ] Support default-light theme and switchable dark theme.
- [ ] Persist only theme preference in browser local storage.
- [ ] Add runtime URL and token configuration through UI state and environment
  defaults.
- [ ] Persist Runtime URL only; keep Runtime token in memory.
- [ ] Add a typed Runtime API client.
- [ ] Add SSE subscription helper with reconnect and backlog support where
  backend supports it.
- [ ] Build a desktop-only three-column shell for 1280px and wider.

## Task 5: Implement Runtime Connection And Session Flow

**Files:**
- Modify: `web-console/src/runtime/`
- Modify: `web-console/src/settings/`
- Modify: `web-console/src/sessions/`
- Modify: `web-console/src/layout/`

- [ ] Show Runtime API status from `/v1/runtime/info`.
- [ ] Show auth/token instructions when the runtime is unreachable or
  unauthorized.
- [ ] Show model connection form using provider APIs.
- [ ] Support provider test and provider connection apply/save flows.
- [ ] Require explicit user confirmation for provider persistence.
- [ ] Load thread summaries and map them to sessions.
- [ ] Create a new thread/session.
- [ ] Select an existing thread and load details.

## Task 6: Implement Prompt, Output, And Tool Cards

**Files:**
- Modify: `web-console/src/chat/`
- Modify: `web-console/src/runtime/events.ts`

- [ ] Submit prompt through `POST /v1/threads/{id}/turns`.
- [ ] Subscribe to `GET /v1/threads/{id}/events`.
- [ ] Render user messages, assistant messages, reasoning/status items, tool
  calls, command execution, file changes, and errors.
- [ ] Support interrupt through
  `POST /v1/threads/{id}/turns/{turn_id}/interrupt`.
- [ ] Keep output usable without requiring the terminal.

## Task 7: Implement Read-Only Workspace Pane

**Files:**
- Modify: `web-console/src/workspace/`

- [ ] Render workspace git/status summary.
- [ ] Render file tree from `GET /v1/workspace/files`.
- [ ] Preview selected files through `GET /v1/workspace/files/content`.
- [ ] Highlight files touched by runtime events.
- [ ] Do not implement manual editing or save buttons in Feature 001.

## Task 8: Implement Structured Teaching Event Stream

**Files:**
- Modify: `web-console/src/teaching-events/`
- Modify: `web-console/src/runtime/client.ts`
- Modify: `web-console/src/runtime/types.ts`

- [ ] Render chronological events in the right column.
- [ ] Show timestamp, category, title, summary, and severity/status.
- [ ] Fetch historical events from `GET /v1/threads/{id}/teaching-events`.
- [ ] Subscribe to `GET /v1/threads/{id}/teaching-events/stream`.
- [ ] Use event `seq` for ordering, de-duplication, and reconnect gap filling.
- [ ] Render compact events by default with expandable sanitized details.
- [ ] Display Skills/Tools/Shell/Files/Context/Safety categories from backend
  event data.

## Task 9: Verification

**Commands:**

```bash
cargo test -p codewhale-tui runtime_api
cargo build -p codewhale-tui
cd web-console && npm install
cd web-console && npm run typecheck
cd web-console && npm run build
```

Manual verification:

- [ ] Start Runtime API locally.
- [ ] Start `web-console` dev server.
- [ ] Open the console at desktop width.
- [ ] Connect Runtime API with token if required.
- [ ] Configure/test model connection without persisting secrets in the browser.
- [ ] Explicitly choose whether to persist provider settings to local backend
  config.
- [ ] Create/select a session.
- [ ] Submit a prompt using a real provider/API key.
- [ ] Trigger real file read and shell command activity.
- [ ] Observe live output and tool cards.
- [ ] Browse and preview a workspace file.
- [ ] Confirm structured right-side teaching events update during the run.
- [ ] Verify raw API keys do not appear in Web UI, Runtime API responses, logs,
  or teaching event payloads.
- [ ] Verify the UI uses extracted Beyondata/FuFan tokens and supports
  default-light plus switchable dark theme.

## Completion Criteria

- Runtime API has the missing file, provider connection, and structured teaching
  event endpoints required by Feature 001.
- `web-console/` runs independently from the existing `web/` site.
- A teacher/student can complete one browser-based Agent lesson flow without
  operating the terminal after startup.
- Right-side teaching visibility is backed by structured backend teaching event
  contracts.
- Raw API keys are not exposed in browser storage, responses, logs, or teaching
  events.
- The frontend uses extracted Beyondata/FuFan brand tokens.
- No AGPL source code from `claudecodeui` is copied.
