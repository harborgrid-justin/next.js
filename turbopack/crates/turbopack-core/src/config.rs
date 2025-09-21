/// Enterprise improvement: Centralized constants and configuration management
use std::time::Duration;

/// File system constants
pub mod filesystem {
    /// Maximum allowed path length for security
    pub const MAX_PATH_LENGTH: usize = 4096;
    
    /// Maximum file size for processing (in bytes)
    pub const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100MB
    
    /// Default file encoding
    pub const DEFAULT_ENCODING: &str = "utf-8";
    
    /// Common file extensions
    pub const SUPPORTED_EXTENSIONS: &[&str] = &[
        ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
        ".json", ".css", ".scss", ".less", ".wasm",
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"
    ];
}

/// Network and timeout constants
pub mod network {
    use super::Duration;
    
    /// Default timeout for resolve operations
    pub const DEFAULT_RESOLVE_TIMEOUT: Duration = Duration::from_secs(30);
    
    /// Default timeout for file operations
    pub const DEFAULT_FILE_TIMEOUT: Duration = Duration::from_secs(10);
    
    /// Maximum number of redirect attempts
    pub const MAX_REDIRECTS: u32 = 10;
    
    /// Default user agent for requests
    pub const DEFAULT_USER_AGENT: &str = "turbopack-core/0.1.0";
}

/// Retry and resilience constants
pub mod retry {
    use super::Duration;
    
    /// Default maximum retry attempts
    pub const DEFAULT_MAX_ATTEMPTS: u32 = 3;
    
    /// Default initial delay between retries
    pub const DEFAULT_INITIAL_DELAY: Duration = Duration::from_millis(100);
    
    /// Default maximum delay between retries
    pub const DEFAULT_MAX_DELAY: Duration = Duration::from_millis(5000);
    
    /// Default backoff multiplier
    pub const DEFAULT_BACKOFF_MULTIPLIER: f64 = 2.0;
    
    /// Circuit breaker failure threshold
    pub const CIRCUIT_BREAKER_FAILURE_THRESHOLD: u32 = 5;
    
    /// Circuit breaker timeout duration
    pub const CIRCUIT_BREAKER_TIMEOUT: Duration = Duration::from_secs(60);
}

/// Cache and performance constants
pub mod cache {
    /// Default cache size limit
    pub const DEFAULT_CACHE_SIZE: usize = 10000;
    
    /// Default cache TTL in seconds
    pub const DEFAULT_CACHE_TTL: u64 = 3600;
    
    /// Maximum memory usage for caching (in bytes)
    pub const MAX_CACHE_MEMORY: usize = 256 * 1024 * 1024; // 256MB
}

/// Validation constants
pub mod validation {
    /// Maximum length for module identifiers
    pub const MAX_MODULE_ID_LENGTH: usize = 255;
    
    /// Maximum length for user input strings
    pub const MAX_USER_INPUT_LENGTH: usize = 4096;
    
    /// Rate limiting constants
    pub const DEFAULT_RATE_LIMIT_REQUESTS: usize = 1000;
    pub const DEFAULT_RATE_LIMIT_WINDOW_SECS: u64 = 3600;
}

/// Error handling constants
pub mod errors {
    /// Maximum error message length
    pub const MAX_ERROR_MESSAGE_LENGTH: usize = 2048;
    
    /// Default error severity level
    pub const DEFAULT_ERROR_SEVERITY: &str = "medium";
    
    /// Maximum number of error contexts to keep
    pub const MAX_ERROR_CONTEXTS: usize = 10;
}

/// Enterprise configuration structure
#[derive(Debug, Clone)]
pub struct EnterpriseConfig {
    pub enable_metrics: bool,
    pub enable_tracing: bool,
    pub max_concurrent_operations: usize,
    pub security_mode: SecurityMode,
    pub performance_mode: PerformanceMode,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SecurityMode {
    Strict,
    Normal,
    Permissive,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PerformanceMode {
    Development,
    Production,
    Debug,
}

impl Default for EnterpriseConfig {
    fn default() -> Self {
        Self {
            enable_metrics: true,
            enable_tracing: true,
            max_concurrent_operations: 100,
            security_mode: SecurityMode::Normal,
            performance_mode: PerformanceMode::Development,
        }
    }
}

/// Environment-based configuration loader
impl EnterpriseConfig {
    pub fn from_env() -> Self {
        Self {
            enable_metrics: std::env::var("TURBOPACK_ENABLE_METRICS")
                .map(|v| v.to_lowercase() == "true")
                .unwrap_or(true),
            enable_tracing: std::env::var("TURBOPACK_ENABLE_TRACING")
                .map(|v| v.to_lowercase() == "true")
                .unwrap_or(true),
            max_concurrent_operations: std::env::var("TURBOPACK_MAX_CONCURRENT_OPS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            security_mode: std::env::var("TURBOPACK_SECURITY_MODE")
                .as_deref()
                .map(|mode| match mode.to_lowercase().as_str() {
                    "strict" => SecurityMode::Strict,
                    "permissive" => SecurityMode::Permissive,
                    _ => SecurityMode::Normal,
                })
                .unwrap_or(SecurityMode::Normal),
            performance_mode: std::env::var("TURBOPACK_PERFORMANCE_MODE")
                .as_deref()
                .map(|mode| match mode.to_lowercase().as_str() {
                    "production" => PerformanceMode::Production,
                    "debug" => PerformanceMode::Debug,
                    _ => PerformanceMode::Development,
                })
                .unwrap_or(PerformanceMode::Development),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = EnterpriseConfig::default();
        assert_eq!(config.security_mode, SecurityMode::Normal);
        assert_eq!(config.performance_mode, PerformanceMode::Development);
        assert!(config.enable_metrics);
    }
    
    #[test]
    fn test_constants_are_reasonable() {
        assert!(filesystem::MAX_PATH_LENGTH > 0);
        assert!(cache::DEFAULT_CACHE_SIZE > 0);
        assert!(retry::DEFAULT_MAX_ATTEMPTS > 0);
        assert!(!network::DEFAULT_USER_AGENT.is_empty());
    }
}