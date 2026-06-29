use std::error::Error;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

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
    let contents = fs::read_to_string(path).map_err(|source| CourseLoadError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    // Temporary MVP parser choice; revisit serde_yaml before external distribution.
    serde_yaml::from_str(&contents).map_err(|source| CourseLoadError::Yaml {
        path: path.to_path_buf(),
        source,
    })
}

#[derive(Debug)]
pub enum CourseLoadError {
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    Yaml {
        path: PathBuf,
        source: serde_yaml::Error,
    },
}

impl fmt::Display for CourseLoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { path, source } => {
                write!(
                    f,
                    "failed to read course YAML at {}: {source}",
                    path.display()
                )
            }
            Self::Yaml { path, source } => {
                write!(
                    f,
                    "failed to parse course YAML at {}: {source}",
                    path.display()
                )
            }
        }
    }
}

impl Error for CourseLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Yaml { source, .. } => Some(source),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_safety_mode() -> String {
    "classroom".to_string()
}
