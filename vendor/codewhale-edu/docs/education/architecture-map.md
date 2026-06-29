# Education Architecture Map

## Baseline

- Upstream remote: https://github.com/Hmbown/CodeWhale
- Imported revision: cd00059ca4a3838b299ca4a56eb6a87f5becb0c9
- TUI package: codewhale-tui
- Verified build command: cargo test -p codewhale-tui --no-run

## Hook Targets

- Session lifecycle: `crates/tui/src/tui/ui.rs` handles `EngineEvent::TurnStarted` and `EngineEvent::TurnComplete`; session IDs are stored on `App::current_session_id`.
- TUI app state: `crates/tui/src/tui/app.rs` owns `App`; education runtime state is held on `App::education_observer`.
- TUI rendering: `crates/tui/src/tui/ui.rs` drains engine events and updates transcript/sidebar state; teaching sidebar rendering will mount from this event stream.
- Tool registry: `crates/tui/src/tools/mod.rs` and `crates/tui/src/tools/handle.rs` register model-visible tools; execution is dispatched through `crates/tui/src/core/engine/tool_execution.rs::Engine::execute_tool_with_lock`.
- Shell execution: shell tools are model-visible tool events named `exec_shell`, `exec_shell_wait`, `exec_shell_interact`, `exec_shell_cancel`, `task_shell_start`, and `task_shell_wait`; process construction is centralized in `crates/tui/src/shell_dispatcher.rs`.
- File read/write: `crates/tui/src/tools/file.rs` implements `ReadFileTool`, `WriteFileTool`, `EditFileTool`, and related file helpers; education mapping derives read/write events from tool names and cached tool inputs.
- Skill loading: `crates/tui/src/skills/mod.rs::SkillRegistry::discover*` loads available skills; active UI skill selection is kept on `App::active_skill` and `App::cached_skills`.
- Context updates: `crates/tui/src/core/events.rs` emits `CompactionStarted`, `CompactionCompleted`, purge events, and `TurnComplete { usage, .. }`; `crates/tui/src/tui/ui.rs` observes those events for teaching context updates.
- Approval dialog: `crates/tui/src/core/engine/turn_loop.rs` emits `EngineEvent::ApprovalRequired`; `crates/tui/src/tui/ui.rs` handles auto-approval/session-denial and modal routing.
- Export/session end: `crates/tui/src/education/observer.rs` writes JSONL through `EducationJsonlWriter` under `exports/sessions/<session-id>/session.jsonl`; Markdown export uses `education::report::render_markdown_report`.

## Notes

- Keep education code under `crates/tui/src/education/`.
- Prefer event hooks over runtime rewrites.
