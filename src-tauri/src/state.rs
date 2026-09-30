use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::ai_router::AIRouter;
use crate::analytics::Analytics;
use crate::paths::Workspace;
use crate::spaced_repetition::{ReviewQuality, SpacedRepetitionEngine};
use crate::storage::read_json;

const MAX_TRACKED_GENERATIONS: usize = 64;

#[derive(Clone, Debug)]
pub struct DataPaths {
    pub canvas_state: PathBuf,
    pub settings: PathBuf,
    pub exams: PathBuf,
    pub providers: PathBuf,
    pub collections: PathBuf,
    pub flashcards: PathBuf,
    pub chat_sessions: PathBuf,
    pub motivation_sessions: PathBuf,
    pub legacy_card_qualities: PathBuf,
    pub analytics_dir: PathBuf,
    pub backups_dir: PathBuf,
}

impl DataPaths {
    pub fn new(workspace: &Workspace) -> Self {
        Self {
            canvas_state: workspace.join("canvas").join("state.json"),
            settings: workspace.join("settings.json"),
            exams: workspace.join("exams_data.json"),
            providers: workspace.join("providers.json"),
            collections: workspace.join("collections.json"),
            flashcards: workspace.join("flashcards.json"),
            chat_sessions: workspace.join("chat_sessions.json"),
            motivation_sessions: workspace.join("motivation_sessions.json"),
            legacy_card_qualities: workspace.join("card_qualities.json"),
            analytics_dir: workspace.join("analytics"),
            backups_dir: workspace.join("backups"),
        }
    }
}

#[derive(Default)]
pub struct Generations {
    flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

pub struct GenerationGuard<'a> {
    owner: &'a Generations,
    id: String,
    flag: Arc<AtomicBool>,
}

impl Generations {
    pub fn begin(&self, id: &str) -> GenerationGuard<'_> {
        let flag = match self.flags.lock() {
            Ok(mut flags) => flags
                .entry(id.to_string())
                .or_insert_with(|| Arc::new(AtomicBool::new(false)))
                .clone(),
            Err(_) => Arc::new(AtomicBool::new(false)),
        };
        GenerationGuard {
            owner: self,
            id: id.to_string(),
            flag,
        }
    }

    pub fn cancel(&self, id: Option<&str>) {
        let Ok(mut flags) = self.flags.lock() else {
            return;
        };
        match id {
            Some(id) => {
                if flags.len() >= MAX_TRACKED_GENERATIONS {
                    flags.retain(|_, flag| !flag.load(Ordering::SeqCst));
                }
                flags
                    .entry(id.to_string())
                    .or_insert_with(|| Arc::new(AtomicBool::new(false)))
                    .store(true, Ordering::SeqCst);
            }
            None => flags
                .values()
                .for_each(|flag| flag.store(true, Ordering::SeqCst)),
        }
    }
}

impl GenerationGuard<'_> {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn flag(&self) -> &AtomicBool {
        &self.flag
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }
}

impl Drop for GenerationGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut flags) = self.owner.flags.lock() {
            if flags
                .get(&self.id)
                .is_some_and(|flag| Arc::ptr_eq(flag, &self.flag))
            {
                flags.remove(&self.id);
            }
        }
    }
}

pub struct AppState {
    pub workspace: Workspace,
    pub paths: DataPaths,
    pub ai_router: Mutex<AIRouter>,
    pub flashcards: Mutex<SpacedRepetitionEngine>,
    pub analytics: Analytics,
    pub generations: Generations,
}

pub fn lock_error<T>(err: std::sync::PoisonError<T>) -> String {
    format!("Internal state lock failed: {err}")
}

fn migrate_card_qualities(engine: &mut SpacedRepetitionEngine, path: &Path) {
    if !path.exists() {
        return;
    }
    if let Some(qualities) = read_json::<HashMap<String, ReviewQuality>>(path) {
        if engine.apply_legacy_qualities(qualities).is_ok() {
            let _ = std::fs::rename(path, path.with_extension("json.migrated"));
        }
    }
}

impl AppState {
    pub fn initialize(workspace: Workspace) -> Result<Self, String> {
        workspace.ensure().map_err(|e| {
            format!(
                "Failed to create the workspace at {}: {e}",
                workspace.root().display()
            )
        })?;
        let paths = DataPaths::new(&workspace);

        let mut flashcards = SpacedRepetitionEngine::load(paths.flashcards.clone());
        migrate_card_qualities(&mut flashcards, &paths.legacy_card_qualities);

        let mut ai_router = AIRouter::new();
        ai_router.load_from_disk(&paths.providers);

        let analytics = Analytics::new(paths.analytics_dir.clone());

        Ok(Self {
            workspace,
            paths,
            ai_router: Mutex::new(ai_router),
            flashcards: Mutex::new(flashcards),
            analytics,
            generations: Generations::default(),
        })
    }

    pub fn reload(&self) -> Result<(), String> {
        {
            let mut engine = self.flashcards.lock().map_err(lock_error)?;
            engine.reload();
            migrate_card_qualities(&mut engine, &self.paths.legacy_card_qualities);
        }
        let mut router = self.ai_router.lock().map_err(lock_error)?;
        *router = AIRouter::new();
        router.load_from_disk(&self.paths.providers);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancels_only_the_requested_generation() {
        let generations = Generations::default();
        let first = generations.begin("a");
        let second = generations.begin("b");
        generations.cancel(Some("a"));
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
        generations.cancel(None);
        assert!(second.is_cancelled());
    }

    #[test]
    fn remembers_cancellation_requested_before_start() {
        let generations = Generations::default();
        generations.cancel(Some("early"));
        let guard = generations.begin("early");
        assert!(guard.is_cancelled());
        drop(guard);
        assert!(!generations.begin("early").is_cancelled());
    }
}
