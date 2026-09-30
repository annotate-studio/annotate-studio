use serde::Serialize;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::ai_json::parse_flashcards;
use crate::ai_router::{AIProvider, AIResponse, AIRouter, ChatMessage, ChatOptions, ProviderInfo};
use crate::spaced_repetition::Flashcard;
use crate::state::{lock_error, AppState};
use crate::text::{chunk_text, looks_binary, preview, text_from_file};

const FLASHCARD_CHUNK_CHARS: usize = 12_000;

const FLASHCARD_SYSTEM_PROMPT: &str = "You are a flashcard generator for spaced-repetition study. Turn the study material into high-quality question and answer flashcards.

Output rules:
- Respond with only a JSON array. No prose before or after it and no markdown code fences.
- Every item is an object with exactly two string keys: \"front\" (a focused question, term or prompt) and \"back\" (a concise, self-contained answer).
- Create one card per distinct concept, definition, fact, formula or relationship. For a list of words, create one card per word.
- Keep answers short (one to three sentences) and preserve key terms, numbers, units and formulas exactly. Write math in LaTeX between $ signs.
- Write the cards in the language of the material unless the instructions ask for another language.
- Follow any extra instructions from the user, such as the number of cards or the focus.
- If there is no usable study material, return [].";

#[derive(Clone, Serialize)]
struct GenerationProgress {
    request_id: String,
    current: usize,
    total: usize,
    preview: String,
    generated: usize,
}

async fn cancellable<T>(flag: &AtomicBool, future: impl Future<Output = T>) -> Option<T> {
    tokio::pin!(future);
    loop {
        if flag.load(Ordering::SeqCst) {
            return None;
        }
        tokio::select! {
            output = &mut future => return Some(output),
            _ = tokio::time::sleep(Duration::from_millis(150)) => {}
        }
    }
}

fn router_snapshot(state: &AppState) -> Result<AIRouter, String> {
    Ok(state.ai_router.lock().map_err(lock_error)?.clone())
}

fn save_router(state: &AppState, router: &AIRouter) -> Result<(), String> {
    router.save_to_disk(&state.paths.providers)
}

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    messages: Vec<ChatMessage>,
    model: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<AIResponse, String> {
    let router = router_snapshot(&state)?;
    let defaults = ChatOptions::default();
    let options = ChatOptions {
        temperature: temperature.or(defaults.temperature),
        max_tokens: max_tokens.unwrap_or(defaults.max_tokens).clamp(256, 32_000),
    };
    router.chat(&messages, model.as_deref(), options).await
}

async fn request_cards(
    router: &AIRouter,
    chunk: &str,
    part: (usize, usize),
    source_file: Option<&str>,
    instructions: Option<&str>,
    model: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let mut user = String::new();
    if let Some(instructions) = instructions.map(str::trim).filter(|i| !i.is_empty()) {
        user.push_str("Instructions: ");
        user.push_str(instructions);
        user.push_str("\n\n");
    }
    user.push_str("Study material");
    if let Some(source) = source_file {
        user.push_str(&format!(" from \"{source}\""));
    }
    if part.1 > 1 {
        user.push_str(&format!(" (part {} of {})", part.0, part.1));
    }
    user.push_str(":\n\n");
    user.push_str(chunk);

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: FLASHCARD_SYSTEM_PROMPT.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: user,
        },
    ];
    let response = router
        .chat(
            &messages,
            model,
            ChatOptions {
                temperature: Some(0.3),
                max_tokens: 8192,
            },
        )
        .await?;
    parse_flashcards(&response.content)
}

pub struct GenerationRequest {
    pub source_file: Option<String>,
    pub collection_id: Option<String>,
    pub model: Option<String>,
    pub instructions: Option<String>,
    pub request_id: Option<String>,
}

