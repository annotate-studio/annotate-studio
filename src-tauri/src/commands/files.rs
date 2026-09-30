use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use crate::filesystem::{describe, list_study_files, FileType, StudyFile};
use crate::paths::{
    sanitize_file_name, sanitize_stem, split_name, unique_in_dir, DOCUMENTS_DIR, NOTES_DIR,
};
use crate::state::AppState;
use crate::storage::write_atomic;
use crate::text::{bytes_look_binary, text_from_file};

fn io_error(path: &str, err: std::io::Error) -> String {
    match err.kind() {
        std::io::ErrorKind::NotFound => format!("File not found: {path}"),
        std::io::ErrorKind::PermissionDenied => format!("Permission denied: {path}"),
        _ => format!("Could not access {path}: {err}"),
    }
}

fn describe_or_err(state: &AppState, path: &Path) -> Result<StudyFile, String> {
    describe(&state.workspace, path)
        .ok_or_else(|| format!("Could not read file information for {}", path.display()))
}

#[tauri::command(async)]
pub fn list_workspace_files(state: State<'_, AppState>) -> Result<Vec<StudyFile>, String> {
    list_study_files(&state.workspace)
}

#[tauri::command(async)]
pub fn stat_workspace_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<Option<StudyFile>, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    Ok(describe(&state.workspace, &full))
}

#[tauri::command(async)]
pub fn read_text_file(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let bytes = std::fs::read(&full).map_err(|e| io_error(&path, e))?;
    text_from_file(&full, &bytes).ok_or_else(|| format!("{path} does not contain readable text"))
}

#[derive(Serialize)]
pub struct NoteText {
    content: String,
    editable: bool,
}

fn decode_note(bytes: &[u8]) -> Option<NoteText> {
    let body = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    if bytes_look_binary(body) {
        return None;
    }
    Some(match std::str::from_utf8(body) {
        Ok(text) => NoteText {
            content: text.to_string(),
            editable: true,
        },
        Err(_) => NoteText {
            content: String::from_utf8_lossy(body).into_owned(),
            editable: false,
        },
    })
}

#[tauri::command(async)]
pub fn read_note(state: State<'_, AppState>, path: String) -> Result<NoteText, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let bytes = std::fs::read(&full).map_err(|e| io_error(&path, e))?;
    decode_note(&bytes).ok_or_else(|| format!("{path} does not contain readable text"))
}

#[tauri::command(async)]
pub fn write_text_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<StudyFile, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    write_atomic(&full, content.as_bytes())?;
    describe_or_err(&state, &full)
}

fn strip_extension_ignore_case<'a>(name: &'a str, ext: &str) -> Option<&'a str> {
    let suffix_len = ext.len() + 1;
    if name.len() <= suffix_len || !name.is_char_boundary(name.len() - suffix_len) {
        return None;
    }
    let (stem, suffix) = name.split_at(name.len() - suffix_len);
    (suffix.starts_with('.') && suffix[1..].eq_ignore_ascii_case(ext)).then_some(stem)
}

fn same_file(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match (std::fs::metadata(a), std::fs::metadata(b)) {
            (Ok(x), Ok(y)) => x.dev() == y.dev() && x.ino() == y.ino(),
            _ => false,
        }
    }
    #[cfg(not(unix))]
    {
        match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
            (Ok(x), Ok(y)) => x == y,
            _ => false,
        }
    }
}

