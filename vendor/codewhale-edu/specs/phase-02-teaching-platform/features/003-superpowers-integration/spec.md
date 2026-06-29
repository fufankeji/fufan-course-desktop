# Superpowers Integration Design

Date: 2026-06-18

## Status

Draft for implementation planning.

This is the third Phase 2 feature after the teaching TUI MVP. It follows the Web
runtime console and Web teaching sidebar so Superpowers can be installed and
used through a browser-visible teaching flow instead of terminal-only commands.
It defines how FuFan Teaching Agent should connect Superpowers, guide teachers
and students through installation and use, and expose the integration activity
in the teaching sidebar.

## Product Goal

FuFan Teaching Agent must make mainstream agent-development tool ecosystems
visible and teachable. Superpowers is the first integration because it is a
widely used skills workflow for coding agents and its repository already ships a
portable `skills/` library plus harness-specific plugin packages.

The learner-facing outcome is simple:

1. A teacher can install Superpowers from the Web platform or TUI without
   manually reading GitHub layout details.
2. A student can see which Superpowers skills are available and which one is
   being loaded during a lesson.
3. A course document can tell users exactly how to install, verify, use, update,
   and troubleshoot the integration.

## Research Findings

Superpowers is a multi-harness skills framework. The upstream repository includes
`skills/`, `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.opencode/`,
and other harness-specific packaging. Its README documents installation across
Claude Code, Codex App/CLI, Cursor, Gemini CLI, OpenCode, Kimi Code, and related
agent harnesses.

CodeWhale already has three extension surfaces that matter for this integration:

- Skills: `SKILL.md` discovery and `/skill install` for portable skills.
- MCP: external tool servers through stdio or HTTP.
- Script tools: self-described scripts under the configured tools directory.

CodeWhale has already handled a direct Superpowers compatibility issue. GitHub
issue `Hmbown/CodeWhale#809` reports that `/skill install
https://github.com/obra/superpowers` failed on a repo-level symlink. PR
`Hmbown/CodeWhale#814` fixed this by ignoring symlinks outside the selected
skill root. Local tests also cover nested workflow-pack skill directories such
as `packages/superpowers/.../skills/using-superpowers/SKILL.md`.

Important boundary: CodeWhale supports portable `SKILL.md` bundles, but it does
not execute Claude/Codex plugin runtimes, `plugin.json` activation semantics,
custom slash-command bundles, build steps, or plugin-managed dashboard servers.
This means the first release should productize Superpowers as a skills
integration, not claim full plugin-runtime parity.

Reference links:

- https://github.com/obra/superpowers
- https://github.com/obra/superpowers/tree/main/skills
- https://github.com/Hmbown/CodeWhale/issues/809
- https://github.com/Hmbown/CodeWhale/pull/814
- https://github.com/Hmbown/CodeWhale/issues/2743

## Decision

This feature should ship after the browser runtime console and browser teaching
sidebar are available. The preferred user surface is a Web integration page with
a one-click connect button backed by the same runtime operations that the TUI
can expose through slash commands.

The TUI command surface remains useful for power users and fallback operation,
but it is not the primary education experience. The required surfaces are:

- a Web integration page: `Superpowers`
- a Web button: `Connect Superpowers`
- a slash command: `/integrations superpowers install`
- a command-palette action: `Integrations: Install Superpowers`
- a browser teaching sidebar panel that shows the integration state
- a course-facing Markdown guide

The runtime HTTP API should expose install/status/update/verify operations so
the browser button and TUI command use the same backend contract.

## User Experience

### Teacher Install Flow

1. Teacher opens the FuFan Teaching Platform in a browser.
2. Teacher opens `Integrations > Superpowers`.
3. The page shows a compact status view:
   - installed or not installed
   - detected source repository
   - installed skills count
   - active skill, if any
   - last update time
4. Teacher clicks `Connect Superpowers`, or uses the TUI fallback command
   `/integrations superpowers install`.
5. The backend downloads the portable Superpowers skills and installs them into the
   configured CodeWhale skills directory.
6. The Web page shows a verification result and suggests restarting or reloading
   if required by the current skill-discovery lifecycle.

### Student Lesson Flow

1. Teacher starts the first Superpowers lesson.
2. The sidebar shows `Superpowers: installed` and the available skills.
3. When the agent loads a skill such as `brainstorming`, the sidebar emits a
   `SkillLoaded` teaching event with:
   - skill name
   - source path
   - short description
   - trigger reason, if available
4. Tool calls, shell commands, file edits, and context changes continue to appear
   in the existing teaching panels.
5. `/export` includes a Superpowers section in the session report.

## Functional Requirements

### Integration Commands

- Add Web runtime API operations for Superpowers status, install, update, verify,
  and guide metadata.
- Add `/integrations` as a grouped command namespace for TUI fallback.
- Add `/integrations superpowers status`.
- Add `/integrations superpowers install`.
- Add `/integrations superpowers update`.
- Add `/integrations superpowers verify`.
- Add `/integrations superpowers guide`.

The command namespace must not replace existing `/skill install`; it wraps the
generic skill installer with Superpowers-specific defaults, verification, and
teaching messages.

### Installation Behavior

The installer should use the official Superpowers repository as the default
source:

```text
https://github.com/obra/superpowers
```

The implementation must install the Superpowers skills library, not only one
arbitrarily selected skill. Use this decision rule:

1. First verify whether existing `/skill install
   https://github.com/obra/superpowers` installs every top-level
   `skills/<name>/SKILL.md` directory.
