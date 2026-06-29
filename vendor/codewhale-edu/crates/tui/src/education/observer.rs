use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::events::{
    EducationActor, EducationEvent, EducationEventSink, EducationEventType, EducationSeverity,
    EducationVisibility,
};
use super::redaction::{is_sensitive_path, redact_text};
use super::state::EducationState;
use super::writer::EducationJsonlWriter;
use crate::core::events::Event as EngineEvent;
use crate::tools::spec::{ToolError, ToolResult};
use uuid::Uuid;

const UNSAVED_SESSION_PREFIX: &str = "education";

pub struct EducationObserver {
    state: EducationState,
    export_root: Option<PathBuf>,
    writer: Option<EducationJsonlWriter>,
    session_id: Option<String>,
    fallback_session_id: Option<String>,
    pending_tools: HashMap<String, (String, Value)>,
    next_id: u64,
}

impl Default for EducationObserver {
    fn default() -> Self {
        Self::new(None)
    }
}

impl EducationObserver {
    pub fn new(export_root: Option<PathBuf>) -> Self {
        Self {
            state: EducationState::default(),
            export_root,
            writer: None,
            session_id: None,
            fallback_session_id: None,
            pending_tools: HashMap::new(),
            next_id: 0,
        }
    }

    pub fn with_export_root(export_root: impl Into<PathBuf>) -> Self {
        Self::new(Some(export_root.into()))
    }

    pub fn state(&self) -> &EducationState {
        &self.state
    }

    pub fn session_id_for_export(&mut self, current_session_id: Option<&str>) -> String {
        let session_id = self.session_id_for_event(current_session_id);
        self.ensure_writer(&session_id);
        session_id
    }

    pub fn flush(&mut self) -> std::io::Result<()> {
        if let Some(writer) = self.writer.as_mut() {
            writer.flush()?;
        }
        Ok(())
    }

    pub fn jsonl_path(&self) -> Option<&Path> {
        self.writer.as_ref().map(|writer| writer.path())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn emit_manual_event(
        &mut self,
        current_session_id: Option<&str>,
        event_type: EducationEventType,
        actor: EducationActor,
        visibility: EducationVisibility,
        severity: EducationSeverity,
        summary: impl Into<String>,
        data: Value,
    ) {
        let session_id = self.session_id_for_export(current_session_id);
        let event = education_event(
            &mut self.next_id,
            &session_id,
            event_type,
            current_timestamp(),
            actor,
            visibility,
            severity,
            summary,
            data,
        );
        self.emit_education_event(event);
    }

    pub fn observe_engine_event(&mut self, event: &EngineEvent, current_session_id: Option<&str>) {
        let session_id = self.session_id_for_event(current_session_id);
        self.ensure_writer(&session_id);
        if let EngineEvent::ToolCallStarted { id, name, input } = event {
            self.pending_tools
                .insert(id.clone(), (name.clone(), input.clone()));
        }
        let pending_input = match event {
            EngineEvent::ToolCallComplete { id, .. } => self.pending_tools.remove(id),
            _ => None,
        };
        for event in education_events_from_engine_event(
            event,
            &session_id,
            &mut self.next_id,
            current_timestamp(),
            pending_input.as_ref(),
        ) {
            self.emit_education_event(event);
        }
    }

    fn ensure_writer(&mut self, session_id: &str) {
        if self.session_id.as_deref() == Some(session_id) {
            return;
        }
        self.session_id = Some(session_id.to_string());
        self.writer = self.export_root.as_ref().and_then(|root| {
            EducationJsonlWriter::create(session_jsonl_path(root, session_id)).ok()
        });
    }

    fn session_id_for_event(&mut self, current_session_id: Option<&str>) -> String {
        if let Some(session_id) = current_session_id {
            return session_id.to_string();
        }
        if let Some(session_id) = self.session_id.as_deref() {
            return session_id.to_string();
        }
        self.fallback_session_id
            .get_or_insert_with(|| format!("{UNSAVED_SESSION_PREFIX}-{}", Uuid::new_v4()))
            .clone()
    }
}

impl EducationEventSink for EducationObserver {
    fn emit_education_event(&mut self, event: EducationEvent) {
        self.state.push(event.clone());
        if let Some(writer) = self.writer.as_mut()
            && let Err(err) = writer.append(&event)
        {
            tracing::warn!(target: "education.observer", ?err, "failed to append education event");
        }
    }
}

pub(crate) fn education_events_from_engine_event(
    event: &EngineEvent,
    session_id: &str,
    next_id: &mut u64,
    timestamp: String,
    pending_input: Option<&(String, Value)>,
) -> Vec<EducationEvent> {
    match event {
        EngineEvent::ToolCallStarted { id, name, input } => {
            let file_paths = file_tool_paths(name, input);
            let sensitive_file_tool = file_paths.iter().any(|path| is_sensitive_path(path));
            let tool_visibility = tool_visibility(sensitive_file_tool);
            let tool_input = if sensitive_file_tool {
                json!({
                    "paths": redacted_paths(&file_paths),
                    "sensitive": true,
                })
            } else {
                redacted_value(input)
            };
            let mut events = vec![education_event(
                next_id,
                session_id,
                EducationEventType::ToolStarted,
                timestamp.clone(),
                EducationActor::Agent,
                tool_visibility,
                EducationSeverity::Info,
                format!("Started tool {}", name),
                json!({
                    "tool_id": id,
                    "tool_name": name,
                    "input": tool_input,
                }),
            )];

            if shell_command(name, input).is_some() {
                events.push(education_event(
                    next_id,
                    session_id,
                    EducationEventType::ShellStarted,
                    timestamp,
                    EducationActor::Agent,
                    EducationVisibility::Student,
                    EducationSeverity::Info,
                    format!(
                        "Started shell command {}",
                        shell_command(name, input).unwrap_or_default()
                    ),
                    json!({
                        "tool_id": id,
                        "command": shell_command(name, input),
                    }),
                ));
            }
            events
        }
        EngineEvent::ToolCallComplete { id, name, result } => {
            let original_input = pending_input
                .filter(|(pending_name, _)| pending_name == name)
                .map(|(_, input)| input);
            let file_paths = original_input
                .map(|input| file_tool_paths(name, input))
                .unwrap_or_default();
            let sensitive_file_tool = file_paths.iter().any(|path| is_sensitive_path(path));
            let mut events = vec![tool_finished_event(
                next_id,
                session_id,
                timestamp.clone(),
                id,
                name,
                result,
                sensitive_file_tool.then_some(file_paths.as_slice()),
            )];
            if is_shell_tool(name) {
                events.push(shell_finished_event(
                    next_id,
                    session_id,
                    timestamp.clone(),
                    id,
                    name,
                    result,
                ));
            }
            if is_file_read_tool(name) {
                events.extend(file_events(
                    next_id,
                    session_id,
                    timestamp.clone(),
                    EducationEventType::FileRead,
                    id,
                    name,
                    original_input,
                    result,
                ));
            } else if is_file_write_tool(name) {
                events.extend(file_events(
                    next_id,
                    session_id,
                    timestamp,
                    EducationEventType::FileChanged,
                    id,
                    name,
                    original_input,
                    result,
                ));
            }
            events
        }
        EngineEvent::ApprovalRequired {
            id,
            tool_name,
            description,
            input,
            ..
        } => vec![education_event(
            next_id,
            session_id,
            EducationEventType::ApprovalRequested,
            timestamp,
            EducationActor::System,
            EducationVisibility::Teacher,
            EducationSeverity::Warning,
            format!("Approval requested for {}", tool_name),
            json!({
                "approval_id": id,
                "tool_name": tool_name,
                "description": redact_text(description),
                "input": redacted_value(input),
            }),
        )],
        EngineEvent::CompactionCompleted {
            id,
            auto,
            message,
            messages_before,
            messages_after,
        } => vec![education_event(
            next_id,
            session_id,
            EducationEventType::ContextUpdated,
            timestamp,
            EducationActor::System,
            EducationVisibility::Student,
            EducationSeverity::Info,
            redact_text(message),
            json!({
                "context_event": "compaction.completed",
                "compaction_id": id,
                "auto": auto,
                "messages_before": messages_before,
                "messages_after": messages_after,
            }),
        )],
        EngineEvent::TurnComplete { usage, status, .. } => vec![education_event(
            next_id,
            session_id,
            EducationEventType::ContextUpdated,
            timestamp,
            EducationActor::System,
            EducationVisibility::Student,
            EducationSeverity::Info,
            "Turn completed and token usage updated",
            json!({
                "context_event": "turn.complete",
                "status": format!("{status:?}"),
                "usage": usage,
            }),
        )],
        _ => Vec::new(),
    }
}

fn tool_finished_event(
    next_id: &mut u64,
    session_id: &str,
    timestamp: String,
    id: &str,
    name: &str,
    result: &Result<ToolResult, ToolError>,
    sensitive_file_paths: Option<&[String]>,
) -> EducationEvent {
    let success = result.as_ref().is_ok_and(|result| result.success);
    let severity = if success {
        EducationSeverity::Info
    } else {
        EducationSeverity::Warning
    };
    let sensitive_file_tool = sensitive_file_paths.is_some();
    let summary = if sensitive_file_tool {
        "Sensitive file tool result hidden".to_string()
    } else {
        tool_result_summary(result)
    };
    education_event(
        next_id,
        session_id,
        EducationEventType::ToolFinished,
        timestamp,
        EducationActor::Agent,
        tool_visibility(sensitive_file_tool),
        severity,
        format!("Finished tool {}", name),
        json!({
            "tool_id": id,
            "tool_name": name,
            "success": success,
            "summary": summary,
            "paths": sensitive_file_paths.map(redacted_paths),
            "sensitive": sensitive_file_tool,
        }),
    )
}

fn shell_finished_event(
    next_id: &mut u64,
    session_id: &str,
    timestamp: String,
    id: &str,
    name: &str,
    result: &Result<ToolResult, ToolError>,
) -> EducationEvent {
    let success = result.as_ref().is_ok_and(|result| result.success);
    education_event(
        next_id,
        session_id,
        EducationEventType::ShellFinished,
        timestamp,
        EducationActor::Agent,
        EducationVisibility::Student,
        if success {
            EducationSeverity::Info
        } else {
            EducationSeverity::Warning
        },
        format!("Shell tool {} finished", name),
        json!({
            "tool_id": id,
            "tool_name": name,
            "success": success,
            "summary": tool_result_summary(result),
        }),
    )
}

#[allow(clippy::too_many_arguments)]
fn file_events(
    next_id: &mut u64,
    session_id: &str,
    timestamp: String,
    event_type: EducationEventType,
    id: &str,
    name: &str,
    input: Option<&Value>,
    result: &Result<ToolResult, ToolError>,
) -> Vec<EducationEvent> {
    let paths = input.map(file_paths).unwrap_or_default();
    if paths.is_empty() {
        return vec![file_event(
            next_id, session_id, timestamp, event_type, id, name, None, result,
        )];
    }

    paths
        .iter()
        .map(|path| {
            file_event(
                next_id,
                session_id,
                timestamp.clone(),
                event_type.clone(),
                id,
                name,
                Some(path.as_str()),
                result,
            )
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn file_event(
    next_id: &mut u64,
    session_id: &str,
    timestamp: String,
    event_type: EducationEventType,
    id: &str,
    name: &str,
    path: Option<&str>,
    result: &Result<ToolResult, ToolError>,
) -> EducationEvent {
    let visibility = if path.is_some_and(is_sensitive_path) {
        EducationVisibility::Teacher
    } else {
        EducationVisibility::Student
    };
    let action = match event_type {
        EducationEventType::FileRead => "Read",
        EducationEventType::FileChanged => "Updated",
        _ => "Touched",
    };
    let display_path = path
        .map(redact_text)
        .unwrap_or_else(|| "unknown path".to_string());
    education_event(
        next_id,
        session_id,
        event_type,
        timestamp,
        EducationActor::Agent,
        visibility,
        EducationSeverity::Info,
        format!("{action} {display_path}"),
        json!({
            "tool_id": id,
            "tool_name": name,
            "path": path.map(redact_text),
            "success": result.as_ref().is_ok_and(|result| result.success),
        }),
    )
}

#[allow(clippy::too_many_arguments)]
fn education_event(
    next_id: &mut u64,
    session_id: &str,
    event_type: EducationEventType,
    timestamp: String,
    actor: EducationActor,
    visibility: EducationVisibility,
    severity: EducationSeverity,
    summary: impl Into<String>,
    data: Value,
) -> EducationEvent {
    *next_id = next_id.saturating_add(1);
    EducationEvent::new(
        format!("edu-{}", *next_id),
        session_id,
        event_type,
        timestamp,
        actor,
        visibility,
        severity,
        redact_text(&summary.into()),
        data,
    )
}

fn session_jsonl_path(root: &Path, session_id: &str) -> PathBuf {
    root.join(session_id).join("session.jsonl")
}

fn current_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn redacted_value(value: &Value) -> Value {
    match value {
        Value::String(value) => Value::String(redact_text(value)),
        Value::Array(values) => Value::Array(values.iter().map(redacted_value).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, value)| (key.clone(), redacted_value(value)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn tool_result_summary(result: &Result<ToolResult, ToolError>) -> String {
    match result {
        Ok(result) => summarize_text(&result.content),
        Err(err) => redact_text(&err.to_string()),
    }
}

fn summarize_text(text: &str) -> String {
    let redacted = redact_text(text);
    let single_line = redacted.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX_SUMMARY_CHARS: usize = 240;
    if single_line.chars().count() > MAX_SUMMARY_CHARS {
        let mut truncated = single_line
            .chars()
            .take(MAX_SUMMARY_CHARS)
            .collect::<String>();
        truncated.push('…');
        truncated
    } else {
        single_line
    }
}

fn is_shell_tool(name: &str) -> bool {
    matches!(
        name,
        "exec_shell"
            | "exec_shell_wait"
            | "exec_shell_interact"
            | "exec_shell_cancel"
            | "task_shell_start"
            | "task_shell_wait"
    )
}

fn shell_command(name: &str, input: &Value) -> Option<String> {
    is_shell_tool(name)
        .then(|| input.get("cmd").or_else(|| input.get("command")))
        .flatten()
        .and_then(Value::as_str)
        .map(redact_text)
}

fn file_path(input: &Value) -> Option<&str> {
    input.get("path").and_then(Value::as_str)
}

fn file_paths(input: &Value) -> Vec<String> {
    if let Ok(preflight) = crate::tools::apply_patch::preflight_apply_patch(input)
        && !preflight.touched_files.is_empty()
    {
        return preflight.touched_files;
    }

    let mut paths = Vec::new();
    if let Some(path) = file_path(input) {
        paths.push(path.to_string());
    }
    if let Some(changes) = input.get("changes").and_then(Value::as_array) {
        paths.extend(changes.iter().filter_map(|change| {
            change
                .get("path")
                .and_then(Value::as_str)
                .map(str::to_string)
        }));
    }
    paths.sort();
    paths.dedup();
    paths
}

fn file_tool_paths(name: &str, input: &Value) -> Vec<String> {
    if is_file_read_tool(name) || is_file_write_tool(name) {
        file_paths(input)
    } else {
        Vec::new()
    }
}

fn redacted_paths(paths: &[String]) -> Vec<String> {
    paths.iter().map(|path| redact_text(path)).collect()
}

fn tool_visibility(sensitive: bool) -> EducationVisibility {
    if sensitive {
        EducationVisibility::Teacher
    } else {
        EducationVisibility::Student
    }
}

fn is_file_read_tool(name: &str) -> bool {
    matches!(name, "read_file" | "list_dir" | "view_image")
}

fn is_file_write_tool(name: &str) -> bool {
    matches!(name, "write_file" | "edit_file" | "apply_patch")
}
