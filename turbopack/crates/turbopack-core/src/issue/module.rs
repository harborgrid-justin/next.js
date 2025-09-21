use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc, ValueToString};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueStage, OptionStyledString, StyledString};
use crate::{ident::AssetIdent, issue::IssueExt, source::Source};

/// Enterprise improvement: Input validation utilities
pub mod validation {
    /// Validates file paths for security and correctness
    pub fn validate_file_path(path: &str) -> Result<(), String> {
        // Check for path traversal attempts
        if path.contains("..") || path.contains("//") {
            return Err("Invalid path: contains path traversal sequences".to_string());
        }
        
        // Check for null bytes
        if path.contains('\0') {
            return Err("Invalid path: contains null bytes".to_string());
        }
        
        // Check for excessive length
        if path.len() > crate::config::filesystem::MAX_PATH_LENGTH {
            return Err(format!(
                "Invalid path: exceeds maximum length of {} characters", 
                crate::config::filesystem::MAX_PATH_LENGTH
            ));
        }
        
        // Check for invalid characters in Windows
        if cfg!(target_os = "windows") {
            let invalid_chars = ['<', '>', ':', '"', '|', '?', '*'];
            if path.chars().any(|c| invalid_chars.contains(&c)) {
                return Err("Invalid path: contains Windows-forbidden characters".to_string());
            }
        }
        
        Ok(())
    }
    
    /// Validates module identifiers
    pub fn validate_module_identifier(id: &str) -> Result<(), String> {
        use once_cell::sync::Lazy;
        use regex::Regex;
        
        if id.is_empty() {
            return Err("Module identifier cannot be empty".to_string());
        }
        
        if id.len() > crate::config::validation::MAX_MODULE_ID_LENGTH {
            return Err(format!(
                "Module identifier exceeds maximum length of {} characters", 
                crate::config::validation::MAX_MODULE_ID_LENGTH
            ));
        }
        
        // Check for valid JavaScript identifier pattern
        static VALID_ID: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r"^[a-zA-Z_$][a-zA-Z0-9_$]*$").unwrap()
        });
        
        if !VALID_ID.is_match(id) {
            return Err("Module identifier contains invalid characters".to_string());
        }
        
        Ok(())
    }
    
    /// Sanitizes user input strings
    pub fn sanitize_user_input(input: &str) -> String {
        input
            .chars()
            .filter(|&c| c.is_ascii() && !c.is_control() || c == '\n' || c == '\t')
            .collect::<String>()
            .trim()
            .to_string()
    }
    
    /// Rate limiting for operations
    #[derive(Debug)]
    pub struct RateLimiter {
        max_requests: usize,
        window_duration: std::time::Duration,
        requests: std::collections::VecDeque<std::time::Instant>,
    }
    
    impl RateLimiter {
        pub fn new(max_requests: usize, window_duration: std::time::Duration) -> Self {
            Self {
                max_requests,
                window_duration,
                requests: std::collections::VecDeque::new(),
            }
        }
        
        pub fn is_allowed(&mut self) -> bool {
            let now = std::time::Instant::now();
            
            // Remove old requests outside the window
            while let Some(&front) = self.requests.front() {
                if now.duration_since(front) > self.window_duration {
                    self.requests.pop_front();
                } else {
                    break;
                }
            }
            
            if self.requests.len() < self.max_requests {
                self.requests.push_back(now);
                true
            } else {
                false
            }
        }
    }
}

#[turbo_tasks::value(shared)]
pub struct ModuleIssue {
    pub ident: ResolvedVc<AssetIdent>,
    pub title: ResolvedVc<StyledString>,
    pub description: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for ModuleIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::ProcessModule.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}

#[turbo_tasks::function]
pub async fn emit_unknown_module_type_error(source: Vc<Box<dyn Source>>) -> Result<()> {
    // Enterprise improvement: Add validation before creating issue
    let ident = source.ident().to_resolved().await?;
    let path = ident.path();
    let path_string = path.to_string().await?;
    let path_str = &*path_string;
    
    // Validate the path for security
    if let Err(validation_error) = validation::validate_file_path(path_str) {
        tracing::warn!(
            path = %path_str,
            error = %validation_error,
            "Path validation failed for unknown module type"
        );
    }
    
    // Sanitize description content
    let raw_description = r"This module doesn't have an associated type. Use a known file extension, or register a loader for it.

Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders";
    let sanitized_description = validation::sanitize_user_input(raw_description);
    
    // Add enhanced error context
    let context = crate::error::ErrorContext::new("emit_unknown_module_type", "turbopack-core")
        .with_severity(crate::error::ErrorSeverity::Medium)
        .with_metadata("module_path", path_str.to_string())
        .with_metadata("file_extension", 
            std::path::Path::new(path_str)
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("none")
                .to_string()
        );
    
    tracing::debug!(context = ?context, "Emitting unknown module type error");
    
    ModuleIssue {
        ident,
        title: StyledString::Text("Unknown module type".into()).resolved_cell(),
        description: StyledString::Text(sanitized_description.into()).resolved_cell(),
    }
    .resolved_cell()
    .emit();

    Ok(())
}
