# Teaching Agent TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local education-focused fork of CodeWhale that shows Agent tool activity, skills, context, files, shell commands, safety approvals, and course progress in a teaching sidebar, then exports JSONL and Markdown session reports.

**Architecture:** Keep CodeWhale's core runtime intact and add an education observer layer inside the live TUI runtime. The observer emits sanitized structured events, stores them in memory, writes JSONL, drives a right-side teaching panel, and generates Markdown reports.

**Tech Stack:** Rust workspace, CodeWhale, ratatui, serde, serde_json, serde_yaml, chrono/time, tempfile, insta or snapshot tests if already used upstream.

---

## Source Context

This workspace currently contains only planning artifacts. The implementation starts by importing the CodeWhale fork into `codewhale-edu/`.

Confirmed upstream structure from CodeWhale:

- Root workspace: `Cargo.toml`
- Live TUI runtime: `crates/tui`
- Event/UI areas: `crates/tui/src/core/events.rs`, `crates/tui/src/tui/app.rs`, `crates/tui/src/tui/ui.rs`
- Tool areas: `crates/tui/src/tools/shell.rs`, `crates/tui/src/tools/file.rs`, `crates/tui/src/tools/mod.rs`
- Skill area: `crates/tui/src/skills.rs`
- Approval/UI area: `crates/tui/src/tui/approval.rs`
- Workspace crates also include `crates/core`, `crates/tools`, `crates/execpolicy`, `crates/hooks`, `crates/state`, `crates/tui-core`

If a file path differs in the checked-out fork, update `codewhale-edu/docs/education/architecture-map.md` first, then adjust only the affected task paths. Do not skip the architecture map.

## File Structure

Implementation files to create:

- `codewhale-edu/docs/education/architecture-map.md`  
  Records the exact upstream files used for shell, file, skill, approval, TUI layout, session lifecycle, and export hooks.

- `codewhale-edu/docs/education/teaching-mode.md`  
  User-facing teacher guide for the MVP.

- `codewhale-edu/THIRD_PARTY_NOTICES.md`  
  MIT and dependency notice starting point.

- `codewhale-edu/crates/tui/src/education/mod.rs`  
  Module exports for education observer.

- `codewhale-edu/crates/tui/src/education/events.rs`  
  Structured event types and event constructors.

- `codewhale-edu/crates/tui/src/education/redaction.rs`  
  Redacts API keys, tokens, home paths, env values, and sensitive file content.

- `codewhale-edu/crates/tui/src/education/writer.rs`  
  JSONL session writer.

- `codewhale-edu/crates/tui/src/education/state.rs`  
  In-memory event buffer and sidebar view model.

- `codewhale-edu/crates/tui/src/education/course.rs`  
  `course.yaml` loader and course state.

- `codewhale-edu/crates/tui/src/education/command_policy.rs`  
  Classroom command allow/approve/block classification.

- `codewhale-edu/crates/tui/src/education/report.rs`  
  Markdown report generator from JSONL events.

- `codewhale-edu/crates/tui/src/education/sidebar.rs`  
  ratatui rendering helpers for the teaching sidebar.

- `codewhale-edu/crates/tui/src/education/tests.rs`  
  Unit tests for event serialization, redaction, command policy, course loading, JSONL writing, and report rendering.

- `codewhale-edu/course/examples/python-debugging/course.yaml`  
  Example course configuration.

- `codewhale-edu/exports/.gitkeep`  
  Keeps export folder shape visible without committing session data.

Files likely to modify after architecture map verification:

- `codewhale-edu/crates/tui/src/main.rs`
- `codewhale-edu/crates/tui/src/lib.rs` if present
- `codewhale-edu/crates/tui/src/tools/shell.rs`
- `codewhale-edu/crates/tui/src/tools/file.rs`
- `codewhale-edu/crates/tui/src/tools/mod.rs`
- `codewhale-edu/crates/tui/src/skills.rs`
- `codewhale-edu/crates/tui/src/core/events.rs`
- `codewhale-edu/crates/tui/src/core/engine/turn_loop.rs`
- `codewhale-edu/crates/tui/src/tui/app.rs`
- `codewhale-edu/crates/tui/src/tui/ui.rs`
- `codewhale-edu/crates/tui/src/tui/approval.rs`
- `codewhale-edu/crates/tui/Cargo.toml`
- `codewhale-edu/README.md`
- `codewhale-edu/package.json`
- `codewhale-edu/npm/package.json` if present

## Task 1: Import CodeWhale Fork and Verify Baseline

**Files:**
- Create: `codewhale-edu/`
- Create: `codewhale-edu/docs/education/architecture-map.md`
- Modify: none
- Test: baseline build/test commands

- [ ] **Step 1: Clone or copy the fork**

Run one of these commands from `/Users/muyu/MuYuWorkSpace/FF-FuFanTui`:

```bash
git clone https://github.com/Hmbown/CodeWhale.git codewhale-edu
```

If the company has already created a fork, use that remote instead:

```bash
git clone <company-codewhale-fork-url> codewhale-edu
```

Expected: `codewhale-edu/Cargo.toml` exists.

- [ ] **Step 2: Record upstream revision**

Run:

```bash
cd codewhale-edu
git rev-parse HEAD
git status --short
```

Expected: a commit SHA and a clean worktree.

- [ ] **Step 3: Verify Rust toolchain**

Run:

```bash
cd codewhale-edu
rustc --version
cargo --version
```

Expected: Rust 1.88+ or the version required by upstream `rust-toolchain` if present.

- [ ] **Step 4: Build the baseline TUI crate**

Run:

```bash
cd codewhale-edu
cargo test -p codewhale-tui --no-run
```

Expected: compile succeeds. If the crate name differs, run `cargo metadata --no-deps --format-version 1` and update the architecture map with the actual TUI package name before continuing.

- [ ] **Step 5: Create architecture map**

Create `docs/education/architecture-map.md` with this structure:

