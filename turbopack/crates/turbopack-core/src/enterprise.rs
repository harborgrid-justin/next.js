/// Enterprise improvements for Turbopack
/// Comprehensive error handling, retry mechanisms, and performance monitoring
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Enterprise error types with structured context
#[derive(Debug, Clone)]
pub enum EnterpriseError {
    ValidationError { 
        field: String, 
        reason: String,
        context: HashMap<String, String>
    },
    ProcessingError { 
        stage: String, 
        details: String,
        retry_after: Option<Duration>
    },
    ResourceError { 
        resource_type: String, 
        resource_id: String,
        exhausted: bool
    },
    SecurityError { 
        violation_type: String, 
        severity: SecuritySeverity 
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum SecuritySeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// Enhanced error context with metrics
#[derive(Debug, Clone)]
pub struct ErrorContext {
    pub error_id: String,
    pub timestamp: Instant,
    pub component: String,
    pub operation: String,
    pub metadata: HashMap<String, String>,
    pub retry_count: u32,
    pub correlation_id: Option<String>,
}

impl ErrorContext {
    pub fn new(component: &str, operation: &str) -> Self {
        Self {
            error_id: uuid::Uuid::new_v4().to_string(),
            timestamp: Instant::now(),
            component: component.to_string(),
            operation: operation.to_string(),
            metadata: HashMap::new(),
            retry_count: 0,
            correlation_id: None,
        }
    }

    pub fn with_metadata(mut self, key: &str, value: &str) -> Self {
        self.metadata.insert(key.to_string(), value.to_string());
        self
    }

    pub fn with_correlation_id(mut self, correlation_id: String) -> Self {
        self.correlation_id = Some(correlation_id);
        self
    }

    pub fn increment_retry(&mut self) {
        self.retry_count += 1;
    }
}

/// Circuit breaker implementation for resilience
#[derive(Debug)]
pub struct CircuitBreaker {
    name: String,
    failure_threshold: u32,
    timeout: Duration,
    failure_count: u32,
    last_failure_time: Option<Instant>,
    state: CircuitState,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CircuitState {
    Closed,    // Normal operation
    Open,      // Failing, blocking requests
    HalfOpen,  // Testing if service is back
}

impl CircuitBreaker {
    pub fn new(name: String, failure_threshold: u32, timeout: Duration) -> Self {
        Self {
            name,
            failure_threshold,
            timeout,
            failure_count: 0,
            last_failure_time: None,
            state: CircuitState::Closed,
        }
    }

    pub fn can_execute(&mut self) -> bool {
        match self.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                if let Some(last_failure) = self.last_failure_time {
                    if last_failure.elapsed() >= self.timeout {
                        self.state = CircuitState::HalfOpen;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            },
            CircuitState::HalfOpen => true,
        }
    }

    pub fn record_success(&mut self) {
        self.failure_count = 0;
        self.state = CircuitState::Closed;
        self.last_failure_time = None;
    }

    pub fn record_failure(&mut self) {
        self.failure_count += 1;
        self.last_failure_time = Some(Instant::now());

        if self.failure_count >= self.failure_threshold {
            self.state = CircuitState::Open;
        }
    }

    pub fn get_state(&self) -> &CircuitState {
        &self.state
    }
}

/// Retry configuration with exponential backoff
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
    pub backoff_multiplier: f64,
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(30),
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

impl RetryConfig {
    pub fn calculate_delay(&self, attempt: u32) -> Duration {
        let delay = self.base_delay.as_millis() as f64 
            * self.backoff_multiplier.powi(attempt as i32);
        
        let delay = delay.min(self.max_delay.as_millis() as f64) as u64;
        let mut delay = Duration::from_millis(delay);

        // Add jitter to prevent thundering herd
        if self.jitter {
            use rand::Rng;
            let jitter_factor = rand::thread_rng().gen_range(0.8..1.2);
            delay = Duration::from_millis((delay.as_millis() as f64 * jitter_factor) as u64);
        }

        delay
    }
}

/// Retry mechanism with circuit breaker integration
pub async fn retry_with_backoff<F, T, E>(
    operation_name: &str,
    mut operation: F,
    config: RetryConfig,
    circuit_breaker: Option<Arc<std::sync::Mutex<CircuitBreaker>>>,
) -> Result<T, EnterpriseError>
where
    F: FnMut() -> Result<T, E>,
    E: std::error::Error + Send + Sync + 'static,
{
    let mut context = ErrorContext::new("retry_manager", operation_name);
    let mut last_error = None;

    for attempt in 0..config.max_attempts {
        // Check circuit breaker
        if let Some(ref cb) = circuit_breaker {
            let mut breaker = cb.lock().unwrap();
            if !breaker.can_execute() {
                return Err(EnterpriseError::ProcessingError {
                    stage: "circuit_breaker".to_string(),
                    details: format!("Circuit breaker is open for {}", breaker.name),
                    retry_after: Some(Duration::from_secs(30)),
                });
            }
        }

        context.increment_retry();

        match operation() {
            Ok(result) => {
                if let Some(ref cb) = circuit_breaker {
                    cb.lock().unwrap().record_success();
                }
                return Ok(result);
            },
            Err(e) => {
                last_error = Some(e);
                
                if let Some(ref cb) = circuit_breaker {
                    cb.lock().unwrap().record_failure();
                }

                if attempt < config.max_attempts - 1 {
                    let delay = config.calculate_delay(attempt);
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    Err(EnterpriseError::ProcessingError {
        stage: "retry_exhausted".to_string(),
        details: format!("All {} attempts failed for operation {}", 
                        config.max_attempts, operation_name),
        retry_after: Some(Duration::from_secs(60)),
    })
}

/// Performance metrics collector
#[derive(Debug, Default)]
pub struct MetricsCollector {
    counters: HashMap<String, u64>,
    gauges: HashMap<String, f64>,
    histograms: HashMap<String, Vec<f64>>,
    timers: HashMap<String, Vec<Duration>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn increment_counter(&mut self, name: &str) {
        *self.counters.entry(name.to_string()).or_insert(0) += 1;
    }

    pub fn set_gauge(&mut self, name: &str, value: f64) {
        self.gauges.insert(name.to_string(), value);
    }

    pub fn record_histogram(&mut self, name: &str, value: f64) {
        self.histograms.entry(name.to_string()).or_default().push(value);
    }

    pub fn record_timer(&mut self, name: &str, duration: Duration) {
        self.timers.entry(name.to_string()).or_default().push(duration);
    }

    pub fn get_counter(&self, name: &str) -> u64 {
        self.counters.get(name).copied().unwrap_or(0)
    }

    pub fn get_gauge(&self, name: &str) -> Option<f64> {
        self.gauges.get(name).copied()
    }

    pub fn get_histogram_stats(&self, name: &str) -> Option<HistogramStats> {
        self.histograms.get(name).map(|values| {
            let mut sorted = values.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            
            let len = sorted.len();
            let mean = sorted.iter().sum::<f64>() / len as f64;
            let p50 = sorted[len / 2];
            let p95 = sorted[len * 95 / 100];
            let p99 = sorted[len * 99 / 100];

            HistogramStats { mean, p50, p95, p99, count: len }
        })
    }

    pub fn export_metrics(&self) -> HashMap<String, serde_json::Value> {
        let mut metrics = HashMap::new();
        
        metrics.insert("counters".to_string(), 
                      serde_json::to_value(&self.counters).unwrap());
        metrics.insert("gauges".to_string(), 
                      serde_json::to_value(&self.gauges).unwrap());
        
        // Convert histograms to stats
        let histogram_stats: HashMap<String, HistogramStats> = self.histograms
            .iter()
            .map(|(name, _)| (name.clone(), self.get_histogram_stats(name).unwrap()))
            .collect();
        
        metrics.insert("histograms".to_string(), 
                      serde_json::to_value(&histogram_stats).unwrap());
        
        metrics
    }
}

#[derive(Debug, serde::Serialize)]
pub struct HistogramStats {
    pub mean: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub count: usize,
}

/// Resource pool for memory optimization
#[derive(Debug)]
pub struct ResourcePool<T> {
    name: String,
    pool: Vec<T>,
    factory: Box<dyn Fn() -> T + Send + Sync>,
    max_size: usize,
    created_count: u64,
    borrowed_count: u64,
}

impl<T> ResourcePool<T> {
    pub fn new<F>(name: String, factory: F, max_size: usize) -> Self 
    where 
        F: Fn() -> T + Send + Sync + 'static 
    {
        Self {
            name,
            pool: Vec::new(),
            factory: Box::new(factory),
            max_size,
            created_count: 0,
            borrowed_count: 0,
        }
    }

    pub fn borrow(&mut self) -> T {
        if let Some(item) = self.pool.pop() {
            self.borrowed_count += 1;
            item
        } else {
            self.created_count += 1;
            self.borrowed_count += 1;
            (self.factory)()
        }
    }

    pub fn return_item(&mut self, item: T) {
        if self.pool.len() < self.max_size {
            self.pool.push(item);
        }
        // If pool is full, item is dropped
    }

    pub fn stats(&self) -> PoolStats {
        PoolStats {
            pool_size: self.pool.len(),
            max_size: self.max_size,
            created_count: self.created_count,
            borrowed_count: self.borrowed_count,
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct PoolStats {
    pub pool_size: usize,
    pub max_size: usize,
    pub created_count: u64,
    pub borrowed_count: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_states() {
        let mut breaker = CircuitBreaker::new("test".to_string(), 2, Duration::from_secs(1));
        
        // Initially closed
        assert!(breaker.can_execute());
        assert_eq!(breaker.get_state(), &CircuitState::Closed);
        
        // After failures, should open
        breaker.record_failure();
        assert!(breaker.can_execute()); // Still closed
        breaker.record_failure();
        assert!(!breaker.can_execute()); // Now open
        assert_eq!(breaker.get_state(), &CircuitState::Open);
        
        // Success should close the circuit
        breaker.record_success();
        assert!(breaker.can_execute());
        assert_eq!(breaker.get_state(), &CircuitState::Closed);
    }

    #[test]
    fn test_retry_config_delay_calculation() {
        let config = RetryConfig {
            max_attempts: 5,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            backoff_multiplier: 2.0,
            jitter: false,
        };

        let delay1 = config.calculate_delay(0);
        let delay2 = config.calculate_delay(1);
        let delay3 = config.calculate_delay(2);

        assert_eq!(delay1.as_millis(), 100);
        assert_eq!(delay2.as_millis(), 200);
        assert_eq!(delay3.as_millis(), 400);
    }

    #[test]
    fn test_metrics_collector() {
        let mut collector = MetricsCollector::new();
        
        collector.increment_counter("requests");
        collector.increment_counter("requests");
        assert_eq!(collector.get_counter("requests"), 2);
        
        collector.set_gauge("memory_usage", 75.5);
        assert_eq!(collector.get_gauge("memory_usage"), Some(75.5));
        
        collector.record_histogram("response_time", 100.0);
        collector.record_histogram("response_time", 200.0);
        collector.record_histogram("response_time", 150.0);
        
        let stats = collector.get_histogram_stats("response_time").unwrap();
        assert_eq!(stats.count, 3);
        assert_eq!(stats.mean, 150.0);
    }

    #[test]
    fn test_resource_pool() {
        let mut pool = ResourcePool::new(
            "test_pool".to_string(),
            || String::from("resource"),
            3
        );

        let item1 = pool.borrow();
        let item2 = pool.borrow();
        assert_eq!(pool.stats().created_count, 2);

        pool.return_item(item1);
        pool.return_item(item2);
        assert_eq!(pool.stats().pool_size, 2);

        // Borrow again should reuse from pool
        let _item3 = pool.borrow();
        assert_eq!(pool.stats().created_count, 2); // No new creation
    }

    #[test]
    fn test_error_context() {
        let context = ErrorContext::new("test_component", "test_operation")
            .with_metadata("user_id", "12345")
            .with_correlation_id("abc-def-123".to_string());

        assert_eq!(context.component, "test_component");
        assert_eq!(context.operation, "test_operation");
        assert_eq!(context.metadata.get("user_id"), Some(&"12345".to_string()));
        assert_eq!(context.correlation_id, Some("abc-def-123".to_string()));
    }
}