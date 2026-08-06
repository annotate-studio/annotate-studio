use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AIProvider {
    OpenAI { api_key: String, model: String },
    Anthropic { api_key: String, model: String },
    Ollama { endpoint: String, model: String },
    DeepSeek { api_key: String, model: String },
    OpenRouter { api_key: String, endpoint: String, model: String },
    Groq { api_key: String, model: String },
    GoogleGemini { api_key: String, model: String },
    Mistral { api_key: String, model: String },
    Together { api_key: String, model: String },
    XAI { api_key: String, model: String },
    Perplexity { api_key: String, model: String },
    Cohere { api_key: String, model: String },
}

impl AIProvider {
    pub fn model_name(&self) -> &str {
        match self {
            AIProvider::OpenAI { model, .. } => model,
            AIProvider::Anthropic { model, .. } => model,
            AIProvider::Ollama { model, .. } => model,
            AIProvider::DeepSeek { model, .. } => model,
            AIProvider::OpenRouter { model, .. } => model,
            AIProvider::Groq { model, .. } => model,
            AIProvider::GoogleGemini { model, .. } => model,
            AIProvider::Mistral { model, .. } => model,
            AIProvider::Together { model, .. } => model,
            AIProvider::XAI { model, .. } => model,
            AIProvider::Perplexity { model, .. } => model,
            AIProvider::Cohere { model, .. } => model,
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TaskType {
    Explain,
    GenerateFlashcard,
    Summarize,
    Quiz,
    Translate,
    CodeExplain,
    Custom,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AIRequest {
    pub messages: Vec<ChatMessage>,
    pub context: Option<String>,
    pub task_type: TaskType,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIResponse {
    pub content: String,
    pub provider: String,
    pub model: String,
    pub tokens_used: Option<u32>,
}

#[derive(Clone)]
pub struct AIRouter {
    providers: Vec<AIProvider>,
    client: Client,
}

impl AIRouter {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            client: Client::new(),
        }
    }

    pub fn add_provider(&mut self, provider: AIProvider) {
        let t = provider.type_name();
        let model = provider.model_name();
        // Match on (type, model) pair so one provider type can have multiple models
        if let Some(pos) = self.providers.iter().position(|p| p.type_name() == t && p.model_name() == model) {
            self.providers[pos] = provider;
        } else {
            self.providers.push(provider);
        }
    }

    pub fn remove_provider(&mut self, provider_type: &str) {
        self.providers.retain(|p| p.type_name() != provider_type);
    }

    pub fn remove_provider_model(&mut self, provider_type: &str, model: &str) {
        self.providers.retain(|p| !(p.type_name() == provider_type && p.model_name() == model));
    }

    pub fn set_default_provider(&mut self, provider_type: &str, model: &str) {
        if let Some(pos) = self.providers.iter().position(|p| p.type_name() == provider_type && p.model_name() == model) {
            let p = self.providers.remove(pos);
            self.providers.insert(0, p);
        }
    }

    /// Route using the default (first) provider, or a specific model if provided.
    pub async fn route_model(&self, request: &AIRequest, model_name: Option<&str>) -> Result<AIResponse, String> {
        let provider = if let Some(name) = model_name {
            self.providers.iter().find(|p| p.model_name() == name)
                .or_else(|| self.providers.first())
        } else {
            self.providers.first()
        };
        let provider = provider.ok_or_else(|| "No AI providers configured. Add one in Settings.".to_string())?;
        match provider {
            AIProvider::OpenAI { api_key, model } => {
                self.call_openai_compat("https://api.openai.com/v1/chat/completions", api_key, model, request).await
            }
            AIProvider::Anthropic { api_key, model } => {
                self.call_anthropic(request, api_key, model).await
            }
            AIProvider::Ollama { endpoint, model } => {
                self.call_ollama(request, endpoint, model).await
            }
            AIProvider::DeepSeek { api_key, model } => {
                self.call_openai_compat("https://api.deepseek.com/v1/chat/completions", api_key, model, request).await
            }
            AIProvider::OpenRouter { api_key, endpoint, model } => {
                let base = endpoint.trim_end_matches('/');
                let url = if base.contains("chat/completions") { base.to_string() } else { format!("{}/chat/completions", base) };
                self.call_openai_compat(&url, api_key, model, request).await
            }
            AIProvider::Groq { api_key, model } => {
                self.call_openai_compat("https://api.groq.com/openai/v1/chat/completions", api_key, model, request).await
            }
            AIProvider::GoogleGemini { api_key, model } => {
                self.call_openai_compat("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", api_key, model, request).await
            }
            AIProvider::Mistral { api_key, model } => {
                self.call_openai_compat("https://api.mistral.ai/v1/chat/completions", api_key, model, request).await
            }
            AIProvider::Together { api_key, model } => {
                self.call_openai_compat("https://api.together.xyz/v1/chat/completions", api_key, model, request).await
            }
            AIProvider::XAI { api_key, model } => {
                self.call_openai_compat("https://api.x.ai/v1/chat/completions", api_key, model, request).await
            }
            AIProvider::Perplexity { api_key, model } => {
                self.call_openai_compat("https://api.perplexity.ai/chat/completions", api_key, model, request).await
            }
            AIProvider::Cohere { api_key, model } => {
                self.call_openai_compat("https://api.cohere.com/v2/chat/completions", api_key, model, request).await
            }
        }
    }

    /// Route using providers[0] (backward compat).
    pub async fn route(&self, request: &AIRequest) -> Result<AIResponse, String> {
        self.route_model(request, None).await
    }

    pub fn providers(&self) -> &[AIProvider] {
        &self.providers
    }

    pub fn save_to_disk(&self, path: &std::path::Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.providers).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn load_from_disk(&mut self, path: &std::path::Path) {
        if let Ok(data) = std::fs::read_to_string(path) {
            if let Ok(providers) = serde_json::from_str::<Vec<AIProvider>>(&data) {
                self.providers = providers;
            }
        }
    }

    async fn call_openai_compat(
        &self,
        url: &str,
        api_key: &str,
        model: &str,
        request: &AIRequest,
    ) -> Result<AIResponse, String> {
        let messages: Vec<serde_json::Value> = request
            .messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4096,
        });

        let resp = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request to {} failed: {}", url, e))?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;

        if !status.is_success() {
            return Err(format!("{} returned HTTP {}: {}", url, status, text));
        }

        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse response from {}: {} — body: {}", url, e, &text[..text.len().min(500)]))?;

        if let Some(error) = json.get("error") {
            return Err(format!(
                "API error: {}",
                error["message"].as_str().unwrap_or("Unknown error")
            ));
        }

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let tokens_used = json["usage"]["total_tokens"].as_u64().map(|v| v as u32);
        let provider_name = if url.contains("deepseek") { "deepseek" }
            else if url.contains("groq") { "groq" }
            else if url.contains("openrouter") { "openrouter" }
            else if url.contains("googleapis") || url.contains("generativelanguage") { "google-gemini" }
            else if url.contains("mistral") { "mistral" }
            else if url.contains("together") { "together" }
            else if url.contains("x.ai") { "xai" }
            else if url.contains("perplexity") { "perplexity" }
            else if url.contains("cohere") { "cohere" }
            else { "openai" };

        Ok(AIResponse {
            content,
            provider: provider_name.into(),
            model: model.to_string(),
            tokens_used,
        })
    }

    async fn call_anthropic(
        &self,
        request: &AIRequest,
        api_key: &str,
        model: &str,
    ) -> Result<AIResponse, String> {
        let system_msg = request.messages.iter().find(|m| m.role == "system").map(|m| m.content.clone());
        let messages: Vec<serde_json::Value> = request
            .messages.iter().filter(|m| m.role != "system")
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let mut body = serde_json::json!({ "model": model, "messages": messages, "max_tokens": 4096 });
        if let Some(sys) = system_msg { body["system"] = serde_json::json!(sys); }

        let resp = self.client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body).send().await.map_err(|e| format!("Anthropic request failed: {}", e))?;

        let json: serde_json::Value = resp.json().await.map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;
        if let Some(error) = json.get("error") {
            return Err(format!("Anthropic error: {}", error["message"].as_str().unwrap_or("Unknown error")));
        }

        let content = json["content"][0]["text"].as_str().unwrap_or("").to_string();
        let tokens_used = json["usage"]["output_tokens"].as_u64().map(|v| v as u32);
        Ok(AIResponse { content, provider: "anthropic".into(), model: model.to_string(), tokens_used })
    }

    async fn call_ollama(
        &self,
        request: &AIRequest,
        endpoint: &str,
        model: &str,
    ) -> Result<AIResponse, String> {
        let messages: Vec<serde_json::Value> = request.messages.iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content })).collect();

        let body = serde_json::json!({ "model": model, "messages": messages, "stream": false });
        let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));

        let resp = self.client.post(&url).header("Content-Type", "application/json")
            .json(&body).send().await.map_err(|e| format!("Ollama request failed: {}", e))?;

        let json: serde_json::Value = resp.json().await.map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
        let content = json["message"]["content"].as_str().unwrap_or("").to_string();
        let tokens_used = json["eval_count"].as_u64().map(|v| v as u32);
        Ok(AIResponse { content, provider: "ollama".into(), model: model.to_string(), tokens_used })
    }
}