#[tauri::command(async)]
pub fn create_note(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> Result<StudyFile, String> {
    let requested = name.trim();
    let stem = strip_extension_ignore_case(requested, "md")
        .or_else(|| strip_extension_ignore_case(requested, "markdown"))
        .unwrap_or(requested);
    let file_name = format!("{}.md", sanitize_stem(stem));
    let dir = state.workspace.resolve(NOTES_DIR)?;
    let target = unique_in_dir(&dir, &file_name);
    write_atomic(&target, content.as_bytes())?;
    describe_or_err(&state, &target)
}

#[tauri::command(async)]
pub fn rename_workspace_file(
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> Result<StudyFile, String> {
    let from = state.workspace.resolve_user_file(&path)?;
    if !from.is_file() {
        return Err(format!("File not found: {path}"));
    }
    let parent = from
        .parent()
        .ok_or_else(|| "Invalid file location".to_string())?;
    let current_name = from
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let requested = new_name.trim();
    let name = match split_name(&current_name).1 {
        Some(ext) => {
            let stem = strip_extension_ignore_case(requested, &ext).unwrap_or(requested);
            format!("{}.{ext}", sanitize_stem(stem))
        }
        None => sanitize_file_name(requested),
    };
    if name == current_name {
        return describe_or_err(&state, &from);
    }
    let direct = parent.join(&name);
    let target = if !direct.exists() || same_file(&from, &direct) {
        direct
    } else {
        unique_in_dir(parent, &name)
    };
    std::fs::rename(&from, &target).map_err(|e| io_error(&path, e))?;
    describe_or_err(&state, &target)
}

#[tauri::command(async)]
pub fn delete_workspace_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let full = state.workspace.resolve_user_file(&path)?;
    if full.is_file() {
        std::fs::remove_file(&full).map_err(|e| io_error(&path, e))?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn read_file_bytes(state: State<'_, AppState>, path: String) -> Result<Response, String> {
    let full = state.workspace.resolve_user_file(&path)?;
    let bytes = std::fs::read(&full).map_err(|e| io_error(&path, e))?;
    Ok(Response::new(bytes))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteTarget {
    path: Option<String>,
    dir: Option<String>,
    name: Option<String>,
    #[serde(default)]
    unique: bool,
}

fn decode_frame(body: &[u8]) -> Result<(WriteTarget, &[u8]), String> {
    if body.len() < 4 {
        return Err("Malformed binary payload".into());
    }
    let header_len = u32::from_le_bytes([body[0], body[1], body[2], body[3]]) as usize;
    let data_start = 4usize
        .checked_add(header_len)
        .filter(|end| *end <= body.len())
        .ok_or_else(|| "Malformed binary payload".to_string())?;
    let target: WriteTarget = serde_json::from_slice(&body[4..data_start])
        .map_err(|e| format!("Malformed payload header: {e}"))?;
    Ok((target, &body[data_start..]))
}

#[tauri::command]
pub async fn write_file_bytes(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<StudyFile, String> {
    let InvokeBody::Raw(body) = request.body() else {
        return Err("Expected a binary payload".into());
    };
    let (target, data) = decode_frame(body)?;
    let full = match (target.path, target.dir, target.name) {
        (Some(path), _, _) => state.workspace.resolve_user_file(&path)?,
        (None, Some(dir), Some(name)) => {
            let dir_path = state.workspace.resolve_user_file(&dir)?;
            let file_name = sanitize_file_name(&name);
            if target.unique {
                unique_in_dir(&dir_path, &file_name)
            } else {
                dir_path.join(file_name)
            }
        }
        _ => return Err("The write target is missing".into()),
    };
    write_atomic(&full, data)?;
    describe_or_err(&state, &full)
}

fn same_content(a: &Path, b: &Path) -> bool {
    let (Ok(meta_a), Ok(meta_b)) = (std::fs::metadata(a), std::fs::metadata(b)) else {
        return false;
    };
    if meta_a.len() != meta_b.len() {
        return false;
    }
    let (Ok(file_a), Ok(file_b)) = (std::fs::File::open(a), std::fs::File::open(b)) else {
        return false;
    };
    let mut reader_a = std::io::BufReader::new(file_a);
    let mut reader_b = std::io::BufReader::new(file_b);
    let mut buf_a = vec![0u8; 64 * 1024];
    let mut buf_b = vec![0u8; 64 * 1024];
    loop {
        let read_a = match reader_a.read(&mut buf_a) {
            Ok(n) => n,
            Err(_) => return false,
        };
        if read_a == 0 {
            return true;
        }
        if reader_b.read_exact(&mut buf_b[..read_a]).is_err() || buf_a[..read_a] != buf_b[..read_a]
        {
            return false;
        }
    }
}

fn import_one(state: &AppState, source: &Path) -> Result<StudyFile, String> {
    let display = source.display().to_string();
    if !source.is_file() {
        return Err(format!("Not a file: {display}"));
    }
    let file_type = FileType::from_path(source);
    if file_type == FileType::Unknown {
        return Err(format!("Unsupported file type: {display}"));
    }
    if let Some(relative) = state.workspace.relative(source) {
        if relative.starts_with(&format!("{DOCUMENTS_DIR}/"))
            || relative.starts_with(&format!("{NOTES_DIR}/"))
        {
            return describe_or_err(state, source);
        }
    }
    let dir = state.workspace.resolve(file_type.default_dir())?;
    std::fs::create_dir_all(&dir).map_err(|e| io_error(&display, e))?;
    let name = sanitize_file_name(
        &source
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    );
    let existing = dir.join(&name);
    if existing.is_file() && same_content(source, &existing) {
        return describe_or_err(state, &existing);
    }
    let target = unique_in_dir(&dir, &name);
    std::fs::copy(source, &target).map_err(|e| io_error(&display, e))?;
    describe_or_err(state, &target)
}

#[tauri::command(async)]
pub fn import_files(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<StudyFile>, String> {
    let mut imported = Vec::new();
    let mut errors = Vec::new();
    for raw in paths {
        match import_one(&state, &PathBuf::from(&raw)) {
            Ok(file) => imported.push(file),
            Err(err) => errors.push(err),
        }
    }
    if imported.is_empty() && !errors.is_empty() {
        return Err(errors.join("\n"));
    }
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(header: &str, data: &[u8]) -> Vec<u8> {
        let mut out = (header.len() as u32).to_le_bytes().to_vec();
        out.extend_from_slice(header.as_bytes());
        out.extend_from_slice(data);
        out
    }

    #[test]
    fn decodes_framed_payloads() {
        let body = frame(
            r#"{"dir":"documents","name":"a.pdf","unique":true}"#,
            b"%PDF-1.7",
        );
        let (target, data) = decode_frame(&body).unwrap();
        assert_eq!(target.dir.as_deref(), Some("documents"));
        assert!(target.unique);
        assert_eq!(data, b"%PDF-1.7");
    }

    #[test]
    fn rejects_truncated_payloads() {
        assert!(decode_frame(&[1, 0]).is_err());
        let mut body = frame(r#"{"path":"x"}"#, b"");
        body.truncate(6);
        assert!(decode_frame(&body).is_err());
    }

    #[test]
    fn strips_matching_extensions_only() {
        assert_eq!(strip_extension_ignore_case("Notes.MD", "md"), Some("Notes"));
        assert_eq!(strip_extension_ignore_case("Lecture 3.2", "md"), None);
        assert_eq!(strip_extension_ignore_case(".md", "md"), None);
        assert_eq!(strip_extension_ignore_case("جزوه.pdf", "pdf"), Some("جزوه"));
    }

    #[test]
    fn decodes_notes_and_flags_other_encodings() {
        let utf8 = decode_note("\u{feff}سلام\r\nworld".as_bytes()).unwrap();
        assert!(utf8.editable);
        assert_eq!(utf8.content, "سلام\r\nworld");
        let latin1 = decode_note(b"caf\xe9 cr\xe8me").unwrap();
        assert!(!latin1.editable);
        assert!(decode_note(&[0u8, 1, 2, 3, 4, 5, 6, 7]).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn detects_the_same_file() {
        let dir = std::env::temp_dir().join(format!("annotate-same-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("Physics.md");
        let b = dir.join("physics.md");
        std::fs::write(&a, b"a").unwrap();
        std::fs::write(&b, b"b").unwrap();
        assert!(same_file(&a, &a));
        assert!(!same_file(&a, &b));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn compares_file_contents() {
        let dir = std::env::temp_dir().join(format!("annotate-cmp-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a");
        let b = dir.join("b");
        let c = dir.join("c");
        std::fs::write(&a, vec![7u8; 200_000]).unwrap();
        std::fs::write(&b, vec![7u8; 200_000]).unwrap();
        let mut other = vec![7u8; 200_000];
        other[150_000] = 8;
        std::fs::write(&c, other).unwrap();
        assert!(same_content(&a, &b));
        assert!(!same_content(&a, &c));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
