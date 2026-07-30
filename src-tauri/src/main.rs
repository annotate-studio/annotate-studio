#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

use scholar_os_lib::ai_router::{AIRequest, AIResponse, AIRouter, AIProvider, ChatMessage, TaskType};
use scholar_os_lib::filesystem::{FileSystem, StudyFile};
use scholar_os_lib::spaced_repetition::{Flashcard, RepetitionStats, ReviewQuality, SpacedRepetitionEngine};
use scholar_os_lib::vector_db::{DocumentChunk, VectorDB};

mod analytics;
use analytics::{Analytics, ExamResult, StudyActivity, StudyStats};

struct AppState {
    file_system: Mutex<FileSystem>,
    ai_router: Mutex<AIRouter>,
    spaced_rep: Mutex<SpacedRepetitionEngine>,
    vector_db: Mutex<VectorDB>,
    analytics: Mutex<Analytics>,
    recent_docs: Mutex<Vec<StudyFile>>,
    exams_data_path: Mutex<String>,
    providers_path: Mutex<String>,
    collections_path: Mutex<String>,
    canvas_state_path: Mutex<String>,
    chat_sessions_path: Mutex<String>,
    motivation_sessions_path: Mutex<String>,
}

// ── Utilities ────────────────────────────────────────────────────────

