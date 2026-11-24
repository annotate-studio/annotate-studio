use tauri::State;

use crate::filesystem::{describe, StudyFile};
use crate::revisions::RevisionEntry;
use crate::state::{lock_error, AppState};
use crate::storage::write_atomic;

#[tauri::command(async)]
pub fn list_file_revisions(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<RevisionEntry>, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let rel = state
        .workspace
        .relative(&full)
        .ok_or_else(|| format!("Invalid path: {path}"))?;
    let store = state.revisions.lock().map_err(lock_error)?;
    Ok(store.list(&rel))
}

#[tauri::command(async)]
pub fn read_file_revision_text(
    state: State<'_, AppState>,
    path: String,
    revision_id: String,
) -> Result<String, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let rel = state
        .workspace
        .relative(&full)
        .ok_or_else(|| format!("Invalid path: {path}"))?;
    let store = state.revisions.lock().map_err(lock_error)?;
    let bytes = store.read(&rel, &revision_id)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command(async)]
pub fn record_file_revision(
    state: State<'_, AppState>,
    path: String,
    source: Option<String>,
    summary: Option<String>,
) -> Result<Option<RevisionEntry>, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let rel = state
        .workspace
        .relative(&full)
        .ok_or_else(|| format!("Invalid path: {path}"))?;
    let bytes = std::fs::read(&full).map_err(|e| format!("Could not read {path}: {e}"))?;
    let mut store = state.revisions.lock().map_err(lock_error)?;
    store.record(&rel, &bytes, source.as_deref().unwrap_or("manual"), summary)
}

#[tauri::command(async)]
pub fn restore_file_revision(
    state: State<'_, AppState>,
    path: String,
    revision_id: String,
) -> Result<StudyFile, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let rel = state
        .workspace
        .relative(&full)
        .ok_or_else(|| format!("Invalid path: {path}"))?;
    let bytes = {
        let mut store = state.revisions.lock().map_err(lock_error)?;
        if let Ok(current) = std::fs::read(&full) {
            let _ = store.record(&rel, &current, "pre-restore", Some("Before restore".into()));
        }
        let target = store.read(&rel, &revision_id)?;
        let _ = store.record(&rel, &target, "restore", Some("Restored revision".into()));
        target
    };
    write_atomic(&full, &bytes)?;
    describe(&state.workspace, &full)
        .ok_or_else(|| format!("Could not read file information for {}", full.display()))
}
