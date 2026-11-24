use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::ai_router::error_message;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vision: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
}

impl ModelCapabilities {
    pub fn merged_over(&self, base: &ModelCapabilities) -> ModelCapabilities {
        ModelCapabilities {
            vision: self.vision.or(base.vision),
            tools: self.tools.or(base.tools),
            reasoning: self.reasoning.or(base.reasoning),
            context_window: self.context_window.or(base.context_window),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: Option<String>,
    pub capabilities: ModelCapabilities,
}

fn has_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

pub fn infer_capabilities(provider: &str, model: &str) -> ModelCapabilities {
    let lower = model.to_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower).to_string();
    let reasoning = has_any(
        &name,
        &[
            "o1",
            "o3",
            "o4-",
            "gpt-5",
            "gpt-oss",
            "reasoner",
            "deepseek-r1",
            "-r1",
            "qwq",
            "qwen3",
            "magistral",
            "thinking",
            "grok-3-mini",
            "grok-4",
            "sonar-reasoning",
            "phi4-reasoning",
            "gemini-2.5",
            "gemini-3",
            "claude-3-7",
            "claude-opus-4",
            "claude-sonnet-4",
            "claude-haiku-4",
            "claude-opus-5",
            "claude-sonnet-5",
            "claude-haiku-5",
            "claude-fable",
            "kimi-k2-thinking",
        ],
    ) && !name.contains("gpt-5-chat");
    let vision = match provider {
        "anthropic" => Some(name.starts_with("claude")),
        "google-gemini" => {
            Some(name.contains("gemini") && !has_any(&name, &["embedding", "aqa", "tts"]))
        }
        "deepseek" => Some(false),
        "openai" => {
            let full_o_series = name == "o1"
                || name.starts_with("o1-2")
                || name == "o3"
                || name.starts_with("o3-2")
                || name.starts_with("o3-pro");
            if full_o_series
                || has_any(
                    &name,
                    &[
                        "gpt-4o",
                        "gpt-4.1",
                        "gpt-4.5",
                        "gpt-5",
                        "chatgpt-4o",
                        "gpt-4-turbo",
                        "vision",
                        "o4-",
                    ],
                )
            {
                Some(true)
            } else if has_any(&name, &["gpt-3.5", "o1-mini", "o3-mini", "o1-preview"]) {
                Some(false)
            } else {
                None
            }
        }
        _ => {
            if has_any(
                &name,
                &[
                    "vision",
                    "llava",
                    "-vl",
                    "vl-",
                    "vl:",
                    "pixtral",
                    "gemma3",
                    "gemma-3",
                    "llama-4",
                    "llama4",
                    "minicpm-v",
                    "moondream",
                    "qwen2.5vl",
                    "qwen3-vl",
                    "qwen2-vl",
                    "mistral-small3.1",
                    "mistral-small3.2",
                    "mistral-small-3.1",
                    "mistral-small-3.2",
                    "mistral-medium",
                    "grok-4",
                    "gpt-4o",
                    "gpt-4.1",
                    "gpt-5",
                    "claude",
                    "gemini",
                    "command-a-vision",
                    "internvl",
                    "kimi-vl",
                    "granite3.2-vision",
                    "glm-4.5v",
                    "glm-4v",
                ],
            ) {
                Some(true)
            } else {
                None
            }
        }
    };
    let tools = match provider {
        "perplexity" => Some(false),
        "anthropic" | "google-gemini" => Some(true),
        "openai" => Some(!has_any(
            &name,
            &["o1-mini", "o1-preview", "gpt-3.5-turbo-instruct", "search"],
        )),
        "deepseek" => Some(true),
        _ => {
            if has_any(
                &name,
                &[
                    "gemma",
                    "llava",
                    "moondream",
                    "deepseek-r1",
                    "phi3",
                    "phi-3",
                    "tinyllama",
                    "orca",
                ],
            ) {
                Some(false)
            } else if has_any(
                &name,
                &[
                    "llama-3.1",
                    "llama3.1",
                    "llama-3.3",
                    "llama3.3",
                    "llama-3.2",
                    "llama3.2",
                    "llama-4",
                    "llama4",
                    "qwen",
                    "mistral",
                    "mixtral",
                    "command",
                    "gpt-",
                    "claude",
                    "gemini",
                    "grok",
                    "kimi",
                    "glm",
                    "deepseek-v3",
                    "deepseek-chat",
                    "hermes",
                    "firefunction",
                    "granite",
                    "nemotron",
                    "magistral",
                    "devstral",
                    "codestral",
                    "gpt-oss",
                ],
            ) {
                Some(true)
            } else {
                None
            }
        }
    };
    let context_window = if name.starts_with("gpt-4.1") {
        Some(1_047_576)
    } else if name.starts_with("gpt-5") {
        Some(400_000)
    } else if name.starts_with("gpt-4o")
        || name.starts_with("chatgpt-4o")
        || name.starts_with("gpt-4-turbo")
    {
        Some(128_000)
    } else if (name.starts_with('o') && name.chars().nth(1).is_some_and(|c| c.is_ascii_digit()))
        || name.starts_with("claude")
    {
        Some(200_000)
    } else if name.contains("gemini-1.5") || name.contains("gemini-2") || name.contains("gemini-3")
    {
        Some(1_000_000)
    } else if name.starts_with("deepseek") {
        Some(128_000)
    } else if has_any(&name, &["grok-4"]) {
        Some(256_000)
    } else if has_any(
        &name,
        &[
            "llama-3.1",
            "llama-3.3",
            "llama3.1",
            "llama3.3",
            "mistral-large",
            "mistral-medium",
            "command-r",
            "command-a",
        ],
    ) {
        Some(128_000)
    } else {
        None
    };
    ModelCapabilities {
        vision,
        tools,
        reasoning: if reasoning { Some(true) } else { None },
        context_window,
    }
}

fn is_chat_model(id: &str) -> bool {
    let lower = id.to_lowercase();
    !has_any(
        &lower,
        &[
            "embed",
            "whisper",
            "tts",
            "dall-e",
            "davinci",
            "babbage",
            "moderation",
            "transcribe",
            "audio",
            "realtime",
            "image",
            "imagen",
            "computer-use",
            "codex",
            "rerank",
            "guard",
            "veo",
            "lyria",
            "aqa",
            "sora",
            "omni-moderation",
            "speech",
        ],
    )
}

fn number(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(Value::as_u64)
        .map(|v| v.min(u32::MAX as u64) as u32)
}

pub fn parse_openai_style(provider: &str, body: &Value) -> Vec<ModelInfo> {
    let list = body
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| body.get("models").and_then(Value::as_array))
        .or_else(|| body.as_array())
        .cloned()
        .unwrap_or_default();
    list.iter()
        .filter_map(|item| {
            let id = item
                .get("id")
                .or_else(|| item.get("name"))
                .and_then(Value::as_str)?
                .to_string();
            if !is_chat_model(&id) {
                return None;
            }
            if provider == "together" {
                if let Some(kind) = item.get("type").and_then(Value::as_str) {
                    if kind != "chat" && kind != "language" {
                        return None;
                    }
                }
            }
            let mut capabilities = infer_capabilities(provider, &id);
            if let Some(input) = item
                .pointer("/architecture/input_modalities")
                .and_then(Value::as_array)
            {
                capabilities.vision = Some(input.iter().any(|m| m.as_str() == Some("image")));
            }
            if let Some(input) = item.get("input_modalities").and_then(Value::as_array) {
                capabilities.vision = Some(input.iter().any(|m| m.as_str() == Some("image")));
            }
            if let Some(params) = item.get("supported_parameters").and_then(Value::as_array) {
                let has = |name: &str| params.iter().any(|p| p.as_str() == Some(name));
                capabilities.tools = Some(has("tools"));
                if has("reasoning") || has("include_reasoning") {
                    capabilities.reasoning = Some(true);
                }
            }
            if let Some(flags) = item.get("capabilities").filter(|c| c.is_object()) {
                if let Some(vision) = flags.get("vision").and_then(Value::as_bool) {
                    capabilities.vision = Some(vision);
                }
                if let Some(tools) = flags.get("function_calling").and_then(Value::as_bool) {
                    capabilities.tools = Some(tools);
                }
                if flags.get("reasoning").and_then(Value::as_bool) == Some(true) {
                    capabilities.reasoning = Some(true);
                }
            }
            if let Some(features) = item.get("features").and_then(Value::as_array) {
                let has = |name: &str| {
                    features
                        .iter()
                        .any(|f| f.as_str().is_some_and(|f| f.contains(name)))
                };
                if has("vision") {
                    capabilities.vision = Some(true);
                }
                if has("tool") {
                    capabilities.tools = Some(true);
                }
            }
            capabilities.context_window = number(item.get("context_length"))
                .or_else(|| number(item.get("context_window")))
                .or_else(|| number(item.get("max_context_length")))
                .or_else(|| number(item.get("max_model_len")))
                .or_else(|| number(item.pointer("/top_provider/context_length")))
                .or(capabilities.context_window);
            let name = item
                .get("name")
                .or_else(|| item.get("display_name"))
                .and_then(Value::as_str)
                .filter(|n| *n != id)
                .map(str::to_string);
            Some(ModelInfo {
                id,
                name,
                capabilities,
            })
        })
        .collect()
}