fn load_json<T: serde::de::DeserializeOwned>(path: &str) -> Vec<T> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_json<T: serde::Serialize>(path: &str, data: &[T]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

// ── File System Commands ────────────────────────────────────────────

#[tauri::command]
fn get_workspace_files(state: State<AppState>, directory: Option<String>) -> Result<Vec<StudyFile>, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    let dir = directory.unwrap_or_else(|| "documents".into());
    fs.list_files(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_files(state: State<AppState>) -> Result<Vec<StudyFile>, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    fs.list_all_files().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(state: State<AppState>, name: String, content: String, directory: Option<String>) -> Result<String, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    let dir = directory.unwrap_or_else(|| "notes".into());
    let path = fs
        .save_file(content.as_bytes(), &format!("{}/{}", dir, name))
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file(state: State<AppState>, relative_path: String) -> Result<String, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    fs.read_file_text(&relative_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(state: State<AppState>, relative_path: String) -> Result<(), String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    fs.delete_file(&relative_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(state: State<AppState>, name: String, content: String) -> Result<String, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    let safe_name = if name.ends_with(".md") { name } else { format!("{}.md", name) };
    let path = fs
        .save_file(content.as_bytes(), &format!("notes/{}", safe_name))
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_note(state: State<AppState>, name: String) -> Result<String, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    let safe_name = if name.ends_with(".md") { name } else { format!("{}.md", name) };
    fs.read_file_text(&format!("notes/{}", safe_name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_workspace_file(state: State<AppState>, relative_path: String) -> Result<(), String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    fs.delete_file(&relative_path).map_err(|e| e.to_string())?;
    let mut recent = state.recent_docs.lock().map_err(|e| e.to_string())?;
    recent.retain(|d| !d.path.ends_with(&relative_path));
    Ok(())
}

#[tauri::command]
fn save_file_binary(state: State<AppState>, name: String, base64_content: String, directory: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(|e| e.to_string())?;
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    let path = fs.save_file(&bytes, &format!("{}/{}", directory, name)).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file_base64(state: State<AppState>, relative_path: String) -> Result<String, String> {
    let fs = state.file_system.lock().map_err(|e| e.to_string())?;
    let bytes = fs.read_file(&relative_path).map_err(|e| e.to_string())?;
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes))
}

#[tauri::command]
fn save_canvas_state(state: State<AppState>, json: String) -> Result<(), String> {
    let path = state.canvas_state_path.lock().map_err(|e| e.to_string())?.clone();
    std::fs::write(&path, &json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_canvas_state(state: State<AppState>) -> Result<String, String> {
    let path = state.canvas_state_path.lock().map_err(|e| e.to_string())?.clone();
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ── AI Commands ─────────────────────────────────────────────────────

#[tauri::command]
async fn ai_chat(
    state: State<'_, AppState>,
    messages: Vec<ChatMessage>,
    task_type: TaskType,
    context: Option<String>,
) -> Result<AIResponse, String> {
    let router = state.ai_router.lock().map_err(|e| e.to_string())?.clone();
    router
        .route(&AIRequest { messages, context, task_type })
        .await
}

#[tauri::command]
async fn ai_explain(
    state: State<'_, AppState>,
    content: String,
    subject: Option<String>,
) -> Result<AIResponse, String> {
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: "You are an expert tutor. Explain the following content clearly and concisely. Break it into logical steps. Use analogies when helpful. If the content involves math, use LaTeX notation.".into(),
    }];
    if let Some(subj) = subject {
        messages.push(ChatMessage {
            role: "user".into(),
            content: format!("Subject context: {}\n\nContent to explain:\n{}", subj, content),
        });
    } else {
        messages.push(ChatMessage {
            role: "user".into(),
            content: format!("Explain this:\n{}", content),
        });
    }
    let router = state.ai_router.lock().map_err(|e| e.to_string())?.clone();
    router.route(&AIRequest { messages, context: None, task_type: TaskType::Explain }).await
}

/// Recursively collect all objects that look like flashcards
/// (have `front`/`back` or `question`/`answer` keys).
fn collect_flashcard_values(val: &serde_json::Value, results: &mut Vec<serde_json::Value>) {
    match val {
        serde_json::Value::Object(map) => {
            let has_front = map.contains_key("front") || map.contains_key("question");
            let has_back = map.contains_key("back") || map.contains_key("answer");
            if has_front && has_back {
                results.push(val.clone());
                return;
            }
            for v in map.values() {
                collect_flashcard_values(v, results);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                collect_flashcard_values(v, results);
            }
        }
        serde_json::Value::String(s) => {
            if let Ok(inner) = serde_json::from_str(s) {
                collect_flashcard_values(&inner, results);
            }
        }
        _ => {}
    }
}

/// Parse AI response and extract ALL flashcard objects.
fn parse_flashcards_json(raw: &str) -> Result<Vec<serde_json::Value>, String> {
    let trimmed = raw.trim();

    // Strategy 1: Direct parse
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        let mut found = Vec::new();
        collect_flashcard_values(&v, &mut found);
        if !found.is_empty() { return Ok(found); }
    }

    // Strategy 2: Strip markdown fences
    let stripped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|s| s.strip_suffix("```"))
        .map(|s| s.trim())
        .unwrap_or(trimmed);
    if stripped != trimmed {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(stripped) {
            let mut found = Vec::new();
            collect_flashcard_values(&v, &mut found);
            if !found.is_empty() { return Ok(found); }
        }
    }

    // Strategy 3: Brace-matching scan — find each top-level {…} block
    let mut found = Vec::new();
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if bytes[i] == b'{' {
            let mut depth = 0u32;
            let mut j = i;
            let mut in_str = false;
            let mut escaped = false;
            while j < raw.len() {
                let ch = bytes[j];
                if escaped { escaped = false; }
                else if ch == b'\\' && in_str { escaped = true; }
                else if ch == b'"' { in_str = !in_str; }
                else if !in_str {
                    if ch == b'{' { depth += 1; }
                    else if ch == b'}' {
                        depth -= 1;
                        if depth == 0 {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw[i..=j]) {
                                collect_flashcard_values(&v, &mut found);
                            }
                            i = j;
                            break;
                        }
                    }
                }
                j += 1;
            }
        }
        i += 1;
    }
    if !found.is_empty() { return Ok(found); }

    // Strategy 4: Try unescaping JSON-as-string
    if raw.contains("\\\"") {
        if let Ok(unquoted) = serde_json::from_str::<String>(trimmed) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&unquoted) {
                let mut found2 = Vec::new();
                collect_flashcard_values(&v, &mut found2);
                if !found2.is_empty() { return Ok(found2); }
            }
        }
    }

    Err(format!("No flashcard JSON found. Response (first 300 chars): {}", &raw[..raw.len().min(300)]))
}

