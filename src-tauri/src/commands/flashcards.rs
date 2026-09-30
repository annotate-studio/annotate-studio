use chrono::Utc;
use tauri::State;

use crate::spaced_repetition::{Flashcard, RepetitionStats, ReviewQuality};
use crate::state::{lock_error, AppState};
use crate::text::preview;

fn clean(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("The {label} of a flashcard cannot be empty"))
    } else {
        Ok(trimmed.to_string())
    }
}

fn normalize_collection(collection_id: Option<String>) -> Option<String> {
    collection_id
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
}

#[tauri::command(async)]
pub fn get_flashcards(state: State<'_, AppState>) -> Result<Vec<Flashcard>, String> {
    let engine = state.flashcards.lock().map_err(lock_error)?;
    Ok(engine.cards().to_vec())
}

#[tauri::command(async)]
pub fn get_flashcard_stats(state: State<'_, AppState>) -> Result<RepetitionStats, String> {
    let engine = state.flashcards.lock().map_err(lock_error)?;
    Ok(engine.stats(Utc::now()))
}

#[tauri::command(async)]
pub fn count_due_flashcards(state: State<'_, AppState>) -> Result<usize, String> {
    let engine = state.flashcards.lock().map_err(lock_error)?;
    Ok(engine.due_count(Utc::now()))
}

#[tauri::command(async)]
pub fn create_flashcard(
    state: State<'_, AppState>,
    front: String,
    back: String,
    collection_id: Option<String>,
    source_file: Option<String>,
) -> Result<Flashcard, String> {
    let card = Flashcard::new(
        clean(&front, "question")?,
        clean(&back, "answer")?,
        source_file,
        normalize_collection(collection_id),
    );
    let mut engine = state.flashcards.lock().map_err(lock_error)?;
    engine.add_cards(vec![card.clone()])?;
    Ok(card)
}

#[tauri::command(async)]
pub fn update_flashcard(
    state: State<'_, AppState>,
    id: String,
    front: String,
    back: String,
    collection_id: Option<String>,
) -> Result<Flashcard, String> {
    let mut engine = state.flashcards.lock().map_err(lock_error)?;
    engine.update_content(
        &id,
        clean(&front, "question")?,
        clean(&back, "answer")?,
        Some(normalize_collection(collection_id)),
    )
}

#[tauri::command(async)]
pub fn review_flashcard(
    state: State<'_, AppState>,
    card_id: String,
    quality: ReviewQuality,
) -> Result<Flashcard, String> {
    let card = {
        let mut engine = state.flashcards.lock().map_err(lock_error)?;
        engine.review(&card_id, quality, Utc::now())?
    };
    let _ = state.analytics.log(
        "flashcard_review",
        &preview(&card.front, 80),
        0,
        Some(format!("{quality:?}")),
    );
    Ok(card)
}

#[tauri::command(async)]
pub fn delete_flashcard(state: State<'_, AppState>, card_id: String) -> Result<bool, String> {
    let mut engine = state.flashcards.lock().map_err(lock_error)?;
    engine.remove(&card_id)
}

#[tauri::command(async)]
pub fn delete_flashcards_by_collection(
    state: State<'_, AppState>,
    collection_id: String,
) -> Result<usize, String> {
    let mut engine = state.flashcards.lock().map_err(lock_error)?;
    engine.remove_collection(&collection_id)
}

#[tauri::command(async)]
pub fn reset_flashcards(
    state: State<'_, AppState>,
    collection_id: Option<String>,
    period_days: Option<f64>,
) -> Result<usize, String> {
    let mut engine = state.flashcards.lock().map_err(lock_error)?;
    engine.reset(
        normalize_collection(collection_id).as_deref(),
        period_days,
        Utc::now(),
    )
}
