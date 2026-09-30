use serde::de::DeserializeOwned;
use serde::Serialize;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_atomic_with(path: &Path, bytes: &[u8], private: bool) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid path: {}", path.display()))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    let temp = parent.join(format!(
        ".tmp-{}-{}",
        std::process::id(),
        TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        if private {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        #[cfg(not(unix))]
        let _ = private;
        let mut file = options.open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if let Err(err) = result {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Failed to write {}: {err}", path.display()));
    }
    Ok(())
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic_with(path, bytes, false)
}

pub fn write_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_atomic(path, &json)
}

pub fn write_private_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_atomic_with(path, &json, true)
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let data = std::fs::read(path).ok()?;
    if data.iter().all(|b| b.is_ascii_whitespace()) {
        return None;
    }
    match serde_json::from_slice(&data) {
        Ok(value) => Some(value),
        Err(_) => {
            quarantine(path);
            None
        }
    }
}

pub fn read_json_or_default<T: DeserializeOwned + Default>(path: &Path) -> T {
    read_json(path).unwrap_or_default()
}

fn quarantine(path: &Path) {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".into());
    let backup = path.with_file_name(format!("{file_name}.corrupt-{stamp}"));
    let _ = std::fs::copy(path, backup);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_reads_json_atomically() {
        let dir = std::env::temp_dir().join(format!("annotate-storage-{}", uuid::Uuid::new_v4()));
        let path = dir.join("nested").join("data.json");
        write_json(&path, &vec![1, 2, 3]).unwrap();
        let loaded: Vec<i32> = read_json(&path).unwrap();
        assert_eq!(loaded, vec![1, 2, 3]);
        write_json(&path, &vec![4]).unwrap();
        let loaded: Vec<i32> = read_json(&path).unwrap();
        assert_eq!(loaded, vec![4]);
        let leftovers: Vec<_> = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().starts_with(".tmp-"))
            .collect();
        assert!(leftovers.is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn writes_private_files_for_secrets() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("annotate-storage-{}", uuid::Uuid::new_v4()));
        let path = dir.join("providers.json");
        write_private_json(&path, &vec!["key"]).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn quarantines_corrupted_json() {
        let dir = std::env::temp_dir().join(format!("annotate-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("broken.json");
        std::fs::write(&path, b"{not json").unwrap();
        let loaded: Option<Vec<i32>> = read_json(&path);
        assert!(loaded.is_none());
        let backups = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"))
            .count();
        assert_eq!(backups, 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
