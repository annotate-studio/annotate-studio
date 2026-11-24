use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::ai_router::{error_message, AIProvider};
use crate::text::truncate_chars;

pub const TOOLS_UNSUPPORTED: &str = "TOOLS_UNSUPPORTED";
pub const VISION_UNSUPPORTED: &str = "VISION_UNSUPPORTED";
pub const CANCELLED: &str = "The request was stopped.";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ContentPart {
    Text {
        text: String,
    },
    Image {
        #[serde(rename = "mediaType")]
        media_type: String,
        data: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TurnMessage {
    pub role: String,
    #[serde(default)]
    pub content: Vec<ContentPart>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub raw: Option<Value>,
    #[serde(default)]
    pub raw_provider: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TurnRequest {
    pub messages: Vec<TurnMessage>,
    #[serde(default)]
    pub tools: Vec<ToolSpec>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub reasoning: Option<String>,
    pub context_window: Option<u32>,
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TurnUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TurnResponse {
    pub content: String,
    pub reasoning: String,
    pub tool_calls: Vec<ToolCall>,
    pub stop_reason: String,
    pub usage: TurnUsage,
    pub provider: String,
    pub model: String,
    pub raw: Option<Value>,
    pub raw_provider: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TurnEvent {
    Text { delta: String },
    Reasoning { delta: String },
    ToolCall { name: String },
}

pub fn family(provider: &AIProvider) -> &'static str {
    match provider {
        AIProvider::Anthropic { .. } => "anthropic",
        AIProvider::Ollama { .. } => "ollama",
        _ => "openai",
    }
}

fn message_text(message: &TurnMessage) -> String {
    message
        .content
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text { text } => Some(text.as_str()),
            ContentPart::Image { .. } => None,
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn message_images(message: &TurnMessage) -> Vec<(&str, &str)> {
    message
        .content
        .iter()
        .filter_map(|part| match part {
            ContentPart::Image { media_type, data } => Some((media_type.as_str(), data.as_str())),
            ContentPart::Text { .. } => None,
        })
        .collect()
}

fn system_prompt(messages: &[TurnMessage]) -> Option<String> {
    let parts: Vec<String> = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(message_text)
        .filter(|text| !text.trim().is_empty())
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn arguments_string(arguments: &Value) -> String {
    match arguments {
        Value::String(text) => text.clone(),
        Value::Null => "{}".into(),
        other => other.to_string(),
    }
}

fn arguments_object(arguments: &Value) -> Value {
    match arguments {
        Value::Object(_) => arguments.clone(),
        Value::String(text) => serde_json::from_str::<Value>(text)
            .ok()
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({})),
        _ => json!({}),
    }
}

fn openai_user_content(message: &TurnMessage) -> Value {
    let images = message_images(message);
    if images.is_empty() {
        return Value::String(message_text(message));
    }
    let mut parts: Vec<Value> = Vec::new();
    let text = message_text(message);
    if !text.trim().is_empty() {
        parts.push(json!({ "type": "text", "text": text }));
    }
    for (media, data) in images {
        parts.push(json!({ "type": "image_url", "image_url": { "url": format!("data:{media};base64,{data}") } }));
    }
    Value::Array(parts)
}

fn strip_reasoning_fields(raw: &Value) -> Value {
    let mut cleaned = raw.clone();
    if let Some(object) = cleaned.as_object_mut() {
        object.remove("reasoning_content");
        object.remove("reasoning");
        object.remove("reasoning_details");
        object.remove("refusal");
        object.remove("annotations");
        object.insert("role".into(), json!("assistant"));
        if object
            .get("content")
            .is_some_and(|c| c.as_str() == Some(""))
            && object.contains_key("tool_calls")
        {
            object.insert("content".into(), Value::Null);
        }
    }
    cleaned
}

pub fn openai_messages(messages: &[TurnMessage], keep_raw: bool) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    if let Some(system) = system_prompt(messages) {
        out.push(json!({ "role": "system", "content": system }));
    }
    let mut pending_images: Vec<Value> = Vec::new();
    let flush_images = |out: &mut Vec<Value>, pending: &mut Vec<Value>| {
        if pending.is_empty() {
            return;
        }
        let mut parts =
            vec![json!({ "type": "text", "text": "Images returned by the tools above:" })];
        parts.append(pending);
        out.push(json!({ "role": "user", "content": parts }));
    };
    for message in messages.iter().filter(|m| m.role != "system") {
        if message.role != "tool" {
            flush_images(&mut out, &mut pending_images);
        }
        match message.role.as_str() {
            "assistant" => {
                if keep_raw && message.raw_provider.as_deref() == Some("openai") {
                    if let Some(raw) = &message.raw {
                        out.push(strip_reasoning_fields(raw));
                        continue;
                    }
                }
                let text = message_text(message);
                let mut value = json!({ "role": "assistant", "content": if text.is_empty() && !message.tool_calls.is_empty() { Value::Null } else { Value::String(text) } });
                if !message.tool_calls.is_empty() {
                    value["tool_calls"] = Value::Array(
                        message
                            .tool_calls
                            .iter()
                            .map(|call| json!({ "id": call.id, "type": "function", "function": { "name": call.name, "arguments": arguments_string(&call.arguments) } }))
                            .collect(),
                    );
                }
                out.push(value);
            }
            "tool" => {
                let text = message_text(message);
                out.push(json!({
                    "role": "tool",
                    "tool_call_id": message.tool_call_id.clone().unwrap_or_default(),
                    "content": if text.is_empty() { "(no output)".to_string() } else { text },
                }));
                for (media, data) in message_images(message) {
                    pending_images.push(json!({ "type": "image_url", "image_url": { "url": format!("data:{media};base64,{data}") } }));
                }
            }
            _ => {
                let content = openai_user_content(message);
                if let Some(last) = out.last_mut() {
                    if last["role"] == "user" {
                        let merged = merge_openai_content(&last["content"], &content);
                        last["content"] = merged;
                        continue;
                    }
                }
                out.push(json!({ "role": "user", "content": content }));
            }
        }
    }
    flush_images(&mut out, &mut pending_images);
    out
}

fn merge_openai_content(a: &Value, b: &Value) -> Value {
    match (a, b) {
        (Value::String(x), Value::String(y)) => Value::String(format!("{x}\n\n{y}")),
        _ => {
            let mut parts = Vec::new();
            for value in [a, b] {
                match value {
                    Value::String(text) => parts.push(json!({ "type": "text", "text": text })),
                    Value::Array(items) => parts.extend(items.iter().cloned()),
                    _ => {}
                }
            }
            Value::Array(parts)
        }
    }
}

pub fn anthropic_messages(messages: &[TurnMessage], keep_raw: bool) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    let mut push = |role: &str, blocks: Vec<Value>| {
        if blocks.is_empty() {
            return;
        }
        if let Some(last) = out.last_mut() {
            if last["role"] == role {
                if let Some(array) = last["content"].as_array_mut() {
                    array.extend(blocks);
                    return;
                }
            }
        }
        out.push(json!({ "role": role, "content": blocks }));
    };
    for message in messages.iter().filter(|m| m.role != "system") {
        match message.role.as_str() {
            "assistant" => {
                if keep_raw && message.raw_provider.as_deref() == Some("anthropic") {
                    if let Some(Value::Array(blocks)) = &message.raw {
                        push("assistant", blocks.clone());
                        continue;
                    }
                }
                let mut blocks = Vec::new();
                let text = message_text(message);
                if !text.trim().is_empty() {
                    blocks.push(json!({ "type": "text", "text": text }));
                }
                for call in &message.tool_calls {
                    blocks.push(json!({ "type": "tool_use", "id": call.id, "name": call.name, "input": arguments_object(&call.arguments) }));
                }
                push("assistant", blocks);
            }
            "tool" => {
                let mut content = Vec::new();
                let text = message_text(message);
                content.push(json!({ "type": "text", "text": if text.is_empty() { "(no output)".to_string() } else { text } }));
                for (media, data) in message_images(message) {
                    content.push(json!({ "type": "image", "source": { "type": "base64", "media_type": media, "data": data } }));
                }
                push(
                    "user",
                    vec![
                        json!({ "type": "tool_result", "tool_use_id": message.tool_call_id.clone().unwrap_or_default(), "content": content }),
                    ],
                );
            }
            _ => {
                let mut blocks = Vec::new();
                let text = message_text(message);
                if !text.trim().is_empty() {
                    blocks.push(json!({ "type": "text", "text": text }));
                }
                for (media, data) in message_images(message) {
                    blocks.push(json!({ "type": "image", "source": { "type": "base64", "media_type": media, "data": data } }));
                }
                push("user", blocks);
            }
        }
    }
    while out.first().is_some_and(|m| m["role"] == "assistant") {
        out.remove(0);
    }
    out
}

pub fn ollama_messages(messages: &[TurnMessage], keep_raw: bool) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    if let Some(system) = system_prompt(messages) {
        out.push(json!({ "role": "system", "content": system }));
    }
    let mut pending_images: Vec<String> = Vec::new();
    for message in messages.iter().filter(|m| m.role != "system") {
        if message.role != "tool" && !pending_images.is_empty() {
            out.push(json!({ "role": "user", "content": "Images returned by the tools above:", "images": std::mem::take(&mut pending_images) }));
        }
        match message.role.as_str() {
            "assistant" => {
                if keep_raw && message.raw_provider.as_deref() == Some("ollama") {
                    if let Some(raw) = &message.raw {
                        let mut raw = raw.clone();
                        if let Some(object) = raw.as_object_mut() {
                            object.remove("thinking");
                            object.insert("role".into(), json!("assistant"));
                        }
                        out.push(raw);
                        continue;
                    }
                }
                let mut value = json!({ "role": "assistant", "content": message_text(message) });
                if !message.tool_calls.is_empty() {
                    value["tool_calls"] = Value::Array(
                        message
                            .tool_calls
                            .iter()
                            .map(|call| json!({ "function": { "name": call.name, "arguments": arguments_object(&call.arguments) } }))
                            .collect(),
                    );
                }
                out.push(value);
            }
            "tool" => {
                let text = message_text(message);
                let mut value = json!({ "role": "tool", "content": if text.is_empty() { "(no output)".to_string() } else { text } });
                if let Some(name) = &message.tool_name {
                    value["tool_name"] = json!(name);
                }
                out.push(value);
                pending_images.extend(
                    message_images(message)
                        .into_iter()
                        .map(|(_, data)| data.to_string()),
                );
            }
            _ => {
                let mut value = json!({ "role": "user", "content": message_text(message) });
                let images: Vec<&str> = message_images(message)
                    .into_iter()
                    .map(|(_, data)| data)
                    .collect();
                if !images.is_empty() {
                    value["images"] = json!(images);
                }
                out.push(value);
            }
        }
    }
    if !pending_images.is_empty() {
        out.push(json!({ "role": "user", "content": "Images returned by the tools above:", "images": pending_images }));
    }
    out
}

pub fn openai_tools(tools: &[ToolSpec]) -> Value {
    Value::Array(
        tools
            .iter()
            .map(|tool| json!({ "type": "function", "function": { "name": tool.name, "description": tool.description, "parameters": tool.parameters } }))
            .collect(),
    )
}

pub fn anthropic_tools(tools: &[ToolSpec]) -> Value {
    Value::Array(
        tools
            .iter()
            .map(|tool| json!({ "name": tool.name, "description": tool.description, "input_schema": tool.parameters }))
            .collect(),
    )
}

pub fn claude_version(model: &str) -> Option<(u32, u32)> {
    let lower = model.to_lowercase();
    let parts: Vec<&str> = lower.split(['-', '.', '@', ':', '/']).collect();
    let index = parts.iter().position(|p| *p == "claude")?;
    let rest = &parts[index + 1..];
    let numbers: Vec<u32> = rest
        .iter()
        .take(4)
        .filter_map(|p| if p.len() <= 2 { p.parse().ok() } else { None })
        .collect();
    let named = rest
        .first()
        .is_some_and(|p| matches!(*p, "opus" | "sonnet" | "haiku" | "fable"));
    if named {
        let major = *numbers.first()?;
        return Some((major, numbers.get(1).copied().unwrap_or(0)));
    }
    let major = *numbers.first()?;
    Some((major, numbers.get(1).copied().unwrap_or(0)))
}

pub fn anthropic_thinking(model: &str, level: &str, max_tokens: u32) -> Option<(Value, u32)> {
    let (major, minor) = claude_version(model)?;
    let lower = model.to_lowercase();
    if major < 3 || (major == 3 && !(minor >= 7 || lower.contains("3-7"))) {
        return None;
    }
    if major > 4 || (major == 4 && minor >= 6) || lower.contains("fable") {
        return Some((json!({ "type": "adaptive" }), max_tokens.max(16_000)));
    }
    let budget = match level {
        "low" => 2_048,
        "medium" => 8_192,
        _ => 16_384,
    };
    Some((
        json!({ "type": "enabled", "budget_tokens": budget }),
        max_tokens.max(budget + 8_192),
    ))
}

fn openai_reasoning_model(model: &str) -> bool {
    let lower = model.to_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    (name.starts_with('o') && name.chars().nth(1).is_some_and(|c| c.is_ascii_digit()))
        || (name.starts_with("gpt-5") && !name.contains("chat"))
}

pub fn openai_reasoning_params(
    provider: &AIProvider,
    model: &str,
    level: Option<&str>,
    body: &mut Value,
) {
    let lower = model.to_lowercase();
    match provider {
        AIProvider::OpenAI { .. } => {
            if openai_reasoning_model(model) {
                if let Some(level) = level {
                    body["reasoning_effort"] = json!(level);
                }
            }
        }
        AIProvider::OpenRouter { .. } => {
            if let Some(level) = level {
                body["reasoning"] = json!({ "effort": level });
            }
        }
        AIProvider::GoogleGemini { .. } => {
            if let Some(level) = level {
                if lower.contains("2.5") || lower.contains("gemini-3") || lower.contains("thinking")
                {
                    body["reasoning_effort"] = json!(level);
                }
            }
        }
        AIProvider::Groq { .. } => {
            if lower.contains("gpt-oss") {
                if let Some(level) = level {
                    body["reasoning_effort"] = json!(level);
                }
                body["reasoning_format"] = json!("parsed");
            } else if lower.contains("qwen3")
                || lower.contains("deepseek-r1")
                || lower.contains("qwq")
            {
                body["reasoning_format"] = json!("parsed");
            }
        }
        AIProvider::XAI { .. } => {
            if let Some(level) = level {
                if lower.contains("mini") {
                    body["reasoning_effort"] = json!(if level == "low" { "low" } else { "high" });
                }
            }
        }
        _ => {}
    }
}

#[derive(Default)]
struct ThinkSplitter {
    inside: bool,
    pending: String,
}

impl ThinkSplitter {
    fn push(&mut self, delta: &str) -> (String, String) {
        self.pending.push_str(delta);
        let mut text = String::new();
        let mut reasoning = String::new();
        loop {
            let tag = if self.inside { "</think>" } else { "<think>" };
            if let Some(position) = self.pending.find(tag) {
                let before = self.pending[..position].to_string();
                if self.inside {
                    reasoning.push_str(&before);
                } else {
                    text.push_str(&before);
                }
                self.pending = self.pending[position + tag.len()..].to_string();
                self.inside = !self.inside;
                continue;
            }
            let keep = (1..tag.len())
                .rev()
                .find(|len| {
                    self.pending.len() >= *len
                        && self.pending.is_char_boundary(self.pending.len() - len)
                        && tag.starts_with(&self.pending[self.pending.len() - len..])
                })
                .unwrap_or(0);
            let flush_to = self.pending.len() - keep;
            let flushed = self.pending[..flush_to].to_string();
            self.pending = self.pending[flush_to..].to_string();
            if self.inside {
                reasoning.push_str(&flushed);
            } else {
                text.push_str(&flushed);
            }
            break;
        }
        (text, reasoning)
    }

    fn finish(&mut self) -> (String, String) {
        let rest = std::mem::take(&mut self.pending);
        if self.inside {
            (String::new(), rest)
        } else {
            (rest, String::new())
        }
    }
}

struct LineReader {
    buffer: Vec<u8>,
}

impl LineReader {
    fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(position) = self.buffer.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=position).collect();
            lines.push(
                String::from_utf8_lossy(&line)
                    .trim_end_matches(['\r', '\n'])
                    .to_string(),
            );
        }
        lines
    }

    fn finish(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        let line = String::from_utf8_lossy(&self.buffer).trim().to_string();
        self.buffer.clear();
        if line.is_empty() {
            None
        } else {
            Some(line)
        }
    }
}

