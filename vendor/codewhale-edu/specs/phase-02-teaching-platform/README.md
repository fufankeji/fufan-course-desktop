# Phase 2: Teaching Platform

## Status

Active.

Phase 2 turns FuFan Teaching Agent from a local terminal MVP into a browser-
operable teaching platform. The platform should let teachers and students run
Agent tasks from a Web page, inspect live runtime activity in a visual teaching
sidebar, and then connect mainstream agent-development ecosystems such as
Superpowers through a guided one-click flow.

## Features

| Feature | Status | Purpose |
| --- | --- | --- |
| `001-web-runtime-console` | Planned | Browser console for model setup, task input, command execution, and live output. |
| `002-web-teaching-sidebar` | Planned | Browser version of the teaching panels: skills, tools, shell, files, context, and safety. |
| `003-superpowers-integration` | Draft | Guided Superpowers installation and use through the Web platform and runtime backend. |

## Phase Scope

Phase 2 should prioritize the user path that makes integrations teachable:

- Web operation before terminal-only workflows.
- Runtime API calls instead of frontend shell execution.
- Live teaching visibility before advanced plugin compatibility.
- Guided integration pages before raw command documentation.

Superpowers remains the first ecosystem integration, but it should follow the
Web runtime console and Web teaching sidebar so the install and first-use flow is
visible to non-terminal users.