```markdown
# Education Architecture Map

## Baseline

- Upstream remote: https://github.com/Hmbown/CodeWhale
- Imported revision: <paste git rev-parse HEAD output>
- TUI package: codewhale-tui
- Verified build command: cargo test -p codewhale-tui --no-run

## Hook Targets

- Session lifecycle:
- TUI app state:
- TUI rendering:
- Tool registry:
- Shell execution:
- File read/write:
- Skill loading:
- Context updates:
- Approval dialog:
- Export/session end:

## Notes

- Keep education code under `crates/tui/src/education/`.
- Prefer event hooks over runtime rewrites.
```

Replace only the `Imported revision` value with the actual SHA.

- [ ] **Step 6: Commit baseline**

Run:

```bash
cd codewhale-edu
git add docs/education/architecture-map.md
git commit -m "docs: map education integration points"
```

Expected: one docs commit.

## Task 2: Add Education Module Skeleton and Event Types

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/mod.rs`
- Create: `codewhale-edu/crates/tui/src/education/events.rs`
- Create: `codewhale-edu/crates/tui/src/education/tests.rs`
- Modify: `codewhale-edu/crates/tui/src/main.rs` or `codewhale-edu/crates/tui/src/lib.rs`
- Modify: `codewhale-edu/crates/tui/Cargo.toml`
- Test: `cargo test -p codewhale-tui education::tests::event_serializes_shell_finished -- --nocapture`

- [ ] **Step 1: Add serde dependencies if missing**

Open `crates/tui/Cargo.toml`. If `serde`, `serde_json`, and `time` or `chrono` are already present, reuse them. If not present, add:

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
time = { version = "0.3", features = ["formatting", "parsing", "serde"] }
```

- [ ] **Step 2: Create `education/mod.rs`**

```rust
pub mod events;

#[cfg(test)]
mod tests;
```

