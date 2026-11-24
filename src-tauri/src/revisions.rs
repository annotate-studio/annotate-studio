use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::storage::{read_json_or_default, write_atomic, write_json};

const TEXT_MAX_REVISIONS: usize = 60;
const BINARY_MAX_REVISIONS: usize = 6;
const LARGE_FILE_THRESHOLD: usize = 2 * 1024 * 1024;
const AUTOSAVE_COOLDOWN_SECS: i64 = 45;
const ZSTD_LEVEL: i32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionEntry {
    pub id: String,
    pub hash: String,
    pub timestamp: i64,
    pub size: usize,
    pub stored_size: usize,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct RevisionManifest {
    #[serde(default)]
    files: HashMap<String, Vec<RevisionEntry>>,
}

pub struct RevisionStore {
    root: PathBuf,
    objects_dir: PathBuf,
    manifest_path: PathBuf,
    manifest: RevisionManifest,
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write;
        let _ = write!(&mut out, "{b:02x}");
    }
    out
}

impl RevisionStore {
    pub fn load(root: PathBuf) -> Self {
        let objects_dir = root.join("objects");
        let manifest_path = root.join("index.json");
        let _ = std::fs::create_dir_all(&objects_dir);
        let manifest = read_json_or_default(&manifest_path);
        Self {
            root,
            objects_dir,
            manifest_path,
            manifest,
        }
    }

    pub fn reload(&mut self) {
        let _ = std::fs::create_dir_all(&self.objects_dir);
        self.manifest = read_json_or_default(&self.manifest_path);
    }

    fn object_path(&self, hash: &str) -> PathBuf {
        self.objects_dir.join(format!("{hash}.zst"))
    }

    fn save_manifest(&self) -> Result<(), String> {
        let _ = std::fs::create_dir_all(&self.root);
        write_json(&self.manifest_path, &self.manifest)
    }

    pub fn record(
        &mut self,
        rel_path: &str,
        bytes: &[u8],
        source: &str,
        summary: Option<String>,
    ) -> Result<Option<RevisionEntry>, String> {
        let hash = sha256_hex(bytes);
        let now = Utc::now().timestamp_millis();
        if let Some(last) = self.manifest.files.get(rel_path).and_then(|l| l.last()) {
            if last.hash == hash {
                return Ok(None);
            }
            if source == "autosave"
                && last.source == "autosave"
                && (now - last.timestamp) < AUTOSAVE_COOLDOWN_SECS * 1000
            {
                return Ok(None);
            }
        }

        let obj_path = self.object_path(&hash);
        let stored_size = if obj_path.exists() {
            std::fs::metadata(&obj_path)
                .map(|m| m.len() as usize)
                .unwrap_or(bytes.len())
        } else {
            let compressed = zstd::bulk::compress(bytes, ZSTD_LEVEL)
                .map_err(|e| format!("Failed to compress revision: {e}"))?;
            let len = compressed.len();
            write_atomic(&obj_path, &compressed)?;
            len
        };

        let entry = RevisionEntry {
            id: Uuid::new_v4().to_string(),
            hash,
            timestamp: now,
            size: bytes.len(),
            stored_size,
            source: source.to_string(),
            summary,
        };
        let list = self.manifest.files.entry(rel_path.to_string()).or_default();
        list.push(entry.clone());

        let limit = if bytes.len() >= LARGE_FILE_THRESHOLD {
            BINARY_MAX_REVISIONS
        } else {
            TEXT_MAX_REVISIONS
        };
        let mut pruned = false;
        while list.len() > limit {
            list.remove(0);
            pruned = true;
        }

        self.save_manifest()?;
        if pruned {
            self.gc_objects();
        }
        Ok(Some(entry))
    }

    pub fn list(&self, rel_path: &str) -> Vec<RevisionEntry> {
        let mut items = self
            .manifest
            .files
            .get(rel_path)
            .cloned()
            .unwrap_or_default();
        items.reverse();
        items
    }

    pub fn read(&self, rel_path: &str, revision_id: &str) -> Result<Vec<u8>, String> {
        let entry = self
            .manifest
            .files
            .get(rel_path)
            .and_then(|list| list.iter().find(|r| r.id == revision_id))
            .ok_or_else(|| format!("Revision not found: {revision_id}"))?;
        let obj_path = self.object_path(&entry.hash);
        let compressed = std::fs::read(&obj_path)
            .map_err(|e| format!("Could not read revision object: {e}"))?;
        zstd::stream::decode_all(&compressed[..])
            .map_err(|e| format!("Could not decompress revision: {e}"))
    }

    pub fn rename(&mut self, old_path: &str, new_path: &str) {
        if let Some(entries) = self.manifest.files.remove(old_path) {
            self.manifest.files.insert(new_path.to_string(), entries);
            let _ = self.save_manifest();
        }
    }

    pub fn remove_file(&mut self, rel_path: &str) {
        if self.manifest.files.remove(rel_path).is_some() {
            let _ = self.save_manifest();
            self.gc_objects();
        }
    }

    fn gc_objects(&self) {
        let referenced: HashSet<&str> = self
            .manifest
            .files
            .values()
            .flat_map(|list| list.iter().map(|entry| entry.hash.as_str()))
            .collect();
        let Ok(read_dir) = std::fs::read_dir(&self.objects_dir) else {
            return;
        };
        for item in read_dir.flatten() {
            let path = item.path();
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                if !referenced.contains(stem) {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
}

pub fn revisions_dir(workspace_root: &Path) -> PathBuf {
    workspace_root.join("revisions")
}