pub fn parse_gemini(body: &Value) -> Vec<ModelInfo> {
    body.get("models")
        .and_then(Value::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(|item| {
                    let full = item.get("name").and_then(Value::as_str)?;
                    let id = full.trim_start_matches("models/").to_string();
                    let methods = item
                        .get("supportedGenerationMethods")
                        .and_then(Value::as_array);
                    if methods
                        .is_some_and(|m| !m.iter().any(|x| x.as_str() == Some("generateContent")))
                        || !is_chat_model(&id)
                    {
                        return None;
                    }
                    let mut capabilities = infer_capabilities("google-gemini", &id);
                    capabilities.context_window =
                        number(item.get("inputTokenLimit")).or(capabilities.context_window);
                    if item.get("thinking").and_then(Value::as_bool) == Some(true) {
                        capabilities.reasoning = Some(true);
                    }
                    Some(ModelInfo {
                        id,
                        name: item
                            .get("displayName")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        capabilities,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_ollama_show(model: &str, body: &Value) -> ModelCapabilities {
    let mut capabilities = infer_capabilities("ollama", model);
    if let Some(list) = body.get("capabilities").and_then(Value::as_array) {
        let has = |name: &str| list.iter().any(|c| c.as_str() == Some(name));
        capabilities.vision = Some(has("vision"));
        capabilities.tools = Some(has("tools"));
        capabilities.reasoning = if has("thinking") {
            Some(true)
        } else {
            capabilities.reasoning
        };
    }
    if let Some(info) = body.get("model_info").and_then(Value::as_object) {
        if let Some(length) = info
            .iter()
            .find(|(key, _)| key.ends_with(".context_length"))
            .and_then(|(_, v)| v.as_u64())
        {
            capabilities.context_window = Some(length.min(u32::MAX as u64) as u32);
        }
    }
    capabilities
}

fn list_client() -> Client {
    crate::proxy::build_http_client(Some(40), 10)
}

async fn get_json(request: reqwest::RequestBuilder, provider: &str) -> Result<Value, String> {
    let response = request
        .send()
        .await
        .map_err(|e| format!("Could not reach {provider}: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read the model list: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "{provider} returned HTTP {}: {}",
            status.as_u16(),
            error_message(&text)
        ));
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid model list from {provider}: {e}"))
}

pub async fn list_models(
    provider: &str,
    api_key: Option<&str>,
    endpoint: Option<&str>,
) -> Result<Vec<ModelInfo>, String> {
    let client = list_client();
    let key = api_key.map(str::trim).filter(|k| !k.is_empty());
    let bearer = |request: reqwest::RequestBuilder| match key {
        Some(key) => request.bearer_auth(key),
        None => request,
    };
    let mut models = match provider {
        "openai" => parse_openai_style(
            provider,
            &get_json(
                bearer(client.get("https://api.openai.com/v1/models")),
                "OpenAI",
            )
            .await?,
        ),
        "anthropic" => {
            let key = key.ok_or("An API key is required for Anthropic")?;
            let body = get_json(
                client
                    .get("https://api.anthropic.com/v1/models?limit=100")
                    .header("x-api-key", key)
                    .header("anthropic-version", "2023-06-01"),
                "Anthropic",
            )
            .await?;
            parse_openai_style(provider, &body)
        }
        "google-gemini" => {
            let key = key.ok_or("An API key is required for Gemini")?;
            let body = get_json(
                client
                    .get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000")
                    .header("x-goog-api-key", key),
                "Gemini",
            )
            .await?;
            parse_gemini(&body)
        }
        "ollama" => {
            let base = endpoint
                .map(|e| e.trim_end_matches('/'))
                .filter(|e| !e.is_empty())
                .unwrap_or("http://localhost:11434");
            let body = get_json(client.get(format!("{base}/api/tags")), "Ollama").await?;
            let names: Vec<String> = body
                .get("models")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .filter_map(|m| m.get("name").and_then(Value::as_str).map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let mut models = Vec::new();
            for chunk in names.chunks(8) {
                let requests = chunk.iter().map(|name| {
                    let client = client.clone();
                    let url = format!("{base}/api/show");
                    let name = name.clone();
                    async move {
                        let show = client
                            .post(url)
                            .json(&serde_json::json!({ "model": name }))
                            .send()
                            .await
                            .ok();
                        let body = match show {
                            Some(response) => response.json::<Value>().await.unwrap_or(Value::Null),
                            None => Value::Null,
                        };
                        let capabilities = parse_ollama_show(&name, &body);
                        ModelInfo {
                            id: name,
                            name: None,
                            capabilities,
                        }
                    }
                });
                models.extend(futures_join(requests).await);
            }
            models.retain(|model| model.capabilities.tools.is_some() || is_chat_model(&model.id));
            models
        }
        "openrouter" => {
            let base = endpoint
                .map(|e| e.trim_end_matches('/'))
                .filter(|e| !e.is_empty())
                .unwrap_or("https://openrouter.ai/api/v1");
            parse_openai_style(
                provider,
                &get_json(bearer(client.get(format!("{base}/models"))), "OpenRouter").await?,
            )
        }
        "groq" => parse_openai_style(
            provider,
            &get_json(
                bearer(client.get("https://api.groq.com/openai/v1/models")),
                "Groq",
            )
            .await?,
        ),
        "deepseek" => parse_openai_style(
            provider,
            &get_json(
                bearer(client.get("https://api.deepseek.com/models")),
                "DeepSeek",
            )
            .await?,
        ),
        "mistral" => parse_openai_style(
            provider,
            &get_json(
                bearer(client.get("https://api.mistral.ai/v1/models")),
                "Mistral",
            )
            .await?,
        ),
        "together" => parse_openai_style(
            provider,
            &get_json(
                bearer(client.get("https://api.together.xyz/v1/models")),
                "Together",
            )
            .await?,
        ),
        "xai" => {
            let body = match get_json(
                bearer(client.get("https://api.x.ai/v1/language-models")),
                "xAI",
            )
            .await
            {
                Ok(body) => body,
                Err(_) => get_json(bearer(client.get("https://api.x.ai/v1/models")), "xAI").await?,
            };
            parse_openai_style(provider, &body)
        }
        "cohere" => {
            let body = get_json(
                bearer(client.get("https://api.cohere.com/v1/models?endpoint=chat&page_size=100")),
                "Cohere",
            )
            .await?;
            parse_openai_style(provider, &body)
        }
        "perplexity" => [
            "sonar",
            "sonar-pro",
            "sonar-reasoning",
            "sonar-reasoning-pro",
            "sonar-deep-research",
        ]
        .iter()
        .map(|id| ModelInfo {
            id: id.to_string(),
            name: None,
            capabilities: infer_capabilities("perplexity", id),
        })
        .collect(),
        other => return Err(format!("Unknown provider type: {other}")),
    };
    let mut seen = std::collections::HashSet::new();
    models.retain(|model| seen.insert(model.id.clone()));
    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

async fn futures_join<F, T>(futures: impl Iterator<Item = F>) -> Vec<T>
where
    F: std::future::Future<Output = T> + Send + 'static,
    T: Send + 'static,
{
    let handles: Vec<_> = futures.map(tauri::async_runtime::spawn).collect();
    let mut out = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(value) = handle.await {
            out.push(value);
        }
    }
    out
}

#[derive(Default)]
pub struct ModelRegistry {
    pub entries: HashMap<String, ModelCapabilities>,
}

impl ModelRegistry {
    pub fn load(path: &std::path::Path) -> Self {
        Self {
            entries: crate::storage::read_json(path).unwrap_or_default(),
        }
    }

    pub fn save(&self, path: &std::path::Path) -> Result<(), String> {
        crate::storage::write_json(path, &self.entries)
    }

    pub fn capabilities(&self, provider: &str, model: &str) -> ModelCapabilities {
        let inferred = infer_capabilities(provider, model);
        match self.entries.get(&format!("{provider}:{model}")) {
            Some(stored) => stored.merged_over(&inferred),
            None => inferred,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn infers_common_capabilities() {
        let gpt = infer_capabilities("openai", "gpt-4o-mini");
        assert_eq!(gpt.vision, Some(true));
        assert_eq!(gpt.tools, Some(true));
        let mini = infer_capabilities("openai", "o3-mini");
        assert_eq!(mini.vision, Some(false));
        assert_eq!(mini.reasoning, Some(true));
        assert_eq!(
            infer_capabilities("deepseek", "deepseek-reasoner").reasoning,
            Some(true)
        );
        assert_eq!(
            infer_capabilities("deepseek", "deepseek-chat").vision,
            Some(false)
        );
        assert_eq!(
            infer_capabilities("anthropic", "claude-sonnet-5-5").vision,
            Some(true)
        );
        assert_eq!(infer_capabilities("ollama", "llava:13b").vision, Some(true));
        assert_eq!(infer_capabilities("ollama", "gemma2:9b").tools, Some(false));
        assert_eq!(infer_capabilities("ollama", "unknown-model").vision, None);
        assert_eq!(infer_capabilities("perplexity", "sonar").tools, Some(false));
        assert_eq!(
            infer_capabilities("openai", "gpt-5-chat-latest").reasoning,
            None
        );
    }

    #[test]
    fn parses_openrouter_metadata() {
        let body = json!({ "data": [
            { "id": "openai/gpt-4o", "name": "GPT-4o", "context_length": 128000, "architecture": { "input_modalities": ["text", "image"] }, "supported_parameters": ["tools", "temperature"] },
            { "id": "deepseek/deepseek-r1", "context_length": 64000, "architecture": { "input_modalities": ["text"] }, "supported_parameters": ["reasoning", "include_reasoning"] },
            { "id": "openai/text-embedding-3-small" }
        ]});
        let models = parse_openai_style("openrouter", &body);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].capabilities.vision, Some(true));
        assert_eq!(models[0].capabilities.tools, Some(true));
        assert_eq!(models[0].capabilities.context_window, Some(128000));
        assert_eq!(models[1].capabilities.tools, Some(false));
        assert_eq!(models[1].capabilities.reasoning, Some(true));
    }

    #[test]
    fn parses_mistral_capabilities() {
        let body = json!({ "data": [{ "id": "pixtral-large-latest", "max_context_length": 131072, "capabilities": { "completion_chat": true, "function_calling": true, "vision": true } }] });
        let models = parse_openai_style("mistral", &body);
        assert_eq!(models[0].capabilities.vision, Some(true));
        assert_eq!(models[0].capabilities.context_window, Some(131072));
    }

    #[test]
    fn parses_gemini_models() {
        let body = json!({ "models": [
            { "name": "models/gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "inputTokenLimit": 1048576, "supportedGenerationMethods": ["generateContent"], "thinking": true },
            { "name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"] }
        ]});
        let models = parse_gemini(&body);
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "gemini-2.5-flash");
        assert_eq!(models[0].capabilities.reasoning, Some(true));
        assert_eq!(models[0].capabilities.vision, Some(true));
    }

    #[test]
    fn reads_ollama_show_capabilities() {
        let body = json!({ "capabilities": ["completion", "vision"], "model_info": { "gemma3.context_length": 131072 } });
        let capabilities = parse_ollama_show("gemma3:12b", &body);
        assert_eq!(capabilities.vision, Some(true));
        assert_eq!(capabilities.tools, Some(false));
        assert_eq!(capabilities.context_window, Some(131072));
    }

    #[test]
    fn stored_capabilities_override_inferred_ones() {
        let mut registry = ModelRegistry::default();
        registry.entries.insert(
            "ollama:my-vlm".into(),
            ModelCapabilities {
                vision: Some(true),
                ..Default::default()
            },
        );
        assert_eq!(registry.capabilities("ollama", "my-vlm").vision, Some(true));
        assert_eq!(registry.capabilities("ollama", "other").vision, None);
    }
}
