use std::fmt::{Display, Formatter, Result};
use serde::{Deserialize, Serialize};

/// Enterprise-grade structured error context for better debugging and monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContext {
    pub operation: String,
    pub component: String,
    pub severity: ErrorSeverity,
    pub timestamp: u64,
    pub correlation_id: Option<String>,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Low,
    Medium, 
    High,
    Critical,
}

impl ErrorContext {
    pub fn new(operation: impl Into<String>, component: impl Into<String>) -> Self {
        Self {
            operation: operation.into(),
            component: component.into(),
            severity: ErrorSeverity::Medium,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            correlation_id: None,
            metadata: std::collections::HashMap::new(),
        }
    }

    pub fn with_severity(mut self, severity: ErrorSeverity) -> Self {
        self.severity = severity;
        self
    }

    pub fn with_correlation_id(mut self, id: impl Into<String>) -> Self {
        self.correlation_id = Some(id.into());
        self
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}

/// Implements [Display] to print the error message in a friendly way.
/// Puts a summary first and details after that.
pub struct PrettyPrintError<'a>(pub &'a anyhow::Error);

impl Display for PrettyPrintError<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        let mut i = 0;
        let mut has_details = false;

        let descriptions = self
            .0
            .chain()
            .map(|cause| cause.to_string())
            .collect::<Vec<_>>();

        for description in &descriptions {
            // see turbo-tasks-backend/src/backend/operation/update_output.rs for the error message
            let hidden = description.starts_with("Execution of ");
            if !hidden {
                let header =
                    description
                        .split_once('\n')
                        .map_or(description.as_str(), |(header, _)| {
                            has_details = true;
                            header
                        });
                match i {
                    0 => write!(f, "{header}")?,
                    1 => write!(f, "\n\nCaused by:\n- {header}")?,
                    _ => write!(f, "\n- {header}")?,
                }
                i += 1;
            } else {
                has_details = true;
            }
        }
        if has_details {
            write!(f, "\n\nDebug info:")?;
            for description in descriptions {
                f.write_str("\n")?;
                WithDash(&description).fmt(f)?;
            }
        }
        Ok(())
    }
}

/// Indents all lines after the first one. Puts a dash before the first line.
struct WithDash<'a>(&'a str);

impl Display for WithDash<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        let mut lines = self.0.lines();
        if let Some(line) = lines.next() {
            write!(f, "- {line}")?;
        }
        for line in lines {
            write!(f, "\n  {line}")?;
        }
        Ok(())
    }
}