2. If it installs only one selected skill, add a Superpowers-specific adapter
   that downloads the repository archive and copies each `skills/<name>/`
   directory into a namespaced local path.

The adapter path is the expected Phase 1 implementation unless verification
proves the generic installer already handles the complete library.

### Teaching Sidebar

The existing education event model already defines `SkillLoaded`. The observer
must map `load_skill` tool calls and manual `/skill <name>` activations into
`SkillLoaded` events instead of displaying them only as generic tool events.

The sidebar should include a compact Skills/Integrations section:

- Superpowers status: missing, installed, update available, or error.
- Available skill count.
- Active or last-loaded skill.
- Most recent integration event.

### Documentation

Ship user-facing documentation at `docs/education/superpowers-integration.md`
and expose the same guidance in the Web integration page.
It must include:

- what Superpowers is
- why it is used in the first lesson
- install command
- verification command
- first demo prompt
- update command
- uninstall or cleanup guidance
- known limitations around plugin-runtime parity

The guide must avoid saying that FuFan Teaching Agent fully runs Claude/Codex
plugin runtimes until that compatibility actually exists.

## Non-Goals For Phase 1

- No full Claude Code plugin runtime.
- No `plugin.json` command registration parity.
- No automatic execution of Superpowers hook scripts.
- No hidden network installation without an explicit user action.
- No support claim for every third-party Claude plugin.

## Architecture

### Command Layer

Add an integrations command group under the existing command registry. It should
route Superpowers subcommands to a small integration service rather than placing
all logic in command handlers.

### Integration Service

Create a focused Superpowers integration module with these responsibilities:

- resolve configured skills directory
- detect installed Superpowers skills
- install or update from upstream
- verify required skills are discoverable
- return structured status for TUI rendering and docs

### Skill Discovery

Use the existing skill registry as the source of truth after installation.
Do not create a parallel registry. The integration service may write metadata
such as `.installed-from` or `.integration.json`, but runtime skill availability
must come from normal `SKILL.md` discovery.

### Education Events

Extend the education observer to emit `SkillLoaded` for skill activation. Report
generation should include a "Skills loaded" summary.

### Runtime API Surface

Expose the same operations through the runtime HTTP API:

- `GET /v1/integrations`
- `GET /v1/integrations/superpowers`
- `POST /v1/integrations/superpowers/install`
- `POST /v1/integrations/superpowers/update`
- `POST /v1/integrations/superpowers/verify`

Those endpoints become the backend for a future browser "one-click connect"
button.

## Error Handling

- Network denied: explain the host and show the exact command to retry.
- GitHub unavailable: keep existing installation state unchanged.
- Archive format changed: fail with a message that names the expected
  `skills/<name>/SKILL.md` layout.
- Partial install: use staged writes and atomic replacement; never leave a half
  installed skill visible to the registry.
- Multi-skill plugin runtime detected: install only portable skills and warn
  that plugin runtime features are outside Phase 1.
- Restart required: show a clear instruction if the current session cannot hot
  reload model-visible skills.

## Testing And Verification

Automated tests:

- Superpowers status detects missing installation.
- Superpowers install writes expected skill directories.
- Superpowers verify reports required skills such as `using-superpowers` and
  `brainstorming`.
- `load_skill` emits `SkillLoaded` education events.
- Exported report includes loaded skills.
- Existing skill installer tests continue to pass.

Manual smoke:

1. Start FuFan Teaching Agent in a lesson workspace.
2. Run `/integrations superpowers install`.
3. Run `/integrations superpowers verify`.
4. Ask the agent to use Superpowers brainstorming for a simple feature.
5. Confirm the sidebar shows the loaded skill.
6. Run `/export` and confirm the report includes Superpowers activity.

## Phase Plan

### Phase 1: TUI Integration And Teaching Visibility

- Add `/integrations superpowers status/install/update/verify/guide`.
- Install or sync the Superpowers skills library.
- Emit `SkillLoaded` teaching events.
- Add sidebar integration status.
- Add `docs/education/superpowers-integration.md`.

### Phase 2: Course Authoring Integration

- Allow `course.yaml` to declare required integrations.
- Show missing integration warnings at lesson start.
- Add an example Superpowers first lesson.
- Include integration status in exported session reports.

### Phase 3: Runtime API And Frontend Button

- Add runtime API endpoints for integration status and installation.
- Build a web/dashboard button that calls the same backend operations.
- Show install progress and verification results in the browser UI.

### Phase 4: Broader Ecosystem Adapters

- Add similar wrappers for MCP-first tools such as OpenSpec or Spec Kit when
  their install and runtime surfaces are confirmed.
- Add compatibility docs for Claude/Codex plugin packages.
- Evaluate whether custom slash-command registration is needed for selected
  plugin ecosystems.

## Acceptance Criteria

- A teacher can install Superpowers from the TUI without leaving the product.
- The product documentation contains a complete Superpowers setup and first-use
  path.
- The sidebar shows Superpowers status and loaded skill events.
- The exported report records Superpowers skill activity.
- The implementation does not claim full plugin-runtime compatibility.
- The feature remains compatible with existing `/skill install` behavior.

## Open Implementation Questions

- Whether generic `/skill install https://github.com/obra/superpowers` installs
  one selected skill or the complete skills library in the current fork.
- Whether model-visible skill reload can happen during the current TUI session or
  requires restart.
- Whether command-palette entries already have enough metadata for an
  integrations section or need a small registry extension.

These questions should be answered during implementation planning before code is
changed.
