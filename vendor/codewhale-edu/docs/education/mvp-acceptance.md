# MVP Acceptance

## Checklist

- [ ] Local TUI starts.
- [x] Product shell uses FuFan Teaching Agent branding.
- [x] Example `course.yaml` loads.
- [ ] Agent can complete a real code-inspection or code-editing task.
- [x] Teaching sidebar shows tool, shell, file, skill, context, course, and safety events.
- [x] Sensitive values are redacted in sidebar.
- [x] Sensitive values are redacted in exported reports.
- [x] `/export` creates `session.jsonl`.
- [x] `/export` creates `session-report.md`.
- [x] MIT license and third-party notice are present.

## Automated Evidence

- `cargo test -p codewhale-tui education -- --nocapture`
- `cargo test -p codewhale-tui --no-run`
- `cargo fmt --check`
- `git diff --check`
- `cargo clippy -p codewhale-tui --all-targets -- -D warnings`
- `cargo run -p codewhale-tui -- --version`
- `cargo run -p codewhale-tui -- --help`
- `npm test --workspace npm/codewhale`
- `npm test --workspace npm/runtime-sdk`

## Manual Demo Items

These items require a teacher-operated TUI session in a real terminal:

- Local TUI starts in the target classroom environment.
- Agent completes a real code-inspection or code-editing task against the lesson workspace.
- Teacher confirms the exported Markdown report is readable for the course recap.
