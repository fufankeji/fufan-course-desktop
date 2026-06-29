# FuFanTui Specs

This directory is the long-term product and engineering specification archive
for FuFan Teaching Agent.

The structure follows a Spec Kit style: each feature owns its own directory and
keeps related artifacts together as `spec.md`, `plan.md`, `tasks.md`, and
optional supporting files. FuFanTui adds a phase layer so roadmap periods stay
clear over time.

## Directory Rules

```text
specs/
  phase-01-teaching-tui-mvp/
    README.md
    features/
      001-teaching-agent-tui/
        README.md
        spec.md
        plan.md
        tasks.md
  phase-02-teaching-platform/
    README.md
    features/
      001-web-runtime-console/
        README.md
        spec.md
        plan.md
        tasks.md
      002-web-teaching-sidebar/
        README.md
        spec.md
        plan.md
        tasks.md
      003-superpowers-integration/
        README.md
        spec.md
        plan.md
        tasks.md
```

## Artifact Rules

- `spec.md` is the long-lived source of truth for the feature.
- `plan.md` explains implementation architecture and sequencing.
- `tasks.md` breaks the plan into executable tasks.
- `research.md`, `contracts/`, `quickstart.md`, or `notes.md` may be added when
  a feature needs extra evidence or usage material.
- Completed features stay in their feature directory and are marked archived in
  that feature's `README.md`.
- Do not add new dated files directly under `specs/`; create or update a feature
  directory instead.

## Phases

| Phase | Status | Purpose |
| --- | --- | --- |
| Phase 1 | Archived | Local teaching TUI MVP, sidebar visibility, exports, classroom docs. |
| Phase 2 | Active | Web teaching platform: browser runtime console, browser teaching sidebar, then Superpowers integration. |

## Current Feature Index

| Feature | Phase | Status | Spec |
| --- | --- | --- | --- |
| 001 Teaching Agent TUI | Phase 1 | Archived | `phase-01-teaching-tui-mvp/features/001-teaching-agent-tui/spec.md` |
| 001 Web Runtime Console | Phase 2 | Planned | `phase-02-teaching-platform/features/001-web-runtime-console/README.md` |
| 002 Web Teaching Sidebar | Phase 2 | Planned | `phase-02-teaching-platform/features/002-web-teaching-sidebar/README.md` |
| 003 Superpowers Integration | Phase 2 | Draft | `phase-02-teaching-platform/features/003-superpowers-integration/spec.md` |