#[derive(Default)]
pub struct OpenAiAccumulator {
    content: String,
    reasoning: String,
    tool_calls: Vec<Map<String, Value>>,
    arguments: Vec<String>,
    finish: Option<String>,
    usage: TurnUsage,
    splitter: ThinkSplitter,
}

impl OpenAiAccumulator {
    pub fn apply(&mut self, chunk: &Value, emit: &mut dyn FnMut(TurnEvent)) {
        if let Some(usage) = chunk.get("usage").filter(|u| u.is_object()) {
            self.usage.input_tokens = usage
                .get("prompt_tokens")
                .and_then(Value::as_u64)
                .or(self.usage.input_tokens);
            self.usage.output_tokens = usage
                .get("completion_tokens")
                .and_then(Value::as_u64)
                .or(self.usage.output_tokens);
        }
        let Some(choice) = chunk.pointer("/choices/0") else {
            return;
        };
        if let Some(reason) = choice.get("finish_reason").and_then(Value::as_str) {
            self.finish = Some(reason.to_string());
        }
        let delta = choice.get("delta").or_else(|| choice.get("message"));
        let Some(delta) = delta else {
            return;
        };
        for key in ["reasoning_content", "reasoning"] {
            if let Some(text) = delta.get(key).and_then(Value::as_str) {
                if !text.is_empty() {
                    self.reasoning.push_str(text);
                    emit(TurnEvent::Reasoning {
                        delta: text.to_string(),
                    });
                }
            }
        }
        if let Some(text) = delta.get("content").and_then(Value::as_str) {
            let (visible, hidden) = self.splitter.push(text);
            self.emit_split(visible, hidden, emit);
        } else if let Some(parts) = delta.get("content").and_then(Value::as_array) {
            for part in parts {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    let (visible, hidden) = self.splitter.push(text);
                    self.emit_split(visible, hidden, emit);
                }
            }
        }
        if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for (position, call) in calls.iter().enumerate() {
                let index = call
                    .get("index")
                    .and_then(Value::as_u64)
                    .map(|i| i as usize)
                    .unwrap_or_else(|| {
                        let id = call.get("id").and_then(Value::as_str);
                        match id {
                            Some(id) => self
                                .tool_calls
                                .iter()
                                .position(|existing| {
                                    existing.get("id").and_then(Value::as_str) == Some(id)
                                })
                                .unwrap_or(self.tool_calls.len()),
                            None => self.tool_calls.len().saturating_sub(1).max(position),
                        }
                    });
                while self.tool_calls.len() <= index {
                    self.tool_calls.push(Map::new());
                    self.arguments.push(String::new());
                }
                let target = &mut self.tool_calls[index];
                if let Some(object) = call.as_object() {
                    for (key, value) in object {
                        match key.as_str() {
                            "index" => {}
                            "function" => {
                                let function =
                                    target.entry("function").or_insert_with(|| json!({}));
                                if let Some(name) = value.get("name").and_then(Value::as_str) {
                                    if !name.is_empty() {
                                        function["name"] = json!(name);
                                        emit(TurnEvent::ToolCall {
                                            name: name.to_string(),
                                        });
                                    }
                                }
                                match value.get("arguments") {
                                    Some(Value::String(part)) => {
                                        self.arguments[index].push_str(part)
                                    }
                                    Some(Value::Object(object)) => {
                                        self.arguments[index] =
                                            Value::Object(object.clone()).to_string()
                                    }
                                    _ => {}
                                }
                            }
                            _ => {
                                if !value.is_null() {
                                    target.insert(key.clone(), value.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn emit_split(&mut self, visible: String, hidden: String, emit: &mut dyn FnMut(TurnEvent)) {
        if !hidden.is_empty() {
            self.reasoning.push_str(&hidden);
            emit(TurnEvent::Reasoning { delta: hidden });
        }
        if !visible.is_empty() {
            self.content.push_str(&visible);
            emit(TurnEvent::Text { delta: visible });
        }
    }

    pub fn finish(
        mut self,
        provider: &str,
        model: &str,
        emit: &mut dyn FnMut(TurnEvent),
    ) -> TurnResponse {
        let (visible, hidden) = self.splitter.finish();
        self.emit_split(visible, hidden, emit);
        let mut calls = Vec::new();
        let mut raw_calls = Vec::new();
        for (index, mut call) in self.tool_calls.into_iter().enumerate() {
            let arguments_text = self.arguments.get(index).cloned().unwrap_or_default();
            let name = call
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if name.is_empty() {
                continue;
            }
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("call_{}", index + 1));
            let arguments = serde_json::from_str::<Value>(if arguments_text.trim().is_empty() {
                "{}"
            } else {
                &arguments_text
            })
            .unwrap_or_else(|_| Value::String(arguments_text.clone()));
            call.insert("id".into(), json!(id));
            call.insert("type".into(), json!("function"));
            if let Some(function) = call.get_mut("function") {
                function["arguments"] = json!(if arguments_text.trim().is_empty() {
                    "{}".to_string()
                } else {
                    arguments_text
                });
            }
            raw_calls.push(Value::Object(call));
            calls.push(ToolCall {
                id,
                name,
                arguments,
            });
        }
        let mut raw = json!({ "role": "assistant", "content": if self.content.is_empty() && !raw_calls.is_empty() { Value::Null } else { Value::String(self.content.clone()) } });
        if !raw_calls.is_empty() {
            raw["tool_calls"] = Value::Array(raw_calls);
        }
        let stop_reason = match self.finish.as_deref() {
            Some("tool_calls") | Some("function_call") => "tool_use".to_string(),
            Some("length") => "max_tokens".to_string(),
            Some(other) => other.to_string(),
            None if !calls.is_empty() => "tool_use".to_string(),
            None => "stop".to_string(),
        };
        TurnResponse {
            content: self.content,
            reasoning: self.reasoning,
            tool_calls: calls,
            stop_reason,
            usage: self.usage,
            provider: provider.to_string(),
            model: model.to_string(),
            raw: Some(raw),
            raw_provider: "openai".into(),
        }
    }
}

#[derive(Default)]
pub struct AnthropicAccumulator {
    blocks: Vec<Value>,
    json_parts: Vec<String>,
    stop_reason: Option<String>,
    usage: TurnUsage,
    error: Option<String>,
}

impl AnthropicAccumulator {
    pub fn apply(&mut self, event: &Value, emit: &mut dyn FnMut(TurnEvent)) {
        match event
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
        {
            "message_start" => {
                if let Some(usage) = event.pointer("/message/usage") {
                    self.usage.input_tokens = usage.get("input_tokens").and_then(Value::as_u64);
                }
            }
            "content_block_start" => {
                let index = event
                    .get("index")
                    .and_then(Value::as_u64)
                    .unwrap_or(self.blocks.len() as u64) as usize;
                while self.blocks.len() <= index {
                    self.blocks.push(Value::Null);
                    self.json_parts.push(String::new());
                }
                let block = event.get("content_block").cloned().unwrap_or(Value::Null);
                if block.get("type").and_then(Value::as_str) == Some("tool_use") {
                    if let Some(name) = block.get("name").and_then(Value::as_str) {
                        emit(TurnEvent::ToolCall {
                            name: name.to_string(),
                        });
                    }
                }
                self.blocks[index] = block;
            }
            "content_block_delta" => {
                let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                let Some(block) = self.blocks.get_mut(index) else {
                    return;
                };
                let Some(delta) = event.get("delta") else {
                    return;
                };
                match delta
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                {
                    "text_delta" => {
                        let text = delta
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let current = block
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        block["text"] = json!(current + text);
                        if !text.is_empty() {
                            emit(TurnEvent::Text {
                                delta: text.to_string(),
                            });
                        }
                    }
                    "thinking_delta" => {
                        let text = delta
                            .get("thinking")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let current = block
                            .get("thinking")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        block["thinking"] = json!(current + text);
                        if !text.is_empty() {
                            emit(TurnEvent::Reasoning {
                                delta: text.to_string(),
                            });
                        }
                    }
                    "signature_delta" => {
                        let text = delta
                            .get("signature")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let current = block
                            .get("signature")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        block["signature"] = json!(current + text);
                    }
                    "input_json_delta" => {
                        if let Some(part) = delta.get("partial_json").and_then(Value::as_str) {
                            self.json_parts[index].push_str(part);
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if let (Some(block), Some(json_text)) =
                    (self.blocks.get_mut(index), self.json_parts.get(index))
                {
                    if block.get("type").and_then(Value::as_str) == Some("tool_use") {
                        let input = if json_text.trim().is_empty() {
                            block.get("input").cloned().unwrap_or_else(|| json!({}))
                        } else {
                            serde_json::from_str::<Value>(json_text).unwrap_or_else(|_| json!({}))
                        };
                        block["input"] = input;
                    }
                }
            }
            "message_delta" => {
                if let Some(reason) = event.pointer("/delta/stop_reason").and_then(Value::as_str) {
                    self.stop_reason = Some(reason.to_string());
                }
                if let Some(output) = event
                    .pointer("/usage/output_tokens")
                    .and_then(Value::as_u64)
                {
                    self.usage.output_tokens = Some(output);
                }
            }
            "error" => {
                self.error = Some(
                    event
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("Anthropic stream error")
                        .to_string(),
                );
            }
            _ => {}
        }
    }

    pub fn finish(self, model: &str) -> Result<TurnResponse, String> {
        if let Some(error) = self.error {
            return Err(format!("Anthropic error: {error}"));
        }
        let blocks: Vec<Value> = self.blocks.into_iter().filter(|b| !b.is_null()).collect();
        let mut content = String::new();
        let mut reasoning = String::new();
        let mut calls = Vec::new();
        for block in &blocks {
            match block
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
            {
                "text" => content.push_str(
                    block
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default(),
                ),
                "thinking" => reasoning.push_str(
                    block
                        .get("thinking")
                        .and_then(Value::as_str)
                        .unwrap_or_default(),
                ),
                "tool_use" => calls.push(ToolCall {
                    id: block
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    name: block
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    arguments: block.get("input").cloned().unwrap_or_else(|| json!({})),
                }),
                _ => {}
            }
        }
        Ok(TurnResponse {
            content,
            reasoning,
            tool_calls: calls,
            stop_reason: self.stop_reason.unwrap_or_else(|| "end_turn".into()),
            usage: self.usage,
            provider: "anthropic".into(),
            model: model.to_string(),
            raw: Some(Value::Array(blocks)),
            raw_provider: "anthropic".into(),
        })
    }
}

#[derive(Default)]
pub struct OllamaAccumulator {
    content: String,
    reasoning: String,
    tool_calls: Vec<Value>,
    usage: TurnUsage,
    done_reason: Option<String>,
    splitter: ThinkSplitter,
    error: Option<String>,
}

impl OllamaAccumulator {
    pub fn apply(&mut self, chunk: &Value, emit: &mut dyn FnMut(TurnEvent)) {
        if let Some(error) = chunk.get("error").and_then(Value::as_str) {
            self.error = Some(error.to_string());
            return;
        }
        if let Some(message) = chunk.get("message") {
            if let Some(thinking) = message.get("thinking").and_then(Value::as_str) {
                if !thinking.is_empty() {
                    self.reasoning.push_str(thinking);
                    emit(TurnEvent::Reasoning {
                        delta: thinking.to_string(),
                    });
                }
            }
            if let Some(text) = message.get("content").and_then(Value::as_str) {
                let (visible, hidden) = self.splitter.push(text);
                if !hidden.is_empty() {
                    self.reasoning.push_str(&hidden);
                    emit(TurnEvent::Reasoning { delta: hidden });
                }
                if !visible.is_empty() {
                    self.content.push_str(&visible);
                    emit(TurnEvent::Text { delta: visible });
                }
            }
            if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
                for call in calls {
                    if let Some(name) = call.pointer("/function/name").and_then(Value::as_str) {
                        emit(TurnEvent::ToolCall {
                            name: name.to_string(),
                        });
                    }
                    self.tool_calls.push(call.clone());
                }
            }
        }
        if chunk.get("done").and_then(Value::as_bool) == Some(true) {
            self.done_reason = chunk
                .get("done_reason")
                .and_then(Value::as_str)
                .map(str::to_string);
            self.usage.input_tokens = chunk.get("prompt_eval_count").and_then(Value::as_u64);
            self.usage.output_tokens = chunk.get("eval_count").and_then(Value::as_u64);
        }
    }

    pub fn finish(
        mut self,
        model: &str,
        emit: &mut dyn FnMut(TurnEvent),
    ) -> Result<TurnResponse, String> {
        if let Some(error) = self.error.take() {
            return Err(error);
        }
        let (visible, hidden) = self.splitter.finish();
        if !hidden.is_empty() {
            self.reasoning.push_str(&hidden);
            emit(TurnEvent::Reasoning { delta: hidden });
        }
        if !visible.is_empty() {
            self.content.push_str(&visible);
            emit(TurnEvent::Text { delta: visible });
        }
        let calls: Vec<ToolCall> = self
            .tool_calls
            .iter()
            .enumerate()
            .filter_map(|(index, call)| {
                let name = call
                    .pointer("/function/name")
                    .and_then(Value::as_str)?
                    .to_string();
                Some(ToolCall {
                    id: call
                        .get("id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("call_{}", index + 1)),
                    name,
                    arguments: arguments_object(
                        call.pointer("/function/arguments").unwrap_or(&Value::Null),
                    ),
                })
            })
            .collect();
        let mut raw = json!({ "role": "assistant", "content": self.content });
        if !self.tool_calls.is_empty() {
            raw["tool_calls"] = Value::Array(self.tool_calls.clone());
        }
        Ok(TurnResponse {
            content: self.content,
            reasoning: self.reasoning,
            stop_reason: if calls.is_empty() {
                match self.done_reason.as_deref() {
                    Some("length") => "max_tokens".into(),
                    _ => "stop".into(),
                }
            } else {
                "tool_use".into()
            },
            tool_calls: calls,
            usage: self.usage,
            provider: "ollama".into(),
            model: model.to_string(),
            raw: Some(raw),
            raw_provider: "ollama".into(),
        })
    }
}

fn classify_error(
    provider: &str,
    status: u16,
    body: &str,
    had_tools: bool,
    had_images: bool,
) -> String {
    let message = error_message(body);
    let lower = message.to_lowercase();
    if had_tools
        && (lower.contains("does not support tools")
            || lower.contains("tool use is not supported")
            || lower.contains("tools is not supported")
            || lower.contains("function calling is not")
            || lower.contains("does not support function")
            || lower.contains("tool_choice")
            || (lower.contains("tools") && lower.contains("not supported"))
            || (lower.contains("tool") && lower.contains("unsupported")))
    {
        return format!(
            "{TOOLS_UNSUPPORTED}: {provider} cannot use tools with this model ({message})"
        );
    }
    if had_images
        && (lower.contains("image")
            || lower.contains("vision")
            || lower.contains("multimodal")
            || lower.contains("image_url"))
        && (lower.contains("support")
            || lower.contains("invalid")
            || lower.contains("not")
            || lower.contains("cannot"))
    {
        return format!("{VISION_UNSUPPORTED}: this model cannot read images ({message})");
    }
    format!("{provider} returned HTTP {status}: {message}")
}

async fn next_chunk(
    response: &mut reqwest::Response,
    cancel: &AtomicBool,
) -> Result<Option<Vec<u8>>, String> {
    let read = response.chunk();
    tokio::pin!(read);
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        tokio::select! {
            result = &mut read => {
                return result.map(|chunk| chunk.map(|bytes| bytes.to_vec())).map_err(|e| format!("The connection was interrupted: {e}"));
            }
            _ = tokio::time::sleep(Duration::from_millis(150)) => {}
        }
    }
}

async fn send_with_cancel(
    request: reqwest::RequestBuilder,
    cancel: &AtomicBool,
    provider: &str,
) -> Result<reqwest::Response, String> {
    let send = request.send();
    tokio::pin!(send);
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        tokio::select! {
            result = &mut send => {
                return result.map_err(|e| format!("Could not reach {provider}: {e}"));
            }
            _ = tokio::time::sleep(Duration::from_millis(150)) => {}
        }
    }
}

async fn read_body(mut response: reqwest::Response, cancel: &AtomicBool) -> Result<String, String> {
    let mut bytes = Vec::new();
    while let Some(chunk) = next_chunk(&mut response, cancel).await? {
        bytes.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn is_event_stream(response: &reqwest::Response) -> bool {
    response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("event-stream"))
}

pub struct TurnRunner<'a> {
    pub client: &'a Client,
    pub cancel: &'a AtomicBool,
}

impl TurnRunner<'_> {
    pub async fn run(
        &self,
        provider: &AIProvider,
        request: &TurnRequest,
        emit: &mut (dyn FnMut(TurnEvent) + Send),
    ) -> Result<TurnResponse, String> {
        let had_images = request.messages.iter().any(|m| {
            m.content
                .iter()
                .any(|part| matches!(part, ContentPart::Image { .. }))
        });
        match provider {
            AIProvider::Anthropic { api_key, model } => {
                self.anthropic(api_key, model, request, had_images, emit)
                    .await
            }
            AIProvider::Ollama { endpoint, model } => {
                self.ollama(endpoint, model, request, had_images, emit)
                    .await
            }
            AIProvider::Perplexity { .. } if !request.tools.is_empty() => Err(format!(
                "{TOOLS_UNSUPPORTED}: Perplexity models cannot use tools"
            )),
            _ => self.openai(provider, request, had_images, emit).await,
        }
    }

    async fn openai(
        &self,
        provider: &AIProvider,
        request: &TurnRequest,
        had_images: bool,
        emit: &mut (dyn FnMut(TurnEvent) + Send),
    ) -> Result<TurnResponse, String> {
        let url = provider.openai_compatible_url().unwrap_or_default();
        let model = provider.model_name().to_string();
        let name = provider.type_name();
        let max_tokens = request.max_tokens.unwrap_or(8192).clamp(256, 64_000);
        let mut body = json!({
            "model": model,
            "messages": openai_messages(&request.messages, true),
            "stream": true,
        });
        let reasoning_model = openai_reasoning_model(&model);
        if matches!(provider, AIProvider::OpenAI { .. }) && reasoning_model {
            body["max_completion_tokens"] = json!(max_tokens);
        } else {
            body["max_tokens"] = json!(max_tokens);
        }
        if let Some(temperature) = request.temperature {
            if !reasoning_model {
                body["temperature"] = json!(temperature);
            }
        }
        if !request.tools.is_empty() {
            body["tools"] = openai_tools(&request.tools);
            body["tool_choice"] = json!("auto");
        }
        if matches!(
            provider,
            AIProvider::OpenAI { .. }
                | AIProvider::OpenRouter { .. }
                | AIProvider::DeepSeek { .. }
                | AIProvider::Groq { .. }
                | AIProvider::Together { .. }
                | AIProvider::XAI { .. }
        ) {
            body["stream_options"] = json!({ "include_usage": true });
        }
        openai_reasoning_params(provider, &model, request.reasoning.as_deref(), &mut body);
        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut builder = self
                .client
                .post(&url)
                .json(&body)
                .header("X-Title", "Annotate Studio")
                .header(
                    "HTTP-Referer",
                    "https://github.com/annotate-studio/annotate-studio",
                );
            if let Some(key) = provider.api_key() {
                builder = builder.bearer_auth(key);
            }
            let response = send_with_cancel(builder, self.cancel, name).await?;
            let status = response.status();
            if !status.is_success() {
                let text = read_body(response, self.cancel).await?;
                let lower = text.to_lowercase();
                if status.as_u16() == 400 && attempt <= 3 {
                    let object = body.as_object_mut().expect("body is an object");
                    let mut changed = false;
                    if lower.contains("stream_options") && object.remove("stream_options").is_some()
                    {
                        changed = true;
                    }
                    if (lower.contains("max_tokens") || lower.contains("max_completion_tokens"))
                        && !changed
                    {
                        if let Some(limit) = object.remove("max_tokens") {
                            object.insert("max_completion_tokens".into(), limit);
                            changed = true;
                        } else if let Some(limit) = object.remove("max_completion_tokens") {
                            object.insert("max_tokens".into(), limit);
                            changed = true;
                        }
                    }
                    if lower.contains("temperature") && object.remove("temperature").is_some() {
                        changed = true;
                    }
                    if (lower.contains("reasoning") || lower.contains("thinking")) && !changed {
                        changed = ["reasoning_effort", "reasoning", "reasoning_format"]
                            .iter()
                            .any(|key| object.remove(*key).is_some());
                    }
                    if changed {
                        continue;
                    }
                }
                return Err(classify_error(
                    name,
                    status.as_u16(),
                    &text,
                    !request.tools.is_empty(),
                    had_images,
                ));
            }
            let mut accumulator = OpenAiAccumulator::default();
            if !is_event_stream(&response) {
                let text = read_body(response, self.cancel).await?;
                let value: Value = serde_json::from_str(&text).map_err(|e| {
                    format!(
                        "Invalid response from {name}: {e} — {}",
                        truncate_chars(&text, 300)
                    )
                })?;
                if let Some(error) = value.get("error").filter(|e| !e.is_null()) {
                    return Err(classify_error(
                        name,
                        200,
                        &error.to_string(),
                        !request.tools.is_empty(),
                        had_images,
                    ));
                }
                accumulator.apply(&value, emit);
                return Ok(accumulator.finish(name, &model, emit));
            }
            let mut response = response;
            let mut reader = LineReader::new();
            let mut stream_error: Option<String> = None;
            'read: while let Some(chunk) = next_chunk(&mut response, self.cancel).await? {
                for line in reader.push(&chunk) {
                    let Some(data) = line.strip_prefix("data:") else {
                        continue;
                    };
                    let data = data.trim();
                    if data == "[DONE]" {
                        break 'read;
                    }
                    if data.is_empty() {
                        continue;
                    }
                    if let Ok(value) = serde_json::from_str::<Value>(data) {
                        if let Some(error) = value.get("error").filter(|e| !e.is_null()) {
                            stream_error = Some(error_message(&error.to_string()));
                            break 'read;
                        }
                        accumulator.apply(&value, emit);
                    }
                }
            }
            if let Some(line) = reader.finish() {
                if let Some(data) = line.strip_prefix("data:") {
                    if let Ok(value) = serde_json::from_str::<Value>(data.trim()) {
                        accumulator.apply(&value, emit);
                    }
                }
            }
            if let Some(error) = stream_error {
                return Err(format!("{name} error: {error}"));
            }
            return Ok(accumulator.finish(name, &model, emit));
        }
    }

    async fn anthropic(
        &self,
        api_key: &str,
        model: &str,
        request: &TurnRequest,
        had_images: bool,
        emit: &mut (dyn FnMut(TurnEvent) + Send),
    ) -> Result<TurnResponse, String> {
        let messages = anthropic_messages(&request.messages, true);
        if messages.is_empty() {
            return Err("There is no message to send".into());
        }
        let mut max_tokens = request.max_tokens.unwrap_or(8192).clamp(256, 64_000);
        let mut body = json!({ "model": model, "messages": messages, "stream": true });
        if let Some(system) = system_prompt(&request.messages) {
            body["system"] = json!(system);
        }
        if !request.tools.is_empty() {
            body["tools"] = anthropic_tools(&request.tools);
        }
        let thinking = request
            .reasoning
            .as_deref()
            .and_then(|level| anthropic_thinking(model, level, max_tokens));
        if let Some((config, tokens)) = &thinking {
            body["thinking"] = config.clone();
            max_tokens = *tokens;
        } else if let Some(temperature) = request.temperature {
            body["temperature"] = json!(temperature.min(1.0));
        }
        body["max_tokens"] = json!(max_tokens);
        let mut attempt = 0;
        loop {
            attempt += 1;
            let builder = self
                .client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body);
            let response = send_with_cancel(builder, self.cancel, "Anthropic").await?;
            let status = response.status();
            if !status.is_success() {
                let text = read_body(response, self.cancel).await?;
                let lower = text.to_lowercase();
                if status.as_u16() == 400 && attempt == 1 && lower.contains("thinking") {
                    if let Some(object) = body.as_object_mut() {
                        if object.remove("thinking").is_some() {
                            object.insert(
                                "max_tokens".into(),
                                json!(request.max_tokens.unwrap_or(8192).clamp(256, 64_000)),
                            );
                            continue;
                        }
                    }
                }
                return Err(classify_error(
                    "Anthropic",
                    status.as_u16(),
                    &text,
                    !request.tools.is_empty(),
                    had_images,
                ));
            }
            let mut response = response;
            let mut accumulator = AnthropicAccumulator::default();
            let mut reader = LineReader::new();
            while let Some(chunk) = next_chunk(&mut response, self.cancel).await? {
                for line in reader.push(&chunk) {
                    if let Some(data) = line.strip_prefix("data:") {
                        if let Ok(value) = serde_json::from_str::<Value>(data.trim()) {
                            accumulator.apply(&value, emit);
                        }
                    }
                }
            }
            if let Some(line) = reader.finish() {
                if let Some(data) = line.strip_prefix("data:") {
                    if let Ok(value) = serde_json::from_str::<Value>(data.trim()) {
                        accumulator.apply(&value, emit);
                    }
                }
            }
            return accumulator.finish(model);
        }
    }

    async fn ollama(
        &self,
        endpoint: &str,
        model: &str,
        request: &TurnRequest,
        had_images: bool,
        emit: &mut (dyn FnMut(TurnEvent) + Send),
    ) -> Result<TurnResponse, String> {
        let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));
        let mut options = json!({});
        if let Some(temperature) = request.temperature {
            options["temperature"] = json!(temperature);
        }
        let estimated: usize = request
            .messages
            .iter()
            .map(|m| message_text(m).chars().count() / 3 + 200 * message_images(m).len())
            .sum::<usize>()
            + request
                .tools
                .iter()
                .map(|t| t.parameters.to_string().len() / 3 + t.description.len() / 3)
                .sum::<usize>();
        let wanted = (estimated as u32)
            .saturating_add(request.max_tokens.unwrap_or(4096))
            .saturating_add(1024);
        let limit = request.context_window.unwrap_or(32_768).max(4096);
        options["num_ctx"] = json!(wanted.clamp(8192, limit.max(8192)));
        if let Some(max) = request.max_tokens {
            options["num_predict"] = json!(max);
        }
        let mut body = json!({ "model": model, "messages": ollama_messages(&request.messages, true), "stream": true, "options": options });
        if !request.tools.is_empty() {
            body["tools"] = openai_tools(&request.tools);
        }
        if request.reasoning.is_some() {
            body["think"] = json!(true);
        }
        let mut attempt = 0;
        loop {
            attempt += 1;
            let response =
                send_with_cancel(self.client.post(&url).json(&body), self.cancel, "Ollama")
                    .await
                    .map_err(|e| {
                        if e == CANCELLED {
                            e
                        } else {
                            format!("Could not reach Ollama at {endpoint}. Is it running? ({e})")
                        }
                    })?;
            let status = response.status();
            if !status.is_success() {
                let text = read_body(response, self.cancel).await?;
                if attempt == 1
                    && text.to_lowercase().contains("think")
                    && body
                        .as_object_mut()
                        .and_then(|o| o.remove("think"))
                        .is_some()
                {
                    continue;
                }
                return Err(classify_error(
                    "Ollama",
                    status.as_u16(),
                    &text,
                    !request.tools.is_empty(),
                    had_images,
                ));
            }
            let mut response = response;
            let mut accumulator = OllamaAccumulator::default();
            let mut reader = LineReader::new();
            while let Some(chunk) = next_chunk(&mut response, self.cancel).await? {
                for line in reader.push(&chunk) {
                    if let Ok(value) = serde_json::from_str::<Value>(line.trim()) {
                        accumulator.apply(&value, emit);
                    }
                }
            }
            if let Some(line) = reader.finish() {
                if let Ok(value) = serde_json::from_str::<Value>(&line) {
                    accumulator.apply(&value, emit);
                }
            }
            return accumulator.finish(model, emit).map_err(|error| {
                let lower = error.to_lowercase();
                if lower.contains("does not support tools") {
                    format!("{TOOLS_UNSUPPORTED}: {error}")
                } else {
                    error
                }
            });
        }
    }
}

pub fn streaming_client() -> Client {
    crate::proxy::build_streaming_client()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(role: &str, value: &str) -> TurnMessage {
        TurnMessage {
            role: role.into(),
            content: vec![ContentPart::Text { text: value.into() }],
            ..Default::default()
        }
    }

    fn image() -> ContentPart {
        ContentPart::Image {
            media_type: "image/png".into(),
            data: "AAAA".into(),
        }
    }

    fn assistant_with_call() -> TurnMessage {
        TurnMessage {
            role: "assistant".into(),
            content: vec![],
            tool_calls: vec![ToolCall {
                id: "call_1".into(),
                name: "read_file".into(),
                arguments: json!({ "path": "notes/a.md" }),
            }],
            ..Default::default()
        }
    }

    fn tool_result(id: &str, with_image: bool) -> TurnMessage {
        let mut content = vec![ContentPart::Text {
            text: "contents".into(),
        }];
        if with_image {
            content.push(image());
        }
        TurnMessage {
            role: "tool".into(),
            content,
            tool_call_id: Some(id.into()),
            tool_name: Some("read_file".into()),
            ..Default::default()
        }
    }

    #[test]
    fn builds_openai_messages_with_tools_and_images() {
        let messages = vec![
            text("system", "S"),
            text("user", "Q"),
            assistant_with_call(),
            tool_result("call_1", true),
            text("user", "next"),
        ];
        let out = openai_messages(&messages, true);
        assert_eq!(out[0]["role"], "system");
        assert_eq!(out[1]["content"], "Q");
        assert_eq!(
            out[2]["tool_calls"][0]["function"]["arguments"],
            "{\"path\":\"notes/a.md\"}"
        );
        assert!(out[2]["content"].is_null());
        assert_eq!(out[3]["role"], "tool");
        assert_eq!(out[3]["tool_call_id"], "call_1");
        assert_eq!(out[4]["role"], "user");
        assert_eq!(out[4]["content"][1]["type"], "image_url");
        assert_eq!(
            out[4]["content"].as_array().unwrap().last().unwrap()["text"],
            "next"
        );
    }

    #[test]
    fn echoes_raw_openai_assistant_messages_without_reasoning() {
        let mut message = assistant_with_call();
        message.raw = Some(
            json!({ "role": "assistant", "content": "", "reasoning_content": "secret", "tool_calls": [{ "id": "x", "type": "function", "function": { "name": "f", "arguments": "{}" }, "extra_content": { "google": { "thought_signature": "sig" } } }] }),
        );
        message.raw_provider = Some("openai".into());
        let out = openai_messages(&[text("user", "Q"), message], true);
        assert!(out[1].get("reasoning_content").is_none());
        assert_eq!(
            out[1]["tool_calls"][0]["extra_content"]["google"]["thought_signature"],
            "sig"
        );
        assert!(out[1]["content"].is_null());
    }

    #[test]
    fn builds_anthropic_messages_with_merged_tool_results() {
        let mut second = assistant_with_call();
        second.tool_calls.push(ToolCall {
            id: "call_2".into(),
            name: "list_files".into(),
            arguments: Value::String("{\"type\":\"pdf\"}".into()),
        });
        let messages = vec![
            text("system", "S"),
            text("assistant", "hi"),
            text("user", "Q"),
            second,
            tool_result("call_1", true),
            tool_result("call_2", false),
            text("user", "more"),
        ];
        let out = anthropic_messages(&messages, true);
        assert_eq!(out[0]["role"], "user");
        assert_eq!(out[1]["content"][1]["input"]["type"], "pdf");
        assert_eq!(out[2]["role"], "user");
        let blocks = out[2]["content"].as_array().unwrap();
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0]["type"], "tool_result");
        assert_eq!(blocks[0]["content"][1]["type"], "image");
        assert_eq!(blocks[2]["text"], "more");
    }

    #[test]
    fn builds_ollama_messages_with_images() {
        let mut user = text("user", "look");
        user.content.push(image());
        let out = ollama_messages(
            &[
                text("system", "S"),
                user,
                assistant_with_call(),
                tool_result("call_1", true),
            ],
            true,
        );
        assert_eq!(out[1]["images"][0], "AAAA");
        assert_eq!(
            out[2]["tool_calls"][0]["function"]["arguments"]["path"],
            "notes/a.md"
        );
        assert_eq!(out[3]["role"], "tool");
        assert_eq!(out[4]["images"][0], "AAAA");
    }

    #[test]
    fn accumulates_streamed_openai_tool_calls() {
        let mut accumulator = OpenAiAccumulator::default();
        let mut events = Vec::new();
        let mut emit = |event: TurnEvent| events.push(event);
        for chunk in [
            json!({ "choices": [{ "delta": { "role": "assistant", "content": "Let me ", "reasoning_content": "think" } }] }),
            json!({ "choices": [{ "delta": { "content": "check." } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "id": "call_a", "type": "function", "function": { "name": "search", "arguments": "{\"qu" } }] } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "function": { "arguments": "ery\":\"x\"}" } }] } }] }),
            json!({ "choices": [{ "delta": {}, "finish_reason": "tool_calls" }] }),
            json!({ "choices": [], "usage": { "prompt_tokens": 10, "completion_tokens": 5 } }),
        ] {
            accumulator.apply(&chunk, &mut emit);
        }
        let response = accumulator.finish("openai", "m", &mut emit);
        assert_eq!(response.content, "Let me check.");
        assert_eq!(response.reasoning, "think");
        assert_eq!(response.tool_calls[0].arguments["query"], "x");
        assert_eq!(response.stop_reason, "tool_use");
        assert_eq!(response.usage.input_tokens, Some(10));
        assert_eq!(
            response.raw.unwrap()["tool_calls"][0]["function"]["arguments"],
            "{\"query\":\"x\"}"
        );
        assert!(events.contains(&TurnEvent::ToolCall {
            name: "search".into()
        }));
    }

    #[test]
    fn handles_tool_calls_without_index() {
        let mut accumulator = OpenAiAccumulator::default();
        let mut emit = |_event: TurnEvent| {};
        accumulator.apply(&json!({ "choices": [{ "delta": { "tool_calls": [{ "id": "a", "function": { "name": "one", "arguments": "{}" } }, { "id": "b", "function": { "name": "two", "arguments": "{\"x\":1}" } }] } }] }), &mut emit);
        let response = accumulator.finish("google-gemini", "m", &mut emit);
        assert_eq!(response.tool_calls.len(), 2);
        assert_eq!(response.tool_calls[1].name, "two");
        assert_eq!(response.tool_calls[1].arguments["x"], 1);
    }

    #[test]
    fn splits_think_tags_across_chunks() {
        let mut splitter = ThinkSplitter::default();
        let mut text = String::new();
        let mut reasoning = String::new();
        for part in ["<thi", "nk>plan</th", "ink>Answer"] {
            let (visible, hidden) = splitter.push(part);
            text.push_str(&visible);
            reasoning.push_str(&hidden);
        }
        let (visible, hidden) = splitter.finish();
        text.push_str(&visible);
        reasoning.push_str(&hidden);
        assert_eq!(text, "Answer");
        assert_eq!(reasoning, "plan");
    }

    #[test]
    fn accumulates_anthropic_stream_events() {
        let mut accumulator = AnthropicAccumulator::default();
        let mut emit = |_event: TurnEvent| {};
        for event in [
            json!({ "type": "message_start", "message": { "usage": { "input_tokens": 12 } } }),
            json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "thinking", "thinking": "" } }),
            json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "thinking_delta", "thinking": "hmm" } }),
            json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "signature_delta", "signature": "sig" } }),
            json!({ "type": "content_block_stop", "index": 0 }),
            json!({ "type": "content_block_start", "index": 1, "content_block": { "type": "text", "text": "" } }),
            json!({ "type": "content_block_delta", "index": 1, "delta": { "type": "text_delta", "text": "Reading" } }),
            json!({ "type": "content_block_start", "index": 2, "content_block": { "type": "tool_use", "id": "tu_1", "name": "read_file", "input": {} } }),
            json!({ "type": "content_block_delta", "index": 2, "delta": { "type": "input_json_delta", "partial_json": "{\"path\":" } }),
            json!({ "type": "content_block_delta", "index": 2, "delta": { "type": "input_json_delta", "partial_json": "\"a.md\"}" } }),
            json!({ "type": "content_block_stop", "index": 2 }),
            json!({ "type": "message_delta", "delta": { "stop_reason": "tool_use" }, "usage": { "output_tokens": 7 } }),
        ] {
            accumulator.apply(&event, &mut emit);
        }
        let response = accumulator.finish("claude-x").unwrap();
        assert_eq!(response.reasoning, "hmm");
        assert_eq!(response.content, "Reading");
        assert_eq!(response.tool_calls[0].arguments["path"], "a.md");
        assert_eq!(response.stop_reason, "tool_use");
        let raw = response.raw.unwrap();
        assert_eq!(raw[0]["signature"], "sig");
        assert_eq!(raw[2]["input"]["path"], "a.md");
    }

    #[test]
    fn accumulates_ollama_chunks() {
        let mut accumulator = OllamaAccumulator::default();
        let mut emit = |_event: TurnEvent| {};
        accumulator.apply(&json!({ "message": { "role": "assistant", "content": "", "thinking": "plan" }, "done": false }), &mut emit);
        accumulator.apply(&json!({ "message": { "role": "assistant", "content": "", "tool_calls": [{ "function": { "name": "list_files", "arguments": { "type": "pdf" } } }] }, "done": false }), &mut emit);
        accumulator.apply(&json!({ "message": { "role": "assistant", "content": "" }, "done": true, "done_reason": "stop", "prompt_eval_count": 3, "eval_count": 4 }), &mut emit);
        let response = accumulator.finish("qwen3", &mut emit).unwrap();
        assert_eq!(response.reasoning, "plan");
        assert_eq!(response.tool_calls[0].id, "call_1");
        assert_eq!(response.tool_calls[0].arguments["type"], "pdf");
        assert_eq!(response.stop_reason, "tool_use");
    }

    #[test]
    fn chooses_anthropic_thinking_modes() {
        assert_eq!(claude_version("claude-sonnet-4-5-20250929"), Some((4, 5)));
        assert_eq!(claude_version("claude-opus-5-5"), Some((5, 5)));
        assert_eq!(claude_version("claude-3-7-sonnet-20250219"), Some((3, 7)));
        assert_eq!(
            anthropic_thinking("claude-opus-5-5", "high", 8192)
                .unwrap()
                .0["type"],
            "adaptive"
        );
        assert_eq!(
            anthropic_thinking("claude-fable-5-1", "high", 8192)
                .unwrap()
                .0["type"],
            "adaptive"
        );
        let (config, tokens) = anthropic_thinking("claude-sonnet-4-5", "medium", 4096).unwrap();
        assert_eq!(config["budget_tokens"], 8192);
        assert!(tokens > 8192);
        assert!(anthropic_thinking("claude-3-5-haiku-20241022", "high", 4096).is_none());
    }

    #[test]
    fn classifies_unsupported_features() {
        assert!(classify_error(
            "Ollama",
            400,
            r#"{"error":"registry.ollama.ai/library/gemma2 does not support tools"}"#,
            true,
            false
        )
        .starts_with(TOOLS_UNSUPPORTED));
        assert!(classify_error(
            "Groq",
            400,
            r#"{"error":{"message":"image input is not supported for this model"}}"#,
            false,
            true
        )
        .starts_with(VISION_UNSUPPORTED));
        assert!(classify_error(
            "OpenAI",
            401,
            r#"{"error":{"message":"bad key"}}"#,
            true,
            true
        )
        .contains("HTTP 401"));
    }

    #[test]
    fn reads_lines_across_chunks() {
        let mut reader = LineReader::new();
        assert!(reader.push(b"data: {\"a\"").is_empty());
        let lines = reader.push(":1}\n\ndata: [DONE]\n".as_bytes());
        assert_eq!(lines, vec!["data: {\"a\":1}", "", "data: [DONE]"]);
        let persian = "data: سلام\n".as_bytes();
        let (head, tail) = persian.split_at(8);
        assert!(reader.push(head).is_empty());
        assert_eq!(reader.push(tail), vec!["data: سلام"]);
    }
}
