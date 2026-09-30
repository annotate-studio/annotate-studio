use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_fs::FsExt;
use zip::write::SimpleFileOptions;

use crate::state::{lock_error, AppState};

const DATA_FILES: [&str; 9] = [
    "flashcards.json",
    "collections.json",
    "exams_data.json",
    "providers.json",
    "chat_sessions.json",
    "motivation_sessions.json",
    "settings.json",
    "canvas/state.json",
    "card_qualities.json",
];

const DATA_DIRS: [&str; 3] = ["documents", "notes", "analytics"];
const MAX_ENTRIES: usize = 50_000;
const MAX_ENTRY_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024 * 1024;

type Entries = Vec<(usize, PathBuf)>;

fn is_allowed_entry(relative: &Path) -> bool {
    let normal: Vec<String> = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    if normal.is_empty() || normal.len() != relative.components().count() {
        return false;
    }
    let joined = normal.join("/");
    DATA_FILES.contains(&joined.as_str())
        || (normal.len() >= 2
            && DATA_DIRS.contains(&normal[0].as_str())
            && !normal.iter().any(|p| p.starts_with('.')))
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_files(root, &path, out);
        } else if path.is_file() && path.strip_prefix(root).is_ok() {
            out.push(path);
        }
    }
}

fn write_archive(root: &Path, output: &Path) -> Result<usize, String> {
    let mut files: Vec<PathBuf> = DATA_FILES
        .iter()
        .map(|name| root.join(name))
        .filter(|path| path.is_file())
        .collect();
    for dir in DATA_DIRS {
        collect_files(root, &root.join(dir), &mut files);
    }

    let parent = output
        .parent()
        .ok_or_else(|| "Invalid output location".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = output.with_extension("anos.partial");
    let result = (|| -> Result<usize, String> {
        let file = std::fs::File::create(&temp)
            .map_err(|e| format!("Could not create {}: {e}", temp.display()))?;
        let mut zip = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut count = 0;
        for path in &files {
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let name = relative
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            let data = std::fs::read(path)
                .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
            count += 1;
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(count)
    })();
    match result {
        Ok(count) => {
            std::fs::rename(&temp, output)
                .map_err(|e| format!("Could not save {}: {e}", output.display()))?;
            Ok(count)
        }
        Err(err) => {
            let _ = std::fs::remove_file(&temp);
            Err(err)
        }
    }
}

fn open_backup(path: &Path) -> Result<(zip::ZipArchive<std::fs::File>, Entries), String> {
    let file = std::fs::File::open(path).map_err(|e| format!("Could not open the backup: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("This is not a valid backup file: {e}"))?;
    if archive.len() > MAX_ENTRIES {
        return Err("The backup contains too many files".into());
    }
    let mut entries = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        if let Some(relative) = entry.enclosed_name().filter(|p| is_allowed_entry(p)) {
            entries.push((index, relative));
        }
    }
    if entries.is_empty() {
        return Err("The backup does not contain any Annotate Studio data".into());
    }
    Ok((archive, entries))
}

fn extract_entries(
    archive: &mut zip::ZipArchive<std::fs::File>,
    entries: &Entries,
    staging: &Path,
) -> Result<(), String> {
    let mut total: u64 = 0;
    for (index, relative) in entries {
        let entry = archive.by_index(*index).map_err(|e| e.to_string())?;
        if entry.size() > MAX_ENTRY_BYTES {
            return Err(format!("{} is too large to restore", relative.display()));
        }
        let target = staging.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut output = std::fs::File::create(&target)
            .map_err(|e| format!("Could not restore {}: {e}", relative.display()))?;
        let mut limited = entry.take(MAX_ENTRY_BYTES + 1);
        let copied = std::io::copy(&mut limited, &mut output)
            .map_err(|e| format!("Could not restore {}: {e}", relative.display()))?;
        if copied > MAX_ENTRY_BYTES {
            return Err(format!("{} is too large to restore", relative.display()));
        }
        total = total.saturating_add(copied);
        if total > MAX_TOTAL_BYTES {
            return Err("The backup is too large to restore".into());
        }
        output.sync_all().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn move_into_place(staging: &Path, root: &Path, entries: &Entries) -> Result<usize, String> {
    for (_, relative) in entries {
        let target = root.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(staging.join(relative), &target)
            .map_err(|e| format!("Could not restore {}: {e}", relative.display()))?;
    }
    Ok(entries.len())
}

fn staging_dir(root: &Path) -> PathBuf {
    root.join(format!(".restore-{}", uuid::Uuid::new_v4().simple()))
}

fn restore_archive(archive_path: &Path, root: &Path) -> Result<usize, String> {
    let (mut archive, entries) = open_backup(archive_path)?;
    let staging = staging_dir(root);
    let result = extract_entries(&mut archive, &entries, &staging)
        .and_then(|_| move_into_place(&staging, root, &entries));
    let _ = std::fs::remove_dir_all(&staging);
    result
}

fn picked_path(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw.trim());
    if path.as_os_str().is_empty() {
        return Err("Choose a backup file first".into());
    }
    if !app.fs_scope().is_allowed(&path) {
        return Err("Choose the backup file with the file picker".into());
    }
    Ok(path)
}

#[tauri::command(async)]
pub fn export_data(
    app: AppHandle,
    state: State<'_, AppState>,
    output_path: String,
) -> Result<usize, String> {
    let output = picked_path(&app, &output_path)?;
    write_archive(state.workspace.root(), &output)
}

#[tauri::command(async)]
pub fn import_data(
    app: AppHandle,
    state: State<'_, AppState>,
    archive_path: String,
) -> Result<usize, String> {
    let source = picked_path(&app, &archive_path)?;
    let root = state.workspace.root().to_path_buf();
    let staging = staging_dir(&root);
    let result = (|| -> Result<usize, String> {
        let (mut archive, entries) = open_backup(&source)?;
        extract_entries(&mut archive, &entries, &staging)?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let safety = state
            .paths
            .backups_dir
            .join(format!("before-import-{stamp}.anos"));
        write_archive(&root, &safety)
            .map_err(|e| format!("Could not back up the current data before importing: {e}"))?;
        let mut engine = state.flashcards.lock().map_err(lock_error)?;
        let outcome = move_into_place(&staging, &root, &entries).map_err(|err| {
            match restore_archive(&safety, &root) {
                Ok(_) => format!("{err}. Your previous data was put back."),
                Err(restore) => format!(
                    "{err}. Putting the previous data back also failed ({restore}); a copy is in {}",
                    safety.display()
                ),
            }
        });
        engine.reload();
        outcome
    })();
    let _ = std::fs::remove_dir_all(&staging);
    let reloaded = state.reload();
    let count = result?;
    reloaded?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_archive_entries() {
        assert!(is_allowed_entry(Path::new("flashcards.json")));
        assert!(is_allowed_entry(Path::new("canvas/state.json")));
        assert!(is_allowed_entry(Path::new("documents/a.pdf")));
        assert!(is_allowed_entry(Path::new("notes/sub/b.md")));
        assert!(!is_allowed_entry(Path::new("documents")));
        assert!(!is_allowed_entry(Path::new("random.txt")));
        assert!(!is_allowed_entry(Path::new("../evil")));
        assert!(!is_allowed_entry(Path::new("notes/.hidden")));
        assert!(!is_allowed_entry(Path::new("/etc/passwd")));
    }

    #[test]
    fn restores_archives_through_a_staging_folder() {
        let root = std::env::temp_dir().join(format!("annotate-restore-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::write(root.join("flashcards.json"), b"[1]").unwrap();
        std::fs::write(root.join("notes").join("a.md"), b"old").unwrap();
        let archive = root.join("backup.anos");
        write_archive(&root, &archive).unwrap();
        std::fs::write(root.join("flashcards.json"), b"[2]").unwrap();
        std::fs::write(root.join("notes").join("a.md"), b"new").unwrap();
        assert_eq!(restore_archive(&archive, &root).unwrap(), 2);
        assert_eq!(std::fs::read(root.join("flashcards.json")).unwrap(), b"[1]");
        assert_eq!(
            std::fs::read(root.join("notes").join("a.md")).unwrap(),
            b"old"
        );
        let leftovers = std::fs::read_dir(&root)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().starts_with(".restore-"))
            .count();
        assert_eq!(leftovers, 0);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_archives_without_app_data() {
        let root = std::env::temp_dir().join(format!("annotate-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("other.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        zip.start_file("readme.txt", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"hello").unwrap();
        zip.finish().unwrap();
        assert!(open_backup(&path).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn round_trips_archives() {
        let root = std::env::temp_dir().join(format!("annotate-backup-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("documents")).unwrap();
        std::fs::create_dir_all(root.join("canvas")).unwrap();
        std::fs::write(root.join("flashcards.json"), b"[]").unwrap();
        std::fs::write(root.join("canvas").join("state.json"), b"{}").unwrap();
        std::fs::write(root.join("documents").join("a.pdf"), b"%PDF").unwrap();
        std::fs::write(root.join("secret.txt"), b"no").unwrap();
        let output = root.join("out").join("backup.anos");
        assert_eq!(write_archive(&root, &output).unwrap(), 3);
        let mut archive = zip::ZipArchive::new(std::fs::File::open(&output).unwrap()).unwrap();
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["canvas/state.json", "documents/a.pdf", "flashcards.json"]
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