#[tauri::command]
async fn generate_flashcard(
    state: State<'_, AppState>,
    content: String,
    source_file: Option<String>,
    collection_id: Option<String>,
) -> Result<Vec<Flashcard>, String> {
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: "You are a flashcard generator. Create one or more Q&A flashcards from the user's content.

Return a JSON array (list) of objects. Each object must have these exact keys:
- \"front\": a question or term label (e.g., \"What does 'avaricious' mean?\")
- \"back\": the answer or translation (e.g., \"حریص\")

Example for 3 items:
[{\"front\":\"What does 'avaricious' mean?\",\"back\":\"حریص\"},{\"front\":\"What does 'parsimonious' mean?\",\"back\":\"خسیس\"},{\"front\":\"What does 'abject' mean?\",\"back\":\"ذلیل\"}]

Rules:
- Return a JSON array with one entry per item the user provides.
- If the user gives a list of words, make one flashcard per word.
- The front should be the question/prompt in English, back is the answer/translation.
- Use valid UTF-8 for non-English text.
- No markdown, no backticks, no extra text outside the JSON array.".into(),
    }];
    messages.push(ChatMessage {
        role: "user".into(),
        content: format!("Create flashcards from this content:{}\n\n{}",
            source_file.as_ref().map(|f| format!(" (from {})", f)).unwrap_or_default(), content),
    });
    let router = state.ai_router.lock().map_err(|e| e.to_string())?.clone();
    let response = router.route(&AIRequest { messages, context: source_file.clone(), task_type: TaskType::GenerateFlashcard }).await?;

    let parsed_list = parse_flashcards_json(&response.content).map_err(|e| {
        format!("Failed to parse flashcards from AI response ({}). Raw: {}", e, &response.content[..response.content.len().min(300)])
    })?;

    let mut cards = Vec::new();
    for parsed in &parsed_list {
        let front = parsed["front"].as_str().or_else(|| parsed["question"].as_str()).unwrap_or("Untitled question").to_string();
        let back = parsed["back"].as_str().or_else(|| parsed["answer"].as_str()).unwrap_or("No answer provided").to_string();
        let mut card = Flashcard::new(front, back, source_file.clone(), None);
        card.collection_id = collection_id.clone();
        cards.push(card);
    }

    let mut engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    for card in &cards {
        engine.add_card(card.clone());
    }
    Ok(cards)
}

// ── Spaced Repetition Commands ──────────────────────────────────────

#[tauri::command]
fn save_flashcard(state: State<AppState>, card: Flashcard) -> Result<(), String> {
    let mut engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    engine.add_card(card);
    Ok(())
}

#[tauri::command]
fn get_due_cards(state: State<AppState>) -> Result<Vec<Flashcard>, String> {
    let engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    Ok(engine.due_cards().into_iter().cloned().collect())
}

#[tauri::command]
fn get_all_flashcards(state: State<AppState>) -> Result<Vec<Flashcard>, String> {
    let engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    Ok(engine.all_cards().to_vec())
}

#[tauri::command]
fn review_flashcard(
    state: State<AppState>,
    card_id: String,
    quality: ReviewQuality,
) -> Result<Flashcard, String> {
    let mut engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    let card = engine.get_card_mut(&card_id).ok_or("Card not found")?;
    card.review(&quality);
    let cloned = card.clone();
    engine.save();
    Ok(cloned)
}

#[tauri::command]
fn delete_flashcard(state: State<AppState>, card_id: String) -> Result<(), String> {
    let mut engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    engine.remove_card(&card_id).then_some(()).ok_or("Card not found".into())
}

#[tauri::command]
fn delete_flashcards_by_collection(state: State<AppState>, collection_id: String) -> Result<usize, String> {
    let mut engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    Ok(engine.remove_cards_by_collection(&collection_id))
}

#[tauri::command]
fn get_flashcard_stats(state: State<AppState>) -> Result<RepetitionStats, String> {
    let engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    Ok(engine.stats())
}

#[tauri::command]
fn restore_all_flashcards(state: State<AppState>, period_days: Option<f64>) -> Result<(), String> {
    let mut engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    engine.restore_all(period_days);
    Ok(())
}

#[tauri::command]
fn get_cards_by_filter(
    state: State<AppState>,
    due: bool,
    new_cards: bool,
    young: bool,
    mature: bool,
) -> Result<Vec<Flashcard>, String> {
    let engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    Ok(engine.cards_by_filter(due, new_cards, young, mature).into_iter().cloned().collect())
}

