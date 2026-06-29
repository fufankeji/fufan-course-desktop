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