async fn generate_from_text(
    app: &AppHandle,
    state: &AppState,
    text: &str,
    request: GenerationRequest,
) -> Result<Vec<Flashcard>, String> {
    let GenerationRequest {
        source_file,
        collection_id,
        model,
        instructions,
        request_id,
    } = request;
    let request_id = request_id
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let generation = state.generations.begin(&request_id);
    let trimmed = text.trim();
    let has_instructions = instructions
        .as_deref()
        .is_some_and(|i| !i.trim().is_empty());
    if trimmed.is_empty() && !has_instructions {
        return Err(
            "There is no content to turn into flashcards. Paste study material or pick a document."
                .into(),
        );
    }
    if looks_binary(trimmed) {
        return Err("The content looks like binary or garbled data. Use a text-based document or paste readable text.".into());
    }
    let router = router_snapshot(state)?;
    let collection_id = collection_id
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty());
    let chunks = if trimmed.is_empty() {
        vec![String::new()]
    } else {
        chunk_text(trimmed, FLASHCARD_CHUNK_CHARS)
    };
    let total = chunks.len();

    let mut cards: Vec<Flashcard> = Vec::new();
    let mut last_error: Option<String> = None;
    for (index, chunk) in chunks.iter().enumerate() {
        if generation.is_cancelled() {
            break;
        }
        let _ = app.emit(
            "flashcard-generation-progress",
            GenerationProgress {
                request_id: generation.id().to_string(),
                current: index + 1,
                total,
                preview: preview(chunk, 80),
                generated: cards.len(),
            },
        );
        let result = cancellable(
            generation.flag(),
            request_cards(
                &router,
                chunk,
                (index + 1, total),
                source_file.as_deref(),
                instructions.as_deref(),
                model.as_deref(),
            ),
        )
        .await;
        match result {
            None => break,
            Some(Ok(pairs)) => cards.extend(pairs.into_iter().map(|(front, back)| {
                Flashcard::new(front, back, source_file.clone(), collection_id.clone())
            })),
            Some(Err(err)) => last_error = Some(err),
        }
    }
    let cancelled = generation.is_cancelled();

    if cards.is_empty() {
        if cancelled {
            return Err("Flashcard generation was stopped.".into());
        }
        return Err(last_error.unwrap_or_else(|| {
            "The AI did not return any flashcards. Try different content.".into()
        }));
    }
    let mut engine = state.flashcards.lock().map_err(lock_error)?;
    engine.add_cards(cards.clone())?;
    Ok(cards)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn generate_flashcards(
    app: AppHandle,
    state: State<'_, AppState>,
    content: String,
    source_file: Option<String>,
    collection_id: Option<String>,
    model: Option<String>,
    instructions: Option<String>,
    request_id: Option<String>,
) -> Result<Vec<Flashcard>, String> {
    generate_from_text(
        &app,
        &state,
        &content,
        GenerationRequest {
            source_file,
            collection_id,
            model,
            instructions,
            request_id,
        },
    )
    .await
}

#[tauri::command]
pub async fn generate_flashcards_from_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    collection_id: Option<String>,
    model: Option<String>,
    instructions: Option<String>,
    request_id: Option<String>,
) -> Result<Vec<Flashcard>, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let bytes = std::fs::read(&full).map_err(|e| format!("Could not read {path}: {e}"))?;
    let text = text_from_file(&full, &bytes).ok_or_else(|| {
        format!("{path} has no extractable text. Scanned documents and images are not supported.")
    })?;
    let source = full
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or(path);
    generate_from_text(
        &app,
        &state,
        &text,
        GenerationRequest {
            source_file: Some(source),
            collection_id,
            model,
            instructions,
            request_id,
        },
    )
    .await
}

#[tauri::command]
pub fn cancel_generation(state: State<'_, AppState>, request_id: Option<String>) {
    state.generations.cancel(request_id.as_deref());
}

#[tauri::command(async)]
pub fn get_ai_providers(state: State<'_, AppState>) -> Result<Vec<ProviderInfo>, String> {
    Ok(state.ai_router.lock().map_err(lock_error)?.infos())
}

#[tauri::command(async)]
pub fn add_ai_provider(
    state: State<'_, AppState>,
    provider_type: String,
    api_key: Option<String>,
    endpoint: Option<String>,
    model: Option<String>,
    make_default: Option<bool>,
) -> Result<Vec<ProviderInfo>, String> {
    let provider = AIProvider::from_config(&provider_type, api_key, endpoint, model)?;
    let model_name = provider.model_name().to_string();
    let mut router = state.ai_router.lock().map_err(lock_error)?;
    router.add_provider(provider);
    if make_default.unwrap_or(false) {
        router.set_default(&provider_type, Some(&model_name));
    }
    save_router(&state, &router)?;
    Ok(router.infos())
}

#[tauri::command(async)]
pub fn remove_ai_provider(
    state: State<'_, AppState>,
    provider_type: String,
    model: Option<String>,
) -> Result<Vec<ProviderInfo>, String> {
    let mut router = state.ai_router.lock().map_err(lock_error)?;
    router.remove(&provider_type, model.as_deref());
    save_router(&state, &router)?;
    Ok(router.infos())
}

#[tauri::command(async)]
pub fn set_default_ai_provider(
    state: State<'_, AppState>,
    provider_type: String,
    model: Option<String>,
) -> Result<Vec<ProviderInfo>, String> {
    let mut router = state.ai_router.lock().map_err(lock_error)?;
    router.set_default(&provider_type, model.as_deref());
    save_router(&state, &router)?;
    Ok(router.infos())
}

#[tauri::command]
pub async fn test_ai_provider(
    state: State<'_, AppState>,
    model: Option<String>,
) -> Result<AIResponse, String> {
    let router = router_snapshot(&state)?;
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: "Reply with exactly: Hello from Annotate Studio".into(),
    }];
    router
        .chat(
            &messages,
            model.as_deref(),
            ChatOptions {
                temperature: Some(0.0),
                max_tokens: 256,
            },
        )
        .await
}

#[tauri::command]
pub async fn check_ollama(endpoint: Option<String>) -> Result<bool, String> {
    let base = endpoint
        .map(|e| e.trim().trim_end_matches('/').to_string())
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| "http://localhost:11434".into());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(client
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false))
}