- [ ] **Step 3: Create `education/events.rs`**

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EducationActor {
    Teacher,
    Student,
    Agent,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EducationVisibility {
    Teacher,
    Student,
    Internal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EducationSeverity {
    Debug,
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EducationEventType {
    SessionStarted,
    SessionEnded,
    CourseLoaded,
    ModelSelected,
    SkillLoaded,
    ContextUpdated,
    ToolStarted,
    ToolFinished,
    ShellStarted,
    ShellFinished,
    FileRead,
    FileChanged,
    ApprovalRequested,
    ApprovalResolved,
    SafetyRedacted,
    SafetyBlocked,
    ExportCreated,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EducationEvent {
    pub id: String,
    pub session_id: String,
    #[serde(rename = "type")]
    pub event_type: EducationEventType,
    pub timestamp: String,
    pub actor: EducationActor,
    pub visibility: EducationVisibility,
    pub severity: EducationSeverity,
    pub summary: String,
    pub data: Value,
}

impl EducationEvent {
    pub fn new(
        id: impl Into<String>,
        session_id: impl Into<String>,
        event_type: EducationEventType,
        timestamp: impl Into<String>,
        actor: EducationActor,
        visibility: EducationVisibility,
        severity: EducationSeverity,
        summary: impl Into<String>,
        data: Value,
    ) -> Self {
        Self {
            id: id.into(),
            session_id: session_id.into(),
            event_type,
            timestamp: timestamp.into(),
            actor,
            visibility,
            severity,
            summary: summary.into(),
            data,
        }
    }
}
```

- [ ] **Step 4: Wire the module into the TUI crate**

If `crates/tui/src/lib.rs` exists, add:

```rust
pub mod education;
```

If the crate is binary-only and has no `lib.rs`, add this near the top of `crates/tui/src/main.rs`:

```rust
mod education;
```

- [ ] **Step 5: Add failing serialization test**

Create `crates/tui/src/education/tests.rs`:

```rust
use super::events::{
    EducationActor, EducationEvent, EducationEventType, EducationSeverity, EducationVisibility,
};
use serde_json::json;

#[test]
fn event_serializes_shell_finished() {
    let event = EducationEvent::new(
        "evt_12",
        "sess_001",
        EducationEventType::ShellFinished,
        "2026-06-17T15:35:12+08:00",
        EducationActor::Agent,
        EducationVisibility::Student,
        EducationSeverity::Info,
        "npm test exited with code 0",
        json!({
            "command": "npm test",
            "exit_code": 0,
            "duration_ms": 18420
        }),
    );

    let value = serde_json::to_value(event).expect("event serializes");
    assert_eq!(value["type"], "shell-finished");
    assert_eq!(value["actor"], "agent");
    assert_eq!(value["visibility"], "student");
    assert_eq!(value["data"]["exit_code"], 0);
}
```

- [ ] **Step 6: Run test**

Run:

```bash
cd codewhale-edu
cargo test -p codewhale-tui education::tests::event_serializes_shell_finished -- --nocapture
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd codewhale-edu
git add crates/tui/Cargo.toml crates/tui/src
git commit -m "feat: add education event types"
```

## Task 3: Add Redaction Layer

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/redaction.rs`
- Modify: `codewhale-edu/crates/tui/src/education/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/education/tests.rs`
- Test: `cargo test -p codewhale-tui education::tests::redacts_secrets_and_home_path -- --nocapture`

- [ ] **Step 1: Export redaction module**

Update `crates/tui/src/education/mod.rs`:

```rust
pub mod events;
pub mod redaction;

#[cfg(test)]
mod tests;
```

- [ ] **Step 2: Create `redaction.rs`**

```rust
use std::env;

const REDACTED: &str = "[REDACTED]";
const HOME: &str = "~";

pub fn redact_text(input: &str) -> String {
    let mut output = input.to_string();

    if let Some(home) = env::var_os("HOME").and_then(|v| v.into_string().ok()) {
        if !home.is_empty() {
            output = output.replace(&home, HOME);
        }
    }

    for marker in [
        "OPENAI_API_KEY=",
        "ANTHROPIC_API_KEY=",
        "DEEPSEEK_API_KEY=",
        "OPENROUTER_API_KEY=",
        "GITHUB_TOKEN=",
        "AWS_SECRET_ACCESS_KEY=",
    ] {
        output = redact_assignment(&output, marker);
    }

    output = redact_bearer_tokens(&output);
    output
}

pub fn is_sensitive_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".env")
        || lower.contains("/.ssh/")
        || lower.ends_with("id_rsa")
        || lower.ends_with("id_ed25519")
        || lower.contains("credentials")
        || lower.contains("secret")
}

fn redact_assignment(input: &str, marker: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for line in input.lines() {
        if let Some(index) = line.find(marker) {
            output.push_str(&line[..index + marker.len()]);
            output.push_str(REDACTED);
        } else {
            output.push_str(line);
        }
        output.push('\n');
    }
    if !input.ends_with('\n') {
        output.pop();
    }
    output
}

fn redact_bearer_tokens(input: &str) -> String {
    input
        .split_whitespace()
        .map(|part| {
            if part.len() > 24
                && (part.starts_with("sk-")
                    || part.starts_with("ghp_")
                    || part.starts_with("gho_")
                    || part.starts_with("xoxb-"))
            {
                REDACTED.to_string()
            } else {
                part.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
```

- [ ] **Step 3: Add tests**

Append to `crates/tui/src/education/tests.rs`:

```rust
use super::redaction::{is_sensitive_path, redact_text};

#[test]
fn redacts_secrets_and_home_path() {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/example".to_string());
    let input = format!(
        "OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz\npath={home}/project\n"
    );

    let output = redact_text(&input);

    assert!(output.contains("OPENAI_API_KEY=[REDACTED]"));
    assert!(!output.contains("sk-1234567890abcdefghijklmnopqrstuvwxyz"));
    assert!(!output.contains(&home));
}

#[test]
fn detects_sensitive_paths() {
    assert!(is_sensitive_path(".env"));
    assert!(is_sensitive_path("/Users/me/.ssh/id_ed25519"));
    assert!(is_sensitive_path("config/secrets.toml"));
    assert!(!is_sensitive_path("src/main.rs"));
}
```

- [ ] **Step 4: Run tests**

```bash
cd codewhale-edu
cargo test -p codewhale-tui education::tests::redacts_secrets_and_home_path education::tests::detects_sensitive_paths -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd codewhale-edu
git add crates/tui/src/education
git commit -m "feat: add classroom redaction"
```

## Task 4: Add JSONL Writer and In-Memory Event State

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/writer.rs`
- Create: `codewhale-edu/crates/tui/src/education/state.rs`
- Modify: `codewhale-edu/crates/tui/src/education/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/education/tests.rs`
- Test: `cargo test -p codewhale-tui education::tests::writes_events_as_jsonl -- --nocapture`

- [ ] **Step 1: Export modules**

Update `crates/tui/src/education/mod.rs`:

```rust
pub mod events;
pub mod redaction;
pub mod state;
pub mod writer;

#[cfg(test)]
mod tests;
```

- [ ] **Step 2: Create `writer.rs`**

```rust
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use super::events::EducationEvent;

pub struct EducationJsonlWriter {
    path: PathBuf,
    writer: BufWriter<File>,
}

impl EducationJsonlWriter {
    pub fn create(path: impl AsRef<Path>) -> std::io::Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        Ok(Self {
            path,
            writer: BufWriter::new(file),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn append(&mut self, event: &EducationEvent) -> std::io::Result<()> {
        serde_json::to_writer(&mut self.writer, event)?;
        self.writer.write_all(b"\n")?;
        self.writer.flush()
    }
}
```

- [ ] **Step 3: Create `state.rs`**

```rust
use std::collections::VecDeque;

use super::events::EducationEvent;

const DEFAULT_CAPACITY: usize = 200;

#[derive(Debug, Clone)]
pub struct EducationState {
    capacity: usize,
    events: VecDeque<EducationEvent>,
}

impl Default for EducationState {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

impl EducationState {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            events: VecDeque::new(),
        }
    }

    pub fn push(&mut self, event: EducationEvent) {
        while self.events.len() >= self.capacity {
            self.events.pop_front();
        }
        self.events.push_back(event);
    }

    pub fn recent(&self) -> impl Iterator<Item = &EducationEvent> {
        self.events.iter().rev()
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}
```

- [ ] **Step 4: Add writer/state tests**

Append to `crates/tui/src/education/tests.rs`:

```rust
use super::state::EducationState;
use super::writer::EducationJsonlWriter;

#[test]
fn writes_events_as_jsonl() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("session.jsonl");
    let mut writer = EducationJsonlWriter::create(&path).expect("writer");
    let event = EducationEvent::new(
        "evt_1",
        "sess_1",
        EducationEventType::SessionStarted,
        "2026-06-17T15:00:00+08:00",
        EducationActor::System,
        EducationVisibility::Student,
        EducationSeverity::Info,
        "Session started",
        serde_json::json!({}),
    );

    writer.append(&event).expect("append");
    let contents = std::fs::read_to_string(path).expect("read jsonl");
    assert!(contents.contains("\"type\":\"session-started\""));
    assert_eq!(contents.lines().count(), 1);
}

#[test]
fn event_state_keeps_recent_capacity() {
    let mut state = EducationState::new(2);
    for idx in 0..3 {
        state.push(EducationEvent::new(
            format!("evt_{idx}"),
            "sess_1",
            EducationEventType::ToolStarted,
            "2026-06-17T15:00:00+08:00",
            EducationActor::Agent,
            EducationVisibility::Student,
            EducationSeverity::Info,
            format!("event {idx}"),
            serde_json::json!({}),
        ));
    }

    let ids = state.recent().map(|event| event.id.as_str()).collect::<Vec<_>>();
    assert_eq!(ids, vec!["evt_2", "evt_1"]);
}
```

- [ ] **Step 5: Ensure tempfile dev dependency**

If `tempfile` is not available for tests, add under `[dev-dependencies]` in `crates/tui/Cargo.toml`:

```toml
tempfile = "3"
```

- [ ] **Step 6: Run tests**

```bash
cd codewhale-edu
cargo test -p codewhale-tui education::tests::writes_events_as_jsonl education::tests::event_state_keeps_recent_capacity -- --nocapture
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd codewhale-edu
git add crates/tui/Cargo.toml crates/tui/src/education
git commit -m "feat: persist education events"
```

## Task 5: Add Course Configuration Loader

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/course.rs`
- Create: `codewhale-edu/course/examples/python-debugging/course.yaml`
- Modify: `codewhale-edu/crates/tui/src/education/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/education/tests.rs`
- Modify: `codewhale-edu/crates/tui/Cargo.toml`
- Test: `cargo test -p codewhale-tui education::tests::loads_course_yaml -- --nocapture`

- [ ] **Step 1: Add YAML dependency**

Add if missing:

```toml
serde_yaml = "0.9"
```

- [ ] **Step 2: Export module**

Update `crates/tui/src/education/mod.rs`:

```rust
pub mod course;
pub mod events;
pub mod redaction;
pub mod state;
pub mod writer;

#[cfg(test)]
mod tests;
```

- [ ] **Step 3: Create `course.rs`**

```rust
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CourseConfig {
    pub id: String,
    pub title: String,
    pub audience: Option<String>,
    pub mode: Option<String>,
    pub recommended_model: Option<String>,
    #[serde(default)]
    pub objectives: Vec<String>,
    #[serde(default)]
    pub steps: Vec<CourseStep>,
    #[serde(default)]
    pub safety: CourseSafety,
    #[serde(default)]
    pub export: CourseExport,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CourseStep {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub expected_events: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CourseSafety {
    #[serde(default = "default_safety_mode")]
    pub mode: String,
    #[serde(default = "default_true")]
    pub redact_home_dir: bool,
    #[serde(default = "default_true")]
    pub redact_env: bool,
    #[serde(default = "default_true")]
    pub block_destructive_commands: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CourseExport {
    #[serde(default = "default_true")]
    pub markdown_report: bool,
    #[serde(default = "default_true")]
    pub jsonl_events: bool,
}

impl Default for CourseSafety {
    fn default() -> Self {
        Self {
            mode: default_safety_mode(),
            redact_home_dir: true,
            redact_env: true,
            block_destructive_commands: true,
        }
    }
}

impl Default for CourseExport {
    fn default() -> Self {
        Self {
            markdown_report: true,
            jsonl_events: true,
        }
    }
}

pub fn load_course(path: impl AsRef<Path>) -> Result<CourseConfig, CourseLoadError> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path).map_err(CourseLoadError::Io)?;
    serde_yaml::from_str(&contents).map_err(CourseLoadError::Yaml)
}

#[derive(Debug)]
pub enum CourseLoadError {
    Io(std::io::Error),
    Yaml(serde_yaml::Error),
}

fn default_true() -> bool {
    true
}

fn default_safety_mode() -> String {
    "classroom".to_string()
}
```

- [ ] **Step 4: Create example `course.yaml`**

```yaml
id: python-debugging-001
title: Python 调试入门
audience: beginner
mode: teacher-demo
recommended_model: gpt-5-codex
objectives:
  - 理解 Agent 如何阅读代码
  - 观察测试失败到修复的过程
  - 学习如何复盘 AI 编程轨迹
steps:
  - id: step-1
    title: 读取项目结构
    expected_events:
      - file.read
      - context.updated
  - id: step-2
    title: 运行测试并定位错误
    expected_events:
      - shell.started
      - shell.finished
  - id: step-3
    title: 修改代码并复测
    expected_events:
      - file.changed
      - shell.finished
safety:
  mode: classroom
  redact_home_dir: true
  redact_env: true
  block_destructive_commands: true
export:
  markdown_report: true
  jsonl_events: true
```

- [ ] **Step 5: Add test**

Append:

```rust
use super::course::load_course;

#[test]
fn loads_course_yaml() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("course.yaml");
    std::fs::write(
        &path,
        r#"
id: test-course
title: Test Course
steps:
  - id: step-1
    title: Run tests
    expected_events:
      - shell.finished
"#,
    )
    .expect("write course");

    let course = load_course(&path).expect("load course");
    assert_eq!(course.id, "test-course");
    assert_eq!(course.title, "Test Course");
    assert_eq!(course.steps[0].expected_events, vec!["shell.finished"]);
    assert!(course.safety.block_destructive_commands);
}
```

- [ ] **Step 6: Run test**

```bash
cd codewhale-edu
cargo test -p codewhale-tui education::tests::loads_course_yaml -- --nocapture
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd codewhale-edu
git add crates/tui/Cargo.toml crates/tui/src/education course/examples/python-debugging/course.yaml
git commit -m "feat: load teaching course config"
```

## Task 6: Add Classroom Command Policy

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/command_policy.rs`
- Modify: `codewhale-edu/crates/tui/src/education/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/education/tests.rs`
- Test: `cargo test -p codewhale-tui education::tests::classifies_commands_for_classroom -- --nocapture`

- [ ] **Step 1: Export module**

Update `mod.rs`:

```rust
pub mod command_policy;
pub mod course;
pub mod events;
pub mod redaction;
pub mod state;
pub mod writer;

#[cfg(test)]
mod tests;
```

- [ ] **Step 2: Create `command_policy.rs`**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandDecision {
    Allow,
    Approve,
    Block,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandPolicyResult {
    pub decision: CommandDecision,
    pub reason: String,
}

pub fn classify_command(command: &str) -> CommandPolicyResult {
    let normalized = command.trim().to_ascii_lowercase();

    if normalized.is_empty() {
        return approve("empty command needs review");
    }

    if contains_any(
        &normalized,
        &[
            "rm -rf /",
            "mkfs",
            "diskutil erase",
            "chmod -r 777 /",
            "chown -r",
            "sudo rm",
            "shutdown",
            "reboot",
        ],
    ) {
        return block("destructive system command");
    }

    if contains_any(
        &normalized,
        &[
            "curl ",
            "wget ",
            "npm install",
            "pnpm add",
            "yarn add",
            "pip install",
            "cargo install",
            "rm ",
            "mv ",
            "git push",
        ],
    ) {
        return approve("command changes files, network, or remote state");
    }

    if contains_any(
        &normalized,
        &[
            "npm test",
            "pnpm test",
            "yarn test",
            "cargo test",
            "pytest",
            "ls",
            "pwd",
            "rg ",
            "sed -n",
            "cat ",
        ],
    ) {
        return allow("low-risk classroom command");
    }

    approve("unrecognized command needs review");
}

fn contains_any(command: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| command.contains(needle))
}

fn allow(reason: &str) -> CommandPolicyResult {
    CommandPolicyResult {
        decision: CommandDecision::Allow,
        reason: reason.to_string(),
    }
}

fn approve(reason: &str) -> CommandPolicyResult {
    CommandPolicyResult {
        decision: CommandDecision::Approve,
        reason: reason.to_string(),
    }
}

fn block(reason: &str) -> CommandPolicyResult {
    CommandPolicyResult {
        decision: CommandDecision::Block,
        reason: reason.to_string(),
    }
}
```

- [ ] **Step 3: Add test**

Append:

```rust
use super::command_policy::{classify_command, CommandDecision};

#[test]
fn classifies_commands_for_classroom() {
    assert_eq!(classify_command("npm test").decision, CommandDecision::Allow);
    assert_eq!(classify_command("cargo test -p codewhale-tui").decision, CommandDecision::Allow);
    assert_eq!(classify_command("npm install").decision, CommandDecision::Approve);
    assert_eq!(classify_command("rm target/tmp.txt").decision, CommandDecision::Approve);
    assert_eq!(classify_command("rm -rf /").decision, CommandDecision::Block);
    assert_eq!(classify_command("sudo rm -rf /Users/me").decision, CommandDecision::Block);
}
```

- [ ] **Step 4: Run test**

```bash
cd codewhale-edu
cargo test -p codewhale-tui education::tests::classifies_commands_for_classroom -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd codewhale-edu
git add crates/tui/src/education
git commit -m "feat: classify classroom commands"
```

## Task 7: Add Report Generator

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/report.rs`
- Modify: `codewhale-edu/crates/tui/src/education/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/education/tests.rs`
- Test: `cargo test -p codewhale-tui education::tests::renders_markdown_report -- --nocapture`

- [ ] **Step 1: Export module**

Update `mod.rs`:

```rust
pub mod command_policy;
pub mod course;
pub mod events;
pub mod redaction;
pub mod report;
pub mod state;
pub mod writer;

#[cfg(test)]
mod tests;
```

- [ ] **Step 2: Create `report.rs`**

```rust
use super::course::CourseConfig;
use super::events::{EducationEvent, EducationEventType};
use super::redaction::redact_text;

pub fn render_markdown_report(course: Option<&CourseConfig>, events: &[EducationEvent]) -> String {
    let title = course
        .map(|course| course.title.as_str())
        .unwrap_or("AI 编程课堂");

    let mut markdown = String::new();
    markdown.push_str(&format!("# {title} - 课堂复盘\n\n"));
    markdown.push_str("## 会话摘要\n\n");
    markdown.push_str(&format!("- 事件数量：{}\n", events.len()));
    if let Some(course) = course {
        markdown.push_str(&format!("- 课程 ID：{}\n", course.id));
        if let Some(model) = &course.recommended_model {
            markdown.push_str(&format!("- 推荐模型：{}\n", model));
        }
    }
    markdown.push('\n');

    markdown.push_str("## 关键时间线\n\n");
    for event in events.iter().take(80) {
        markdown.push_str(&format!(
            "- `{}` `{}` {}\n",
            event.timestamp,
            event_type_label(&event.event_type),
            redact_text(&event.summary)
        ));
    }
    markdown.push('\n');

    markdown.push_str("## 文件变化\n\n");
    append_filtered(&mut markdown, events, EducationEventType::FileChanged);

    markdown.push_str("## 命令执行\n\n");
    append_filtered(&mut markdown, events, EducationEventType::ShellFinished);

    markdown.push_str("## 安全审批\n\n");
    append_filtered(&mut markdown, events, EducationEventType::ApprovalRequested);
    append_filtered(&mut markdown, events, EducationEventType::SafetyBlocked);

    markdown.push_str("## 复盘建议\n\n");
    markdown.push_str("- 重点讲解失败事件如何驱动下一步修改。\n");
    markdown.push_str("- 重点讲解文件 diff、命令结果和最终任务结果之间的关系。\n");
    markdown
}

fn append_filtered(markdown: &mut String, events: &[EducationEvent], target: EducationEventType) {
    let mut count = 0;
    for event in events.iter().filter(|event| event.event_type == target) {
        markdown.push_str(&format!("- {}\n", redact_text(&event.summary)));
        count += 1;
    }
    if count == 0 {
        markdown.push_str("- 无记录\n");
    }
    markdown.push('\n');
}

fn event_type_label(event_type: &EducationEventType) -> &'static str {
    match event_type {
        EducationEventType::SessionStarted => "session.started",
        EducationEventType::SessionEnded => "session.ended",
        EducationEventType::CourseLoaded => "course.loaded",
        EducationEventType::ModelSelected => "model.selected",
        EducationEventType::SkillLoaded => "skill.loaded",
        EducationEventType::ContextUpdated => "context.updated",
        EducationEventType::ToolStarted => "tool.started",
        EducationEventType::ToolFinished => "tool.finished",
        EducationEventType::ShellStarted => "shell.started",
        EducationEventType::ShellFinished => "shell.finished",
        EducationEventType::FileRead => "file.read",
        EducationEventType::FileChanged => "file.changed",
        EducationEventType::ApprovalRequested => "approval.requested",
        EducationEventType::ApprovalResolved => "approval.resolved",
        EducationEventType::SafetyRedacted => "safety.redacted",
        EducationEventType::SafetyBlocked => "safety.blocked",
        EducationEventType::ExportCreated => "export.created",
    }
}
```

- [ ] **Step 3: Add test**

Append:

```rust
use super::report::render_markdown_report;

#[test]
fn renders_markdown_report() {
    let events = vec![EducationEvent::new(
        "evt_1",
        "sess_1",
        EducationEventType::ShellFinished,
        "2026-06-17T15:35:12+08:00",
        EducationActor::Agent,
        EducationVisibility::Student,
        EducationSeverity::Info,
        "npm test exited with code 0",
        serde_json::json!({ "exit_code": 0 }),
    )];

    let markdown = render_markdown_report(None, &events);
    assert!(markdown.contains("# AI 编程课堂 - 课堂复盘"));
    assert!(markdown.contains("## 命令执行"));
    assert!(markdown.contains("npm test exited with code 0"));
}
```

- [ ] **Step 4: Run test**

```bash
cd codewhale-edu
cargo test -p codewhale-tui education::tests::renders_markdown_report -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd codewhale-edu
git add crates/tui/src/education
git commit -m "feat: render teaching session reports"
```

## Task 8: Hook Shell, File, Skill, Approval, and Context Events

**Files:**
- Modify: `codewhale-edu/docs/education/architecture-map.md`
- Modify: `codewhale-edu/crates/tui/src/tools/shell.rs`
- Modify: `codewhale-edu/crates/tui/src/tools/file.rs`
- Modify: `codewhale-edu/crates/tui/src/tools/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/skills.rs`
- Modify: `codewhale-edu/crates/tui/src/core/events.rs`
- Modify: `codewhale-edu/crates/tui/src/core/engine/turn_loop.rs`
- Modify: `codewhale-edu/crates/tui/src/tui/approval.rs`
- Test: existing tool tests plus a manual JSONL smoke run

- [ ] **Step 1: Locate exact hook points**

Run:

```bash
cd codewhale-edu
rg -n "exec|shell|Command|approval|Approval|read_file|write_file|edit_file|apply_patch|skill|context|token" crates/tui/src crates/tools crates/core
```

Update `docs/education/architecture-map.md` with exact file and function names for:

- Shell command start
- Shell command finish
- File read
- File write/edit/apply patch
- Tool call start
- Tool call finish
- Skill load
- Context update or token accounting
- Approval request
- Approval resolution

- [ ] **Step 2: Add a minimal event emitter handle**

Create a small emitter wrapper in `crates/tui/src/education/events.rs` after `EducationEvent`:

```rust
pub trait EducationEventSink: Send {
    fn emit_education_event(&mut self, event: EducationEvent);
}

impl<F> EducationEventSink for F
where
    F: FnMut(EducationEvent) + Send,
{
    fn emit_education_event(&mut self, event: EducationEvent) {
        self(event);
    }
}
```

- [ ] **Step 3: Emit shell events**

In the shell execution function found in Step 1, emit:

- `EducationEventType::ShellStarted` before execution
- `EducationEventType::ShellFinished` after execution with command, exit code, duration, stdout summary, stderr summary
- `EducationEventType::SafetyBlocked` when `classify_command(command)` returns `Block`
- `EducationEventType::ApprovalRequested` when `classify_command(command)` returns `Approve`

Use summaries like:

```rust
format!("{} exited with code {}", command, exit_code)
```

Apply `redact_text` to command output summaries.

- [ ] **Step 4: Emit file events**

In file read/write/edit/apply-patch paths found in Step 1:

- Emit `FileRead` for reads.
- Emit `FileChanged` for writes/edits/patches.
- If `is_sensitive_path(path)` is true, set visibility to `EducationVisibility::Teacher` and summarize without content.

Use summary examples:

```rust
format!("Read {}", display_path)
format!("Updated {}", display_path)
```

- [ ] **Step 5: Emit tool events**

In the tool orchestration path found in Step 1:

- Emit `ToolStarted` before model-visible tool dispatch.
- Emit `ToolFinished` after result/error.
- Include tool name, duration, status, and short sanitized result summary.

- [ ] **Step 6: Emit skill events**

In `crates/tui/src/skills.rs` or the actual skill loader path:

- Emit `SkillLoaded` for each skill added to the active session.
- Include skill name and source path if safe after redaction.

- [ ] **Step 7: Emit context events**

In the context/token accounting path found in Step 1:

- Emit `ContextUpdated` after compaction, file reference updates, or token accounting changes.
- Include token usage if already available; otherwise include referenced file count and context summary.

- [ ] **Step 8: Emit approval events**

In approval UI/runtime paths:

- Emit `ApprovalRequested` when approval dialog or approval policy starts.
- Emit `ApprovalResolved` when the user allows, denies, or modifies execution.

- [ ] **Step 9: Run tests**

Run:

```bash
cd codewhale-edu
cargo test -p codewhale-tui education -- --nocapture
cargo test -p codewhale-tui --no-run
```

Expected: PASS.

- [ ] **Step 10: Manual smoke run**

Run a short local session against a small test workspace and execute:

```text
! pwd
! cargo test --version
```

Expected:

- `exports/sessions/<session-id>/session.jsonl` exists.
- It includes `shell-started` and `shell-finished`.
- Sensitive home path is redacted.

- [ ] **Step 11: Commit**

```bash
cd codewhale-edu
git add docs/education/architecture-map.md crates/tui/src
git commit -m "feat: emit teaching events from runtime"
```

## Task 9: Add Teaching Sidebar Rendering

**Files:**
- Create: `codewhale-edu/crates/tui/src/education/sidebar.rs`
- Modify: `codewhale-edu/crates/tui/src/education/mod.rs`
- Modify: `codewhale-edu/crates/tui/src/tui/app.rs`
- Modify: `codewhale-edu/crates/tui/src/tui/ui.rs`
- Test: existing TUI compile tests plus manual terminal smoke check

- [ ] **Step 1: Export sidebar module**

Update `mod.rs`:

```rust
pub mod command_policy;
pub mod course;
pub mod events;
pub mod redaction;
pub mod report;
pub mod sidebar;
pub mod state;
pub mod writer;

#[cfg(test)]
mod tests;
```

- [ ] **Step 2: Create `sidebar.rs`**

Use the ratatui version already used by CodeWhale. The implementation must render from `EducationState` only.

```rust
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use super::events::EducationSeverity;
use super::state::EducationState;

pub fn render_teaching_sidebar(frame: &mut Frame<'_>, area: Rect, state: &EducationState) {
    let items = state
        .recent()
        .take(40)
        .map(|event| {
            let style = match event.severity {
                EducationSeverity::Debug => Style::default().fg(Color::DarkGray),
                EducationSeverity::Info => Style::default().fg(Color::White),
                EducationSeverity::Warning => Style::default().fg(Color::Yellow),
                EducationSeverity::Error => Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{:?}", event.event_type), style),
                Span::raw(" "),
                Span::raw(event.summary.clone()),
            ]))
        })
        .collect::<Vec<_>>();

    if items.is_empty() {
        let empty = Paragraph::new("No teaching events yet")
            .block(Block::default().title("Teaching").borders(Borders::ALL))
            .wrap(Wrap { trim: true });
        frame.render_widget(empty, area);
        return;
    }

    let list = List::new(items).block(Block::default().title("Teaching").borders(Borders::ALL));
    frame.render_widget(list, area);
}
```

- [ ] **Step 3: Add education state to TUI app state**

In `crates/tui/src/tui/app.rs`, add an `EducationState` field to the main app state struct:

```rust
pub education_state: crate::education::state::EducationState,
```

Initialize it with:

```rust
education_state: crate::education::state::EducationState::default(),
```

Use exact struct and constructor names from the current file.

- [ ] **Step 4: Add right-side layout split**

In `crates/tui/src/tui/ui.rs`, locate the main render layout. Split the main body into a primary area and a right sidebar when teaching mode is enabled.

Default ratio:

- Primary: 70%
- Teaching sidebar: 30%

If the terminal width is below 120 columns, hide the sidebar and keep the existing layout.

- [ ] **Step 5: Render sidebar**

In the TUI render function, call:

```rust
crate::education::sidebar::render_teaching_sidebar(frame, sidebar_area, &app.education_state);
```

Use the actual `frame`, `sidebar_area`, and `app` variable names from `ui.rs`.

- [ ] **Step 6: Run compile check**

```bash
cd codewhale-edu
cargo test -p codewhale-tui --no-run
```

Expected: compile succeeds.

- [ ] **Step 7: Manual smoke check**

Run:

```bash
cd codewhale-edu
cargo run -p codewhale-tui -- --help
```

Then launch the TUI in a 140+ column terminal.

Expected:

- The normal TUI remains usable.
- Right sidebar appears at wide widths.
- Sidebar hides gracefully at narrow widths.

- [ ] **Step 8: Commit**

```bash
cd codewhale-edu
git add crates/tui/src
git commit -m "feat: render teaching sidebar"
```

## Task 10: Add Export Command and Session Finalization

**Files:**
- Modify: `codewhale-edu/crates/tui/src/tui/app.rs`
- Modify: `codewhale-edu/crates/tui/src/core/engine/turn_loop.rs`
- Modify: `codewhale-edu/crates/tui/src/education/report.rs`
- Modify: `codewhale-edu/crates/tui/src/education/writer.rs`
- Create: `codewhale-edu/exports/.gitkeep`
- Test: manual `/export` and session end export

- [ ] **Step 1: Add export directory marker**

Run:

```bash
cd codewhale-edu
mkdir -p exports
touch exports/.gitkeep
```

- [ ] **Step 2: Add export helper**

In `crates/tui/src/education/report.rs`, add:

```rust
use std::fs::{create_dir_all, write};
use std::path::{Path, PathBuf};

pub fn write_markdown_report(
    output_dir: impl AsRef<Path>,
    course: Option<&CourseConfig>,
    events: &[EducationEvent],
) -> std::io::Result<PathBuf> {
    let output_dir = output_dir.as_ref();
    create_dir_all(output_dir)?;
    let path = output_dir.join("session-report.md");
    let markdown = render_markdown_report(course, events);
    write(&path, markdown)?;
    Ok(path)
}
```

- [ ] **Step 3: Add app-level export action**

In `crates/tui/src/tui/app.rs`, locate the command handling for slash commands. Add `/export` handling that:

- Resolves the current session export directory: `exports/sessions/<session-id>/`
- Flushes `session.jsonl`
- Calls `write_markdown_report`
- Emits `ExportCreated`
- Shows a short status message with the report path

- [ ] **Step 4: Add session end export**

In the session finalization path found in Task 8:

- Emit `SessionEnded`.
- Write the final JSONL event.
- Generate Markdown if course export config enables it.

- [ ] **Step 5: Manual export smoke test**

Run a TUI session and type:

```text
/export
```

Expected:

- `exports/sessions/<session-id>/session.jsonl` exists.
- `exports/sessions/<session-id>/session-report.md` exists.
- TUI shows export success.

- [ ] **Step 6: Commit**

```bash
cd codewhale-edu
git add crates/tui/src exports/.gitkeep
git commit -m "feat: export teaching session reports"
```

## Task 11: Add Branding and Compliance Files

**Files:**
- Modify: `codewhale-edu/README.md`
- Modify: `codewhale-edu/package.json`
- Modify: `codewhale-edu/npm/package.json` if present
- Modify: `codewhale-edu/crates/tui/src/main.rs`
- Modify: product/banner/theme files identified by `rg -n "CodeWhale|codewhale|codew"`
- Create: `codewhale-edu/THIRD_PARTY_NOTICES.md`
- Test: `cargo run -p codewhale-tui -- --version`, `cargo run -p codewhale-tui -- --help`

- [ ] **Step 1: Find brand strings**

Run:

```bash
cd codewhale-edu
rg -n "CodeWhale|codewhale|codew|deepseek-tui|DeepSeek" README.md package.json npm crates docs
```

- [ ] **Step 2: Choose internal MVP brand constants**

Use this working brand for MVP unless product naming changes:

- Product name: `FuFan Teaching Agent`
- CLI binary display name: `ff-agent`
- TUI display name: `FuFan Teaching Agent TUI`
- Config directory for the MVP: keep upstream default until migration is planned

- [ ] **Step 3: Replace user-facing product shell strings**

Replace startup banner, help title, README intro, and package display strings with the MVP brand. Do not remove MIT license attribution or upstream compatibility notes.

- [ ] **Step 4: Create `THIRD_PARTY_NOTICES.md`**

```markdown
# Third Party Notices

This product is based on CodeWhale, originally published under the MIT License.

## CodeWhale

- Upstream: https://github.com/Hmbown/CodeWhale
- License: MIT

The original MIT License text is retained in `LICENSE`.

## Dependency Notices

Run the dependency license audit task before commercial distribution and append generated dependency notices here.
```

- [ ] **Step 5: Verify help/version**

Run:

```bash
cd codewhale-edu
cargo run -p codewhale-tui -- --version
cargo run -p codewhale-tui -- --help
```

Expected:

- User-facing product strings use `FuFan Teaching Agent`.
- License notices still mention CodeWhale where attribution is required.

- [ ] **Step 6: Commit**

```bash
cd codewhale-edu
git add README.md package.json npm crates THIRD_PARTY_NOTICES.md
git commit -m "chore: apply teaching agent branding"
```

## Task 12: Add Teacher Guide and Example Lesson Smoke Test

**Files:**
- Create: `codewhale-edu/docs/education/teaching-mode.md`
- Modify: `codewhale-edu/course/examples/python-debugging/course.yaml`
- Test: full local demo

- [ ] **Step 1: Create teacher guide**

Create `docs/education/teaching-mode.md`:

```markdown
# Teaching Mode Guide

## Purpose

Teaching mode shows the Agent's background activity during an AI programming lesson.

## First Demo

1. Open the example course workspace.
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

## Exported Files

- `session.jsonl` contains raw structured events.
- `session-report.md` contains the readable classroom recap.

## Safety

Teaching mode redacts secrets and sensitive paths before display and export. It is not a container sandbox. Use trusted local workspaces for一期 demos.
```

- [ ] **Step 2: Prepare demo script**

Append to the teacher guide:

```markdown
## 45-Minute Demo Script

1. 5 min: Explain the task and show `course.yaml`.
2. 10 min: Ask the Agent to inspect the project and highlight file/context events.
3. 10 min: Run tests and highlight shell events.
4. 10 min: Ask the Agent to fix the bug and highlight file diff events.
5. 5 min: Run `/export` and review Markdown.
5. 5 min: Discuss safety approvals and what was hidden from students.
```

- [ ] **Step 3: Run full smoke test**

Run a local demo:

```bash
cd codewhale-edu
cargo run -p codewhale-tui
```

During the session:

```text
请读取这个项目结构，并解释下一步要做什么
! pwd
! cargo test --version
/export
```

Expected:

- Teaching sidebar displays events.
- Export files are generated.
- Markdown report is readable.
- Home path and secrets are redacted.

- [ ] **Step 4: Commit**

```bash
cd codewhale-edu
git add docs/education course/examples/python-debugging/course.yaml
git commit -m "docs: add teaching mode guide"
```

## Task 13: Final Verification and MVP Acceptance

**Files:**
- Modify only files needed to fix verification failures
- Test: full test suite and manual acceptance

- [ ] **Step 1: Run focused education tests**

```bash
cd codewhale-edu
cargo test -p codewhale-tui education -- --nocapture
```

Expected: PASS.

- [ ] **Step 2: Run TUI compile check**

```bash
cd codewhale-edu
cargo test -p codewhale-tui --no-run
```

Expected: PASS.

- [ ] **Step 3: Run formatting**

```bash
cd codewhale-edu
cargo fmt --check
```

Expected: PASS. If it fails, run `cargo fmt`, inspect diff, then re-run `cargo fmt --check`.

- [ ] **Step 4: Run lint if upstream supports clippy**

```bash
cd codewhale-edu
cargo clippy -p codewhale-tui --all-targets -- -D warnings
```

Expected: PASS or documented upstream lint failures unrelated to education changes.

- [ ] **Step 5: Verify MVP acceptance checklist**

Create `docs/education/mvp-acceptance.md`:

```markdown
# MVP Acceptance

- [ ] Local TUI starts.
- [ ] Product shell uses FuFan Teaching Agent branding.
- [ ] Example `course.yaml` loads.
- [ ] Agent can complete a real code-inspection or code-editing task.
- [ ] Teaching sidebar shows tool, shell, file, skill, context, course, and safety events.
- [ ] Sensitive values are redacted in sidebar.
- [ ] Sensitive values are redacted in exported reports.
- [ ] `/export` creates `session.jsonl`.
- [ ] `/export` creates `session-report.md`.
- [ ] MIT license and third-party notice are present.
```

Check each item during the demo.

- [ ] **Step 6: Commit final verification docs**

```bash
cd codewhale-edu
git add docs/education/mvp-acceptance.md
git commit -m "docs: record teaching MVP acceptance"
```

## Dependency and Compliance Follow-Up

Before commercial or external classroom distribution:

- Run a Rust dependency license audit.
- Review npm wrapper dependencies if distributing via npm.
- Confirm model provider terms for the providers enabled in class.
- Confirm logo, font, and icon usage rights.
- Decide whether the MVP keeps upstream config directories or migrates to company-owned config paths.

## Execution Order

Execute tasks in order:

1. Import CodeWhale Fork and Verify Baseline
2. Add Education Module Skeleton and Event Types
3. Add Redaction Layer
4. Add JSONL Writer and In-Memory Event State
5. Add Course Configuration Loader
6. Add Classroom Command Policy
7. Add Report Generator
8. Hook Shell, File, Skill, Approval, and Context Events
9. Add Teaching Sidebar Rendering
10. Add Export Command and Session Finalization
11. Add Branding and Compliance Files
12. Add Teacher Guide and Example Lesson Smoke Test
13. Final Verification and MVP Acceptance

Every task should end with a commit. Do not start Task 8 until Tasks 2-7 pass, because Task 8 depends on the event, safety, writer, and report primitives.