#[tauri::command]
fn check_due_flashcards(state: State<AppState>) -> Result<usize, String> {
    let engine = state.spaced_rep.lock().map_err(|e| e.to_string())?;
    Ok(engine.due_count())
}

// ── Vector DB Commands ──────────────────────────────────────────────

#[tauri::command]
fn index_document(state: State<AppState>, content: String, source_file: String) -> Result<usize, String> {
    let db = state.vector_db.lock().map_err(|e| e.to_string())?;
    let chunk_size = 500;
    let chunks: Vec<&str> = content.as_bytes().chunks(chunk_size).filter_map(|c| std::str::from_utf8(c).ok()).collect();
    let mut count = 0;
    for (i, chunk) in chunks.iter().enumerate() {
        db.insert_chunk(chunk, &source_file, Some((i / 10) as u32)).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
fn search_documents(state: State<AppState>, query: String, limit: Option<usize>) -> Result<Vec<DocumentChunk>, String> {
    let db = state.vector_db.lock().map_err(|e| e.to_string())?;
    db.search(&query, limit.unwrap_or(5)).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_index_stats(state: State<AppState>) -> Result<usize, String> {
    let db = state.vector_db.lock().map_err(|e| e.to_string())?;
    db.count().map_err(|e| e.to_string())
}

// ── AI Provider Management ──────────────────────────────────────────

fn save_providers_disk(router: &AIRouter, path: &str) {
    let p = std::path::Path::new(path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    router.save_to_disk(p).ok();
}

#[tauri::command]
fn add_ai_provider(
    state: State<AppState>,
    provider_type: String,
    api_key: Option<String>,
    endpoint: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    let mut router = state.ai_router.lock().map_err(|e| e.to_string())?;
    let provider_path = state.providers_path.lock().map_err(|e| e.to_string())?;
    let provider = match provider_type.as_str() {
        "openai" => AIProvider::OpenAI {
            api_key: api_key.ok_or("API key required for OpenAI")?,
            model: model.unwrap_or_else(|| "gpt-4o".into()),
        },
        "anthropic" => AIProvider::Anthropic {
            api_key: api_key.ok_or("API key required for Anthropic")?,
            model: model.unwrap_or_else(|| "claude-sonnet-4-20250514".into()),
        },
        "ollama" => AIProvider::Ollama {
            endpoint: endpoint.unwrap_or_else(|| "http://localhost:11434".into()),
            model: model.unwrap_or_else(|| "llama3".into()),
        },
        "deepseek" => AIProvider::DeepSeek {
            api_key: api_key.ok_or("API key required for DeepSeek")?,
            model: model.unwrap_or_else(|| "deepseek-chat".into()),
        },
        "openrouter" => AIProvider::OpenRouter {
            api_key: api_key.ok_or("API key required for OpenRouter")?,
            endpoint: endpoint.unwrap_or_else(|| "https://openrouter.ai/api/v1".into()),
            model: model.unwrap_or_else(|| "openrouter/auto".into()),
        },
        "groq" => AIProvider::Groq {
            api_key: api_key.ok_or("API key required for Groq")?,
            model: model.unwrap_or_else(|| "llama-3.3-70b-versatile".into()),
        },
        "google-gemini" => AIProvider::GoogleGemini {
            api_key: api_key.ok_or("API key required for Google Gemini")?,
            model: model.unwrap_or_else(|| "gemini-2.0-flash".into()),
        },
        "mistral" => AIProvider::Mistral {
            api_key: api_key.ok_or("API key required for Mistral")?,
            model: model.unwrap_or_else(|| "mistral-large-latest".into()),
        },
        "together" => AIProvider::Together {
            api_key: api_key.ok_or("API key required for Together AI")?,
            model: model.unwrap_or_else(|| "mistralai/Mixtral-8x22B-Instruct-v0.1".into()),
        },
        "xai" => AIProvider::XAI {
            api_key: api_key.ok_or("API key required for xAI")?,
            model: model.unwrap_or_else(|| "grok-2-latest".into()),
        },
        "perplexity" => AIProvider::Perplexity {
            api_key: api_key.ok_or("API key required for Perplexity")?,
            model: model.unwrap_or_else(|| "sonar-pro".into()),
        },
        "cohere" => AIProvider::Cohere {
            api_key: api_key.ok_or("API key required for Cohere")?,
            model: model.unwrap_or_else(|| "command-r-plus".into()),
        },
        _ => return Err(format!("Unknown provider type: {}", provider_type)),
    };
    router.add_provider(provider);
    save_providers_disk(&router, &provider_path);
    Ok(())
}

#[tauri::command]
fn remove_ai_provider(state: State<AppState>, provider_type: String) -> Result<(), String> {
    let mut router = state.ai_router.lock().map_err(|e| e.to_string())?;
    let provider_path = state.providers_path.lock().map_err(|e| e.to_string())?;
    router.remove_provider(&provider_type);
    save_providers_disk(&router, &provider_path);
    Ok(())
}

#[tauri::command]
fn set_default_ai_provider(state: State<AppState>, provider_type: String) -> Result<(), String> {
    let mut router = state.ai_router.lock().map_err(|e| e.to_string())?;
    let provider_path = state.providers_path.lock().map_err(|e| e.to_string())?;
    router.set_default_provider(&provider_type);
    save_providers_disk(&router, &provider_path);
    Ok(())
}

#[tauri::command]
fn get_ai_providers(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let router = state.ai_router.lock().map_err(|e| e.to_string())?;
    let providers: Vec<serde_json::Value> = router.providers().iter().enumerate().map(|(i, p)| {
        let base = |model: &str| serde_json::json!({ "type": p.type_name(), "model": model, "configured": true, "active": i == 0 });
        match p {
            AIProvider::OpenAI { model, .. } => base(model),
            AIProvider::Anthropic { model, .. } => base(model),
            AIProvider::DeepSeek { model, .. } => base(model),
            AIProvider::Groq { model, .. } => base(model),
            AIProvider::GoogleGemini { model, .. } => base(model),
            AIProvider::Mistral { model, .. } => base(model),
            AIProvider::Together { model, .. } => base(model),
            AIProvider::XAI { model, .. } => base(model),
            AIProvider::Perplexity { model, .. } => base(model),
            AIProvider::Cohere { model, .. } => base(model),
            AIProvider::Ollama { endpoint, model } => {
                serde_json::json!({ "type": p.type_name(), "endpoint": endpoint, "model": model, "configured": true, "active": i == 0 })
            }
            AIProvider::OpenRouter { endpoint, model, .. } => {
                serde_json::json!({ "type": p.type_name(), "endpoint": endpoint, "model": model, "configured": true, "active": i == 0 })
            }
        }
    }).collect();
    Ok(providers)
}

#[tauri::command]
fn test_ai_provider(state: State<AppState>) -> Result<AIResponse, String> {
    let router = state.ai_router.lock().map_err(|e| e.to_string())?.clone();
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(async {
        router.route(&AIRequest {
            messages: vec![ChatMessage { role: "user".into(), content: "Say 'Hello from Annotate Studio' and nothing else.".into() }],
            context: None,
            task_type: TaskType::Custom,
        }).await
    })
}

#[tauri::command]
fn check_ollama() -> Result<serde_json::Value, String> {
    let available = std::net::TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse::<std::net::SocketAddr>().map_err(|e| e.to_string())?,
        std::time::Duration::from_secs(2),
    ).is_ok();
    Ok(serde_json::json!({ "available": available }))
}

// ── Analytics Commands ──────────────────────────────────────────────

#[tauri::command]
fn log_study_activity(state: State<AppState>, activity: StudyActivity) -> Result<(), String> {
    let analytics = state.analytics.lock().map_err(|e| e.to_string())?;
    analytics.log_activity(activity)
}

#[tauri::command]
fn get_study_stats(state: State<AppState>) -> Result<StudyStats, String> {
    let analytics = state.analytics.lock().map_err(|e| e.to_string())?;
    analytics.get_stats()
}

#[tauri::command]
fn get_today_study_minutes(state: State<AppState>) -> Result<u64, String> {
    let analytics = state.analytics.lock().map_err(|e| e.to_string())?;
    analytics.get_today_minutes()
}

#[tauri::command]
fn save_exam_result(state: State<AppState>, exam: ExamResult) -> Result<(), String> {
    let analytics = state.analytics.lock().map_err(|e| e.to_string())?;
    analytics.save_exam(exam)
}

#[tauri::command]
fn get_exam_results(state: State<AppState>) -> Result<Vec<ExamResult>, String> {
    let analytics = state.analytics.lock().map_err(|e| e.to_string())?;
    analytics.get_exams()
}

// ── Exam Persistence (full exam objects) ────────────────────────────

#[tauri::command]
fn save_exam_data(state: State<AppState>, exam_data: serde_json::Value) -> Result<(), String> {
    let path = state.exams_data_path.lock().map_err(|e| e.to_string())?;
    let mut exams: Vec<serde_json::Value> = load_json(&path);
    let id = exam_data["id"].as_str().unwrap_or("").to_string();
    if let Some(pos) = exams.iter().position(|e| e["id"] == id) {
        exams[pos] = exam_data;
    } else {
        exams.push(exam_data);
    }
    save_json(&path, &exams)
}

#[tauri::command]
fn load_exams_data(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let path = state.exams_data_path.lock().map_err(|e| e.to_string())?;
    Ok(load_json(&path))
}

#[tauri::command]
fn delete_exam_data(state: State<AppState>, exam_id: String) -> Result<(), String> {
    let path = state.exams_data_path.lock().map_err(|e| e.to_string())?;
    let exams: Vec<serde_json::Value> = load_json(&path).into_iter().filter(|e: &serde_json::Value| e["id"] != exam_id).collect();
    save_json(&path, &exams)
}

// ── Recent Documents ────────────────────────────────────────────────

#[tauri::command]
fn log_recent_document(state: State<AppState>, doc: StudyFile) -> Result<(), String> {
    let mut recent = state.recent_docs.lock().map_err(|e| e.to_string())?;
    recent.retain(|d| d.id != doc.id);
    recent.insert(0, doc);
    if recent.len() > 50 { recent.truncate(50); }
    Ok(())
}

#[tauri::command]
fn get_recent_documents(state: State<AppState>) -> Result<Vec<StudyFile>, String> {
    let recent = state.recent_docs.lock().map_err(|e| e.to_string())?;
    Ok(recent.clone())
}

// ── Flashcard Collections Persistence ───────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CollectionEntry {
    id: String,
    name: String,
    description: String,
    created_at: String,
    #[serde(default = "default_review_period")]
    review_period_days: i32,
}

fn default_review_period() -> i32 { 1 }

#[tauri::command]
fn save_collections(state: State<AppState>, collections: Vec<CollectionEntry>) -> Result<(), String> {
    let path = state.collections_path.lock().map_err(|e| e.to_string())?;
    save_json(&path, &collections)
}

#[tauri::command]
fn load_collections(state: State<AppState>) -> Result<Vec<CollectionEntry>, String> {
    let path = state.collections_path.lock().map_err(|e| e.to_string())?;
    Ok(load_json(&path))
}

// ── Chat Sessions Persistence ──────────────────────────────────────

#[tauri::command]
fn save_chat_sessions(state: State<AppState>, sessions: Vec<serde_json::Value>) -> Result<(), String> {
    let path = state.chat_sessions_path.lock().map_err(|e| e.to_string())?;
    save_json(&path, &sessions)
}

#[tauri::command]
fn load_chat_sessions(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let path = state.chat_sessions_path.lock().map_err(|e| e.to_string())?;
    Ok(load_json(&path))
}

// ── Motivation Sessions Persistence ─────────────────────────────────

#[tauri::command]
fn save_motivation_sessions(state: State<AppState>, sessions: Vec<serde_json::Value>) -> Result<(), String> {
    let path = state.motivation_sessions_path.lock().map_err(|e| e.to_string())?;
    save_json(&path, &sessions)
}

#[tauri::command]
fn load_motivation_sessions(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let path = state.motivation_sessions_path.lock().map_err(|e| e.to_string())?;
    Ok(load_json(&path))
}

// ── App Entry ───────────────────────────────────────────────────────

fn main() {
    let workspace = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("annotate-studio");

    let fs = FileSystem::new(workspace.clone());
    fs.ensure_workspace().expect("Failed to create workspace directories");

    let db_path = workspace.join("index").join("documents.db");
    let vector_db = VectorDB::new(db_path.to_string_lossy().as_ref())
        .expect("Failed to initialize vector database");

    let analytics = Analytics::new(workspace.join("analytics"));
    let exams_json = workspace.join("exams_data.json");
    let flashcards_json = workspace.join("flashcards.json");

    // Ensure exams file exists
    if !exams_json.exists() {
        std::fs::write(&exams_json, "[]").ok();
    }

    let spaced_rep = SpacedRepetitionEngine::new().with_persistence(flashcards_json);

    // Collections persistence
    let collections_json = workspace.join("collections.json");
    if !collections_json.exists() {
        std::fs::write(&collections_json, "[]").ok();
    }

    // Canvas state persistence
    let canvas_state_path = workspace.join("canvas").join("state.json");
    if !canvas_state_path.exists() {
        std::fs::write(&canvas_state_path, "null").ok();
    }

    // Provider persistence
    let providers_json = workspace.join("providers.json");
    if !providers_json.exists() {
        std::fs::write(&providers_json, "[]").ok();
    }
    let mut ai_router = AIRouter::new();
    ai_router.load_from_disk(&providers_json);

    // Chat sessions persistence
    let chat_sessions_json = workspace.join("chat_sessions.json");
    if !chat_sessions_json.exists() {
        std::fs::write(&chat_sessions_json, "[]").ok();
    }

    // Motivation sessions persistence
    let motivation_sessions_json = workspace.join("motivation_sessions.json");
    if !motivation_sessions_json.exists() {
        std::fs::write(&motivation_sessions_json, "[]").ok();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            file_system: Mutex::new(fs),
            ai_router: Mutex::new(ai_router),
            spaced_rep: Mutex::new(spaced_rep),
            vector_db: Mutex::new(vector_db),
            analytics: Mutex::new(analytics),
            recent_docs: Mutex::new(Vec::new()),
            exams_data_path: Mutex::new(exams_json.to_string_lossy().to_string()),
            providers_path: Mutex::new(providers_json.to_string_lossy().to_string()),
            collections_path: Mutex::new(collections_json.to_string_lossy().to_string()),
            canvas_state_path: Mutex::new(canvas_state_path.to_string_lossy().to_string()),
            chat_sessions_path: Mutex::new(chat_sessions_json.to_string_lossy().to_string()),
            motivation_sessions_path: Mutex::new(motivation_sessions_json.to_string_lossy().to_string()),
        })
        .invoke_handler(tauri::generate_handler![
            // File system
            get_workspace_files,
            get_all_files,
            save_file,
            read_file,
            delete_file,
            save_note,
            read_note,
            delete_workspace_file,
            // AI
            ai_chat,
            ai_explain,
            generate_flashcard,
            add_ai_provider,
            remove_ai_provider,
            set_default_ai_provider,
            get_ai_providers,
            test_ai_provider,
            check_ollama,
            // Spaced repetition
            save_flashcard,
            get_due_cards,
            get_all_flashcards,
            review_flashcard,
            delete_flashcard,
            delete_flashcards_by_collection,
            get_flashcard_stats,
            restore_all_flashcards,
            get_cards_by_filter,
            check_due_flashcards,
            // Vector DB
            index_document,
            search_documents,
            get_index_stats,
            // Analytics
            log_study_activity,
            get_study_stats,
            get_today_study_minutes,
            save_exam_result,
            get_exam_results,
            // Exam data
            save_exam_data,
            load_exams_data,
            delete_exam_data,
            // Canvas
            save_file_binary,
            read_file_base64,
            save_canvas_state,
            load_canvas_state,
            // Recent docs
            log_recent_document,
            get_recent_documents,
            // Collections
            save_collections,
            load_collections,
            // Chat sessions
            save_chat_sessions,
            load_chat_sessions,
            // Motivation sessions
            save_motivation_sessions,
            load_motivation_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running app");
}
