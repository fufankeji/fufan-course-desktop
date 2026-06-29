use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};

use super::events::{EducationSeverity, EducationVisibility};
use super::state::EducationState;

pub fn render_teaching_sidebar(frame: &mut Frame<'_>, area: Rect, state: &EducationState) {
    let items = state
        .recent()
        .filter(|event| event.visibility == EducationVisibility::Student)
        .take(40)
        .map(|event| {
            let style = match event.severity {
                EducationSeverity::Debug => Style::default().fg(Color::DarkGray),
                EducationSeverity::Info => Style::default().fg(Color::White),
                EducationSeverity::Warning => Style::default().fg(Color::Yellow),
                EducationSeverity::Error => {
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)
                }
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
