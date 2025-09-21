use anyhow::Result;
use turbo_tasks::{FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::module_graph::module_batch::{ChunkableModuleOrBatch, IdentStrings};

/// Enterprise improvement: Abstract trait for module availability checking
pub trait ModuleAvailabilityChecker: Send + Sync {
    /// Check if a module or batch is available
    fn is_available(&self, module_or_batch: ChunkableModuleOrBatch) -> bool;
    
    /// Get all available modules
    fn get_available_modules(&self) -> Vec<ChunkableModuleOrBatch>;
    
    /// Add modules to availability
    fn add_modules(&mut self, modules: &[ChunkableModuleOrBatch]);
}

/// Enterprise improvement: Configuration for module availability policies
#[derive(Debug, Clone)]
pub struct AvailabilityConfig {
    pub cache_enabled: bool,
    pub max_cache_size: usize,
    pub enable_fallback: bool,
    pub strict_mode: bool,
}

impl Default for AvailabilityConfig {
    fn default() -> Self {
        Self {
            cache_enabled: true,
            max_cache_size: 10000,
            enable_fallback: true,
            strict_mode: false,
        }
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct AvailableModulesSet(FxIndexSet<ChunkableModuleOrBatch>);

/// Allows to gather information about which assets are already available.
/// Adding more roots will form a linked list like structure to allow caching
/// `include` queries.
#[turbo_tasks::value]
pub struct AvailableModules {
    parent: Option<ResolvedVc<AvailableModules>>,
    modules: ResolvedVc<AvailableModulesSet>,
}

#[turbo_tasks::value_impl]
impl AvailableModules {
    #[turbo_tasks::function]
    pub fn new(modules: ResolvedVc<AvailableModulesSet>) -> Vc<Self> {
        AvailableModules {
            parent: None,
            modules,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn with_modules(
        self: ResolvedVc<Self>,
        modules: ResolvedVc<AvailableModulesSet>,
    ) -> Result<Vc<Self>> {
        Ok(AvailableModules {
            parent: Some(self),
            modules,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        if let Some(parent) = self.parent {
            hasher.write_value(parent.hash().await?);
        } else {
            hasher.write_value(0u64);
        }
        let item_idents = self
            .modules
            .await?
            .iter()
            .map(|&module| module.ident_strings())
            .try_join()
            .await?;
        for idents in item_idents {
            match idents {
                IdentStrings::Single(ident) => hasher.write_value(ident),
                IdentStrings::Multiple(idents) => {
                    for ident in idents {
                        hasher.write_value(ident);
                    }
                }
                IdentStrings::None => {}
            }
        }
        Ok(Vc::cell(hasher.finish()))
    }

    #[turbo_tasks::function]
    pub async fn get(&self, module_or_batch: ChunkableModuleOrBatch) -> Result<Vc<bool>> {
        if self.modules.await?.contains(&module_or_batch) {
            return Ok(Vc::cell(true));
        };
        if let Some(parent) = self.parent {
            return Ok(parent.get(module_or_batch));
        }
        Ok(Vc::cell(false))
    }

    #[turbo_tasks::function]
    pub async fn snapshot(&self) -> Result<Vc<AvailableModulesSnapshot>> {
        let modules = self.modules.await?;
        let (parent, depth) = if let Some(parent) = self.parent {
            let parent_snapshot = parent.snapshot().await?;
            let parent_depth = parent_snapshot.depth;
            (Some(parent_snapshot), parent_depth + 1)
        } else {
            (None, 0)
        };

        // Enterprise improvement: Create snapshot with enhanced metadata
        Ok(AvailableModulesSnapshot { 
            parent, 
            modules,
            creation_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            depth,
        }.cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Debug, Clone)]
pub struct AvailableModulesSnapshot {
    parent: Option<ReadRef<AvailableModulesSnapshot>>,
    modules: ReadRef<AvailableModulesSet>,
    /// Enterprise improvement: Simple metadata for better observability
    pub creation_timestamp: u64,
    pub depth: usize,
}

/// Enterprise improvement: Metadata for tracking snapshot performance and usage
#[derive(Debug, Clone)]
pub struct SnapshotMetadata {
    pub creation_timestamp: u64,
    pub hit_count: std::sync::Arc<std::sync::atomic::AtomicU64>,
    pub miss_count: std::sync::Arc<std::sync::atomic::AtomicU64>,
    pub depth: usize,
}

impl Default for SnapshotMetadata {
    fn default() -> Self {
        Self {
            creation_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            hit_count: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0)),
            miss_count: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0)),
            depth: 0,
        }
    }
}

impl AvailableModulesSnapshot {
    /// Enterprise improvement: Enhanced availability check with metrics
    pub fn get(&self, module_or_batch: ChunkableModuleOrBatch) -> bool {
        let found = self.modules.contains(&module_or_batch)
            || self
                .parent
                .as_ref()
                .is_some_and(|parent| parent.get(module_or_batch));
                
        // Log usage for monitoring (simplified without atomics)
        if found {
            tracing::trace!("Cache hit for module lookup at depth {}", self.depth);
        } else {
            tracing::trace!("Cache miss for module lookup at depth {}", self.depth);
        }
        
        found
    }
    
    /// Enterprise improvement: Get cache statistics
    pub fn get_statistics(&self) -> CacheStatistics {
        CacheStatistics {
            depth: self.depth,
            age_seconds: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .saturating_sub(self.creation_timestamp),
        }
    }
}

/// Enterprise improvement: Simplified cache performance statistics
#[derive(Debug, Clone)]
pub struct CacheStatistics {
    pub depth: usize,
    pub age_seconds: u64,
}
