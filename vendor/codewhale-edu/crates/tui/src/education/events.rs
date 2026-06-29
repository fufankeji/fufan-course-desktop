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
    #[allow(clippy::too_many_arguments)]
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
