use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::analytics::StudyStats;
use crate::state::AppState;
use crate::storage::{read_json, read_json_or_default, write_json};

#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> String {
    state.workspace.root().to_string_lossy().into_owned()
}

#[tauri::command(async)]
pub fn load_canvas_state(state: State<'_, AppState>) -> Result<Value, String> {
    Ok(read_json(&state.paths.canvas_state).unwrap_or(Value::Null))
}

#[tauri::command(async)]
pub fn save_canvas_state(state: State<'_, AppState>, canvas: Value) -> Result<(), String> {
    if !canvas.is_object() {
        return Err("Canvas state must be an object".into());
    }
    write_json(&state.paths.canvas_state, &canvas)
}

#[tauri::command(async)]
pub fn load_settings(state: State<'_, AppState>) -> Result<Value, String> {
    if let Some(settings) = read_json::<Value>(&state.paths.settings).filter(Value::is_object) {
        return Ok(settings);
    }
    let legacy = read_json::<Value>(&state.paths.canvas_state)
        .and_then(|canvas| canvas.get("settings").cloned())
        .filter(Value::is_object);
    Ok(legacy.unwrap_or(Value::Null))
}

#[tauri::command(async)]
pub fn save_settings(state: State<'_, AppState>, settings: Value) -> Result<(), String> {
    if !settings.is_object() {
        return Err("Settings must be an object".into());
    }
    write_json(&state.paths.settings, &settings)
}

#[tauri::command(async)]
pub fn load_exams(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    Ok(read_json_or_default(&state.paths.exams))
}

#[tauri::command(async)]
pub fn save_exams(state: State<'_, AppState>, exams: Vec<Value>) -> Result<(), String> {
    write_json(&state.paths.exams, &exams)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectionEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default = "default_review_period")]
    pub review_period_days: f64,
}

fn default_review_period() -> f64 {
    1.0
}

#[tauri::command(async)]
pub fn load_collections(state: State<'_, AppState>) -> Result<Vec<CollectionEntry>, String> {
    Ok(read_json_or_default(&state.paths.collections))
}

#[tauri::command(async)]
pub fn save_collections(
    state: State<'_, AppState>,
    collections: Vec<CollectionEntry>,
) -> Result<(), String> {
    write_json(&state.paths.collections, &collections)
}

#[tauri::command(async)]
pub fn load_chat_sessions(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    Ok(read_json_or_default(&state.paths.chat_sessions))
}

#[tauri::command(async)]
pub fn save_chat_sessions(state: State<'_, AppState>, sessions: Vec<Value>) -> Result<(), String> {
    write_json(&state.paths.chat_sessions, &sessions)
}

#[tauri::command(async)]
pub fn load_motivation_sessions(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    Ok(read_json_or_default(&state.paths.motivation_sessions))
}

#[tauri::command(async)]
pub fn save_motivation_sessions(
    state: State<'_, AppState>,
    sessions: Vec<Value>,
) -> Result<(), String> {
    write_json(&state.paths.motivation_sessions, &sessions)
}

#[tauri::command(async)]
pub fn log_study_activity(
    state: State<'_, AppState>,
    activity_type: String,
    label: String,
    duration_seconds: u64,
    metadata: Option<String>,
) -> Result<(), String> {
    state
        .analytics
        .log(&activity_type, &label, duration_seconds, metadata)
}

#[tauri::command(async)]
pub fn get_study_stats(state: State<'_, AppState>) -> Result<StudyStats, String> {
    state.analytics.stats()
}
