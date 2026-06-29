use std::fs::{File, create_dir_all, write};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::course::CourseConfig;
use super::events::{EducationEvent, EducationEventType};
use super::redaction::redact_text;

pub fn render_markdown_report(course: Option<&CourseConfig>, events: &[EducationEvent]) -> String {
    let title = course
        .map(|course| course.title.as_str())
        .unwrap_or("未命名课程");
    let mut report = String::new();

    push_line(&mut report, &format!("# {title} - 课堂复盘"));
    push_line(&mut report, "");
    push_course_summary(&mut report, course, events);
    push_timeline(&mut report, events);
    push_file_changes(&mut report, events);
    push_shell_commands(&mut report, events);
    push_approvals(&mut report, events);
    push_suggestions(&mut report, events);

    report
}

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

pub fn read_jsonl_events(path: impl AsRef<Path>) -> std::io::Result<Vec<EducationEvent>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let event = serde_json::from_str::<EducationEvent>(&line)
            .map_err(|source| std::io::Error::new(std::io::ErrorKind::InvalidData, source))?;
        events.push(event);
    }
    Ok(events)
}

fn push_course_summary(
    report: &mut String,
    course: Option<&CourseConfig>,
    events: &[EducationEvent],
) {
    push_line(report, "## 会话摘要");
    if let Some(course) = course {
        push_line(report, &format!("- 课程 ID：{}", course.id));
        if let Some(audience) = course.audience.as_deref() {
            push_line(report, &format!("- 学员对象：{audience}"));
        }
        if let Some(mode) = course.mode.as_deref() {
            push_line(report, &format!("- 授课模式：{mode}"));
        }
        if let Some(model) = course.recommended_model.as_deref() {
            push_line(report, &format!("- 推荐模型：{model}"));
        }
        if !course.objectives.is_empty() {
            push_line(
                report,
                &format!("- 学习目标：{}", course.objectives.join("；")),
            );
        }
    } else {
        push_line(report, "- 课程 ID：未配置");
    }
    push_line(report, &format!("- 事件总数：{}", events.len()));
    push_line(report, "");
}

fn push_timeline(report: &mut String, events: &[EducationEvent]) {
    push_line(report, "## 关键时间线");
    if events.is_empty() {
        push_line(report, "- 暂无事件");
    } else {
        for event in events {
            push_line(
                report,
                &format!(
                    "- `{}` `{}` {}",
                    event.timestamp,
                    event_type_label(&event.event_type),
                    redact_text(&event.summary)
                ),
            );
        }
    }
    push_line(report, "");
}

fn push_file_changes(report: &mut String, events: &[EducationEvent]) {
    push_line(report, "## 文件变化");
    let file_events = events
        .iter()
        .filter(|event| {
            matches!(
                event.event_type,
                EducationEventType::FileRead | EducationEventType::FileChanged
            )
        })
        .collect::<Vec<_>>();
    if file_events.is_empty() {
        push_line(report, "- 暂无文件变化");
    } else {
        for event in file_events {
            push_line(
                report,
                &format!(
                    "- `{}` {}：{}",
                    event_type_label(&event.event_type),
                    data_string(&event.data, "path").unwrap_or_else(|| "未记录路径".to_string()),
                    redact_text(&event.summary)
                ),
            );
        }
    }
    push_line(report, "");
}

fn push_shell_commands(report: &mut String, events: &[EducationEvent]) {
    push_line(report, "## 命令执行");
    let shell_events = events
        .iter()
        .filter(|event| {
            matches!(
                event.event_type,
                EducationEventType::ShellStarted | EducationEventType::ShellFinished
            )
        })
        .collect::<Vec<_>>();
    if shell_events.is_empty() {
        push_line(report, "- 暂无命令执行");
    } else {
        for event in shell_events {
            let mut line = format!(
                "- `{}` {}",
                event_type_label(&event.event_type),
                data_string(&event.data, "command").unwrap_or_else(|| redact_text(&event.summary))
            );
            if let Some(exit_code) = data_i64(&event.data, "exit_code") {
                line.push_str(&format!("，退出码：{exit_code}"));
            }
            push_line(report, &line);
        }
    }
    push_line(report, "");
}

fn push_approvals(report: &mut String, events: &[EducationEvent]) {
    push_line(report, "## 安全审批");
    let approval_events = events
        .iter()
        .filter(|event| {
            matches!(
                event.event_type,
                EducationEventType::ApprovalRequested
                    | EducationEventType::ApprovalResolved
                    | EducationEventType::SafetyBlocked
                    | EducationEventType::SafetyRedacted
            )
        })
        .collect::<Vec<_>>();
    if approval_events.is_empty() {
        push_line(report, "- 暂无安全审批事件");
    } else {
        for event in approval_events {
            push_line(
                report,
                &format!(
                    "- `{}` {}",
                    event_type_label(&event.event_type),
                    redact_text(&event.summary)
                ),
            );
        }
    }
    push_line(report, "");
}

fn push_suggestions(report: &mut String, events: &[EducationEvent]) {
    push_line(report, "## 复盘建议");
    if events.is_empty() {
        push_line(report, "- 下次授课前先确认课程配置和事件采集是否开启。");
        return;
    }

    let command_count = events
        .iter()
        .filter(|event| {
            matches!(
                event.event_type,
                EducationEventType::ShellStarted | EducationEventType::ShellFinished
            )
        })
        .count();
    let approval_count = events
        .iter()
        .filter(|event| {
            matches!(
                event.event_type,
                EducationEventType::ApprovalRequested
                    | EducationEventType::ApprovalResolved
                    | EducationEventType::SafetyBlocked
            )
        })
        .count();

    if command_count == 0 {
        push_line(report, "- 增加可观察的命令演示，帮助学员理解工具调用链路。");
    } else {
        push_line(
            report,
            "- 复盘关键命令的输入、输出和失败处理，让学员形成可迁移的调试路径。",
        );
    }
    if approval_count > 0 {
        push_line(
            report,
            "- 对安全审批节点做课堂讲解，明确哪些操作需要人工确认。",
        );
    } else {
        push_line(report, "- 保持安全审批记录开启，便于课后追踪高风险操作。");
    }
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

fn data_string(data: &Value, key: &str) -> Option<String> {
    data.get(key)?.as_str().map(redact_text)
}

fn data_i64(data: &Value, key: &str) -> Option<i64> {
    data.get(key)?.as_i64()
}

fn push_line(report: &mut String, line: &str) {
    report.push_str(line);
    report.push('\n');
}
