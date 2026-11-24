use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub url: String,
    #[serde(default = "default_true")]
    pub bypass_local: bool,
}

fn default_true() -> bool {
    true
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            url: String::new(),
            bypass_local: true,
        }
    }
}

static CONFIG: OnceLock<RwLock<ProxyConfig>> = OnceLock::new();

fn store() -> &'static RwLock<ProxyConfig> {
    CONFIG.get_or_init(|| RwLock::new(ProxyConfig::default()))
}

pub fn current() -> ProxyConfig {
    store().read().map(|g| g.clone()).unwrap_or_default()
}

pub fn set(config: ProxyConfig) {
    if let Ok(mut guard) = store().write() {
        *guard = config;
    }
}

pub fn update_from_settings(settings: &Value) {
    let parsed = settings
        .get("proxy")
        .and_then(|v| serde_json::from_value::<ProxyConfig>(v.clone()).ok())
        .unwrap_or_default();
    set(parsed);
}

pub fn build_http_client(timeout_secs: Option<u64>, connect_timeout_secs: u64) -> Client {
    build_client_inner(timeout_secs, None, connect_timeout_secs)
}

pub fn build_streaming_client() -> Client {
    build_client_inner(None, Some(300), 20)
}

fn build_client_inner(
    timeout_secs: Option<u64>,
    read_timeout_secs: Option<u64>,
    connect_timeout_secs: u64,
) -> Client {
    let cfg = current();
    let mut builder = Client::builder().connect_timeout(Duration::from_secs(connect_timeout_secs));
    if let Some(secs) = timeout_secs {
        builder = builder.timeout(Duration::from_secs(secs));
    }
    if let Some(secs) = read_timeout_secs {
        builder = builder.read_timeout(Duration::from_secs(secs));
    }
    if cfg.enabled {
        let trimmed = cfg.url.trim();
        if !trimmed.is_empty() {
            if let Ok(mut proxy) = reqwest::Proxy::all(trimmed) {
                if cfg.bypass_local {
                    proxy = proxy.no_proxy(reqwest::NoProxy::from_string(
                        "localhost,127.0.0.1,::1,0.0.0.0",
                    ));
                }
                builder = builder.proxy(proxy);
            }
        }
    }
    builder.build().unwrap_or_else(|_| Client::new())
}
