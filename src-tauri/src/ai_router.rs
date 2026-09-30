use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

use crate::text::{strip_reasoning, truncate_chars};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AIProvider {
    OpenAI {
        api_key: String,
        model: String,
    },
    Anthropic {
        api_key: String,
        model: String,
    },
    Ollama {
        endpoint: String,
        model: String,
    },
    DeepSeek {
        api_key: String,
        model: String,
    },
    OpenRouter {
        api_key: String,
        endpoint: String,
        model: String,
    },
    Groq {
        api_key: String,
        model: String,
    },
    GoogleGemini {
        api_key: String,
        model: String,
    },
    Mistral {
        api_key: String,
        model: String,
    },
    Together {
        api_key: String,
        model: String,
    },
    XAI {
        api_key: String,
        model: String,
    },
    Perplexity {
        api_key: String,
        model: String,
    },
    Cohere {
        api_key: String,
        model: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIResponse {
    pub content: String,
    pub provider: String,
    pub model: String,
    pub tokens_used: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProviderInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub model: String,
    pub endpoint: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct ChatOptions {
    pub temperature: Option<f32>,
    pub max_tokens: u32,
}

impl Default for ChatOptions {
    fn default() -> Self {
        Self {
            temperature: Some(0.7),
            max_tokens: 4096,
        }
    }
}

fn required_key(api_key: Option<String>, label: &str) -> Result<String, String> {
    api_key
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| format!("An API key is required for {label}"))
}

fn model_or(model: Option<String>, fallback: &str) -> String {
    model
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

impl AIProvider {
    pub fn from_config(
        provider_type: &str,
        api_key: Option<String>,
        endpoint: Option<String>,
        model: Option<String>,
    ) -> Result<Self, String> {
        let endpoint = endpoint
            .map(|e| e.trim().trim_end_matches('/').to_string())
            .filter(|e| !e.is_empty());
        Ok(match provider_type {
            "openai" => AIProvider::OpenAI {
                api_key: required_key(api_key, "OpenAI")?,
                model: model_or(model, "gpt-4o-mini"),
            },
            "anthropic" => AIProvider::Anthropic {
                api_key: required_key(api_key, "Anthropic")?,
                model: model_or(model, "claude-sonnet-5-5"),
            },
            "ollama" => AIProvider::Ollama {
                endpoint: endpoint.unwrap_or_else(|| "http://localhost:11434".into()),
                model: model_or(model, "llama3.1"),
            },
            "deepseek" => AIProvider::DeepSeek {
                api_key: required_key(api_key, "DeepSeek")?,
                model: model_or(model, "deepseek-chat"),
            },
            "openrouter" => AIProvider::OpenRouter {
                api_key: required_key(api_key, "OpenRouter")?,
                endpoint: endpoint.unwrap_or_else(|| "https://openrouter.ai/api/v1".into()),
                model: model_or(model, "openrouter/auto"),
            },
            "groq" => AIProvider::Groq {
                api_key: required_key(api_key, "Groq")?,
                model: model_or(model, "llama-3.3-70b-versatile"),
            },
            "google-gemini" => AIProvider::GoogleGemini {
                api_key: required_key(api_key, "Google Gemini")?,
                model: model_or(model, "gemini-2.0-flash"),
            },
            "mistral" => AIProvider::Mistral {
                api_key: required_key(api_key, "Mistral")?,
                model: model_or(model, "mistral-large-latest"),
            },
            "together" => AIProvider::Together {
                api_key: required_key(api_key, "Together AI")?,
                model: model_or(model, "meta-llama/Llama-3.3-70B-Instruct-Turbo"),
            },
            "xai" => AIProvider::XAI {
                api_key: required_key(api_key, "xAI")?,
                model: model_or(model, "grok-2-latest"),
            },
            "perplexity" => AIProvider::Perplexity {
                api_key: required_key(api_key, "Perplexity")?,
                model: model_or(model, "sonar-pro"),
            },
            "cohere" => AIProvider::Cohere {
                api_key: required_key(api_key, "Cohere")?,
                model: model_or(model, "command-r-plus"),
            },
            other => return Err(format!("Unknown provider type: {other}")),
        })
    }

    pub fn model_name(&self) -> &str {
        match self {
            AIProvider::OpenAI { model, .. }
            | AIProvider::Anthropic { model, .. }
            | AIProvider::Ollama { model, .. }
            | AIProvider::DeepSeek { model, .. }
            | AIProvider::OpenRouter { model, .. }
            | AIProvider::Groq { model, .. }
            | AIProvider::GoogleGemini { model, .. }
            | AIProvider::Mistral { model, .. }
            | AIProvider::Together { model, .. }
            | AIProvider::XAI { model, .. }
            | AIProvider::Perplexity { model, .. }
            | AIProvider::Cohere { model, .. } => model,
        }
    }

    pub fn type_name(&self) -> &'static str {
        match self {
            AIProvider::OpenAI { .. } => "openai",
            AIProvider::Anthropic { .. } => "anthropic",
            AIProvider::Ollama { .. } => "ollama",
            AIProvider::DeepSeek { .. } => "deepseek",
            AIProvider::OpenRouter { .. } => "openrouter",
            AIProvider::Groq { .. } => "groq",
            AIProvider::GoogleGemini { .. } => "google-gemini",
            AIProvider::Mistral { .. } => "mistral",
            AIProvider::Together { .. } => "together",
            AIProvider::XAI { .. } => "xai",
            AIProvider::Perplexity { .. } => "perplexity",
            AIProvider::Cohere { .. } => "cohere",
        }
    }

    pub fn id(&self) -> String {
        format!("{}:{}", self.type_name(), self.model_name())
    }

    pub fn endpoint(&self) -> Option<&str> {
        match self {
            AIProvider::Ollama { endpoint, .. } | AIProvider::OpenRouter { endpoint, .. } => {
                Some(endpoint)
            }
            _ => None,
        }
    }

    fn api_key(&self) -> Option<&str> {
        match self {
            AIProvider::Ollama { .. } => None,
            AIProvider::OpenAI { api_key, .. }
            | AIProvider::Anthropic { api_key, .. }
            | AIProvider::DeepSeek { api_key, .. }
            | AIProvider::OpenRouter { api_key, .. }
            | AIProvider::Groq { api_key, .. }
            | AIProvider::GoogleGemini { api_key, .. }
            | AIProvider::Mistral { api_key, .. }
            | AIProvider::Together { api_key, .. }
            | AIProvider::XAI { api_key, .. }
            | AIProvider::Perplexity { api_key, .. }
            | AIProvider::Cohere { api_key, .. } => Some(api_key),
        }
    }

    fn openai_compatible_url(&self) -> Option<String> {
        let fixed = match self {
            AIProvider::OpenAI { .. } => "https://api.openai.com/v1/chat/completions",
            AIProvider::DeepSeek { .. } => "https://api.deepseek.com/chat/completions",
            AIProvider::Groq { .. } => "https://api.groq.com/openai/v1/chat/completions",
            AIProvider::GoogleGemini { .. } => {
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            }
            AIProvider::Mistral { .. } => "https://api.mistral.ai/v1/chat/completions",
            AIProvider::Together { .. } => "https://api.together.xyz/v1/chat/completions",
            AIProvider::XAI { .. } => "https://api.x.ai/v1/chat/completions",
            AIProvider::Perplexity { .. } => "https://api.perplexity.ai/chat/completions",
            AIProvider::Cohere { .. } => "https://api.cohere.ai/compatibility/v1/chat/completions",
            AIProvider::OpenRouter { endpoint, .. } => {
                let base = endpoint.trim_end_matches('/');
                return Some(if base.ends_with("/chat/completions") {
                    base.to_string()
                } else {
                    format!("{base}/chat/completions")
                });
            }
            AIProvider::Anthropic { .. } | AIProvider::Ollama { .. } => return None,
        };
        Some(fixed.to_string())
    }
}

#[derive(Clone)]
pub struct AIRouter {
    providers: Vec<AIProvider>,
    client: Client,
}

impl Default for AIRouter {
    fn default() -> Self {
        Self::new()
    }
}

fn error_message(body: &str) -> String {
    let parsed = serde_json::from_str::<Value>(body).ok();
    let message = parsed.as_ref().and_then(|value| {
        value
            .pointer("/error/message")
            .or_else(|| value.pointer("/error"))
            .or_else(|| value.pointer("/message"))
            .and_then(|m| m.as_str())
            .map(str::to_string)
    });
    let text = message.unwrap_or_else(|| body.trim().to_string());
    truncate_chars(&text, 400).to_string()
}

fn content_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(|t| t.as_str())
                    .or_else(|| part.as_str())
            })
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn normalize_messages(messages: &[ChatMessage]) -> (Option<String>, Vec<ChatMessage>) {
    let system: Vec<&str> = messages
        .iter()
        .filter(|m| m.role == "system" && !m.content.trim().is_empty())
        .map(|m| m.content.as_str())
        .collect();
    let mut merged: Vec<ChatMessage> = Vec::new();
    for message in messages
        .iter()
        .filter(|m| m.role != "system" && !m.content.trim().is_empty())
    {
        let role = if message.role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        match merged.last_mut() {
            Some(last) if last.role == role => {
                last.content.push_str("\n\n");
                last.content.push_str(&message.content);
            }
            _ => merged.push(ChatMessage {
                role: role.into(),
                content: message.content.clone(),
            }),
        }
    }
    while merged.first().is_some_and(|m| m.role == "assistant") {
        merged.remove(0);
    }
    let system = if system.is_empty() {
        None
    } else {
        Some(system.join("\n\n"))
    };
    (system, merged)
}

