# Teaching Mode Guide

## Purpose

Teaching mode shows the Agent's background activity during an AI programming
lesson. It is designed for teacher-led demos where students should see not only
the final answer, but also the sequence of context loading, command execution,
tool use, safety checks, and exportable recap artifacts.

## First Demo

1. Open the example course workspace: `course/examples/python-debugging`.
2. Start FuFan Teaching Agent TUI.
3. Ask the Agent to inspect the project.
4. Ask it to run tests.
5. Ask it to fix one failing test.
6. Run `/export`.

## What To Explain In Class

- Timeline shows the order of Agent actions.
- Shell shows commands, exit codes, and duration.
- Files shows what changed.
- Skills shows reusable workflows loaded for the session.
- Context shows files and summaries used by the Agent.
- Safety shows approval and blocked actions.

## Demo Prompts

```text
请读取这个项目结构，并解释下一步要做什么
! pwd
! cargo test --version
/export
```

## 45-Minute Demo Script

1. 5 min: Explain the task and show `course.yaml`.
2. 10 min: Ask the Agent to inspect the project and highlight file/context events.
3. 10 min: Run tests and highlight shell events.
4. 10 min: Ask the Agent to fix the bug and highlight file diff events.
5. 5 min: Run `/export` and review Markdown.
6. 5 min: Discuss safety approvals and what was hidden from students.

## Expected Smoke Test Result

- Teaching sidebar displays events.
- Export files are generated under `exports/sessions/<session-id>/`.
- `session.jsonl` contains raw structured events.
- `session-report.md` contains a readable classroom recap.
- Home path and secrets are redacted.

## Exported Files

- `session.jsonl` contains raw structured events.
- `session-report.md` contains the readable classroom recap.

## Safety

Teaching mode redacts secrets and sensitive paths before display and export. It
is not a container sandbox. Use trusted local workspaces for first-phase demos.