fn chat_payload(messages: &[ChatMessage]) -> Vec<Value> {
    let (system, turns) = normalize_messages(messages);
    system
        .into_iter()
        .map(|content| json!({ "role": "system", "content": content }))
        .chain(
            turns
                .iter()
                .map(|m| json!({ "role": m.role, "content": m.content })),
        )
        .collect()
}

impl AIRouter {
    pub fn new() -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(600))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            providers: Vec::new(),
            client,
        }
    }

    pub fn providers(&self) -> &[AIProvider] {
        &self.providers
    }

    pub fn infos(&self) -> Vec<ProviderInfo> {
        self.providers
            .iter()
            .enumerate()
            .map(|(index, provider)| ProviderInfo {
                id: provider.id(),
                provider_type: provider.type_name().to_string(),
                model: provider.model_name().to_string(),
                endpoint: provider.endpoint().map(str::to_string),
                active: index == 0,
            })
            .collect()
    }

    pub fn add_provider(&mut self, provider: AIProvider) {
        let id = provider.id();
        match self.providers.iter().position(|p| p.id() == id) {
            Some(index) => self.providers[index] = provider,
            None => self.providers.push(provider),
        }
    }

    pub fn remove(&mut self, provider_type: &str, model: Option<&str>) {
        self.providers.retain(|p| {
            !(p.type_name() == provider_type && model.is_none_or(|m| p.model_name() == m))
        });
    }

    pub fn set_default(&mut self, provider_type: &str, model: Option<&str>) {
        let position = self.providers.iter().position(|p| {
            p.type_name() == provider_type && model.is_none_or(|m| p.model_name() == m)
        });
        if let Some(index) = position {
            let provider = self.providers.remove(index);
            self.providers.insert(0, provider);
        }
    }

    pub fn load_from_disk(&mut self, path: &std::path::Path) {
        if let Some(providers) = crate::storage::read_json::<Vec<AIProvider>>(path) {
            self.providers = providers;
        }
    }

    pub fn save_to_disk(&self, path: &std::path::Path) -> Result<(), String> {
        crate::storage::write_private_json(path, &self.providers)
    }

    fn find(&self, selector: Option<&str>) -> Option<&AIProvider> {
        let selector = selector.map(str::trim).filter(|s| !s.is_empty());
        match selector {
            Some(sel) => self
                .providers
                .iter()
                .find(|p| p.id() == sel)
                .or_else(|| self.providers.iter().find(|p| p.model_name() == sel))
                .or_else(|| self.providers.first()),
            None => self.providers.first(),
        }
    }

    pub async fn chat(
        &self,
        messages: &[ChatMessage],
        selector: Option<&str>,
        options: ChatOptions,
    ) -> Result<AIResponse, String> {
        let provider = self.find(selector).ok_or_else(|| {
            "No AI provider is configured. Add one in Settings → Providers.".to_string()
        })?;
        let mut response = match provider {
            AIProvider::Anthropic { api_key, model } => {
                self.call_anthropic(api_key, model, messages, options)
                    .await?
            }
            AIProvider::Ollama { endpoint, model } => {
                self.call_ollama(endpoint, model, messages, options).await?
            }
            _ => {
                let url = provider.openai_compatible_url().unwrap_or_default();
                self.call_openai_compatible(provider, &url, messages, options)
                    .await?
            }
        };
        response.content = strip_reasoning(&response.content);
        if response.content.trim().is_empty() {
            return Err(format!(
                "{} returned an empty response",
                provider.type_name()
            ));
        }
        Ok(response)
    }

    async fn call_openai_compatible(
        &self,
        provider: &AIProvider,
        url: &str,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> Result<AIResponse, String> {
        let model = provider.model_name();
        let payload = chat_payload(messages);
        let mut body =
            json!({ "model": model, "messages": payload, "max_tokens": options.max_tokens });
        if let Some(temperature) = options.temperature {
            body["temperature"] = json!(temperature);
        }

        let mut retried = false;
        loop {
            let mut request = self
                .client
                .post(url)
                .json(&body)
                .header("X-Title", "Annotate Studio");
            if let Some(key) = provider.api_key() {
                request = request.bearer_auth(key);
            }
            let resp = request
                .send()
                .await
                .map_err(|e| format!("Could not reach {}: {e}", provider.type_name()))?;
            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read the response: {e}"))?;

            if !status.is_success() {
                let lower = text.to_lowercase();
                let parameter_issue = lower.contains("max_tokens")
                    || lower.contains("temperature")
                    || lower.contains("max_completion_tokens");
                if status.as_u16() == 400 && parameter_issue && !retried {
                    if let Some(object) = body.as_object_mut() {
                        if let Some(limit) = object.remove("max_tokens") {
                            object.insert("max_completion_tokens".into(), limit);
                        }
                        object.remove("temperature");
                    }
                    retried = true;
                    continue;
                }
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    provider.type_name(),
                    status.as_u16(),
                    error_message(&text)
                ));
            }

            let json: Value = serde_json::from_str(&text).map_err(|e| {
                format!(
                    "Invalid response from {}: {e} — {}",
                    provider.type_name(),
                    truncate_chars(&text, 300)
                )
            })?;
            if let Some(error) = json.get("error").filter(|e| !e.is_null()) {
                return Err(format!(
                    "{} error: {}",
                    provider.type_name(),
                    error_message(&error.to_string())
                ));
            }
            let content = json
                .pointer("/choices/0/message/content")
                .map(content_text)
                .unwrap_or_default();
            let tokens_used = json
                .pointer("/usage/total_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            return Ok(AIResponse {
                content,
                provider: provider.type_name().into(),
                model: model.to_string(),
                tokens_used,
            });
        }
    }

    async fn call_anthropic(
        &self,
        api_key: &str,
        model: &str,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> Result<AIResponse, String> {
        let (system, turns) = normalize_messages(messages);
        if turns.is_empty() {
            return Err("There is no message to send".into());
        }
        let mut body = json!({
            "model": model,
            "max_tokens": options.max_tokens,
            "messages": turns.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect::<Vec<_>>(),
        });
        if let Some(system) = system {
            body["system"] = json!(system);
        }
        if let Some(temperature) = options.temperature {
            body["temperature"] = json!(temperature.min(1.0));
        }
        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Could not reach Anthropic: {e}"))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read the response: {e}"))?;
        if !status.is_success() {
            return Err(format!(
                "Anthropic returned HTTP {}: {}",
                status.as_u16(),
                error_message(&text)
            ));
        }
        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Invalid response from Anthropic: {e}"))?;
        let content = json
            .get("content")
            .and_then(|c| c.as_array())
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|block| block.get("type").and_then(|t| t.as_str()) == Some("text"))
                    .filter_map(|block| block.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();
        let tokens_used = match (
            json.pointer("/usage/input_tokens").and_then(|v| v.as_u64()),
            json.pointer("/usage/output_tokens")
                .and_then(|v| v.as_u64()),
        ) {
            (Some(input), Some(output)) => Some((input + output) as u32),
            (None, Some(output)) => Some(output as u32),
            _ => None,
        };
        Ok(AIResponse {
            content,
            provider: "anthropic".into(),
            model: model.to_string(),
            tokens_used,
        })
    }

    async fn call_ollama(
        &self,
        endpoint: &str,
        model: &str,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> Result<AIResponse, String> {
        let payload = chat_payload(messages);
        let mut body = json!({ "model": model, "messages": payload, "stream": false });
        if let Some(temperature) = options.temperature {
            body["options"] = json!({ "temperature": temperature });
        }
        let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));
        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Could not reach Ollama at {endpoint}. Is it running? ({e})"))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read the response: {e}"))?;
        if !status.is_success() {
            return Err(format!(
                "Ollama returned HTTP {}: {}",
                status.as_u16(),
                error_message(&text)
            ));
        }
        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Invalid response from Ollama: {e}"))?;
        let content = json
            .pointer("/message/content")
            .map(content_text)
            .unwrap_or_default();
        let tokens_used = json
            .get("eval_count")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        Ok(AIResponse {
            content,
            provider: "ollama".into(),
            model: model.to_string(),
            tokens_used,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    #[test]
    fn normalizes_messages_for_strict_providers() {
        let (system, turns) = normalize_messages(&[
            msg("system", "A"),
            msg("assistant", "hello"),
            msg("user", "one"),
            msg("user", "two"),
            msg("system", "B"),
            msg("assistant", "reply"),
            msg("user", "  "),
        ]);
        assert_eq!(system.as_deref(), Some("A\n\nB"));
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].role, "user");
        assert_eq!(turns[0].content, "one\n\ntwo");
        assert_eq!(turns[1].role, "assistant");
    }

    #[test]
    fn builds_alternating_payloads_for_openai_compatible_providers() {
        let payload = chat_payload(&[
            msg("system", "S"),
            msg("user", "a"),
            msg("user", "b"),
            msg("assistant", "c"),
        ]);
        assert_eq!(payload.len(), 3);
        assert_eq!(payload[0]["role"], "system");
        assert_eq!(payload[1]["content"], "a\n\nb");
        assert_eq!(payload[2]["role"], "assistant");
    }

    #[test]
    fn manages_provider_order() {
        let mut router = AIRouter::new();
        router.add_provider(
            AIProvider::from_config("ollama", None, None, Some("llama3".into())).unwrap(),
        );
        router.add_provider(
            AIProvider::from_config("openai", Some("k".into()), None, Some("gpt-4o".into()))
                .unwrap(),
        );
        router.add_provider(
            AIProvider::from_config("openai", Some("k2".into()), None, Some("gpt-4o".into()))
                .unwrap(),
        );
        assert_eq!(router.providers().len(), 2);
        assert_eq!(router.infos()[0].id, "ollama:llama3");
        router.set_default("openai", Some("gpt-4o"));
        assert!(router.infos()[0].active);
        assert_eq!(router.infos()[0].provider_type, "openai");
        assert_eq!(
            router.find(Some("ollama:llama3")).unwrap().type_name(),
            "ollama"
        );
        assert_eq!(router.find(Some("llama3")).unwrap().type_name(), "ollama");
        assert_eq!(router.find(Some("missing")).unwrap().type_name(), "openai");
        router.remove("openai", None);
        assert_eq!(router.providers().len(), 1);
    }

    #[test]
    fn requires_api_keys_for_cloud_providers() {
        assert!(AIProvider::from_config("openai", None, None, None).is_err());
        assert!(AIProvider::from_config("openai", Some("   ".into()), None, None).is_err());
        assert!(AIProvider::from_config("unknown", Some("k".into()), None, None).is_err());
        let ollama =
            AIProvider::from_config("ollama", None, Some("http://host:1/".into()), None).unwrap();
        assert_eq!(ollama.endpoint(), Some("http://host:1"));
    }

    #[test]
    fn keeps_legacy_provider_serialization() {
        let json = r#"[{"OpenAI":{"api_key":"k","model":"gpt-4o"}},{"Ollama":{"endpoint":"http://localhost:11434","model":"llama3"}}]"#;
        let providers: Vec<AIProvider> = serde_json::from_str(json).unwrap();
        assert_eq!(providers[0].id(), "openai:gpt-4o");
        assert_eq!(serde_json::to_string(&providers).unwrap(), json);
    }

    #[test]
    fn extracts_error_messages() {
        assert_eq!(
            error_message(r#"{"error":{"message":"bad key"}}"#),
            "bad key"
        );
        assert_eq!(error_message("plain failure"), "plain failure");
    }

    #[test]
    fn reads_content_parts() {
        assert_eq!(content_text(&json!("hi")), "hi");
        assert_eq!(
            content_text(
                &json!([{ "type": "text", "text": "a" }, { "type": "text", "text": "b" }])
            ),
            "ab"
        );
    }
}
