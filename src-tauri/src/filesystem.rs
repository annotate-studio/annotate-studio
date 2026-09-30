use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::paths::{extension_of, Workspace, DOCUMENTS_DIR, NOTES_DIR};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum FileType {
    Pdf,
    Markdown,
    Text,
    Image,
    Document,
    Unknown,
}

impl FileType {
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "pdf" => FileType::Pdf,
            "md" | "markdown" | "mdx" => FileType::Markdown,
            "txt" | "text" => FileType::Text,
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" => FileType::Image,
            "docx" | "odt" => FileType::Document,
            _ => FileType::Unknown,
        }
    }

    pub fn from_path(path: &Path) -> Self {
        Self::from_extension(&extension_of(path))
    }

    pub fn default_dir(self) -> &'static str {
        match self {
            FileType::Markdown | FileType::Text => NOTES_DIR,
            _ => DOCUMENTS_DIR,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct StudyFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub file_type: FileType,
    pub size: u64,
    pub created_at: String,
    pub modified_at: String,
}

fn to_rfc3339(time: std::io::Result<std::time::SystemTime>) -> String {
    time.map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
        .unwrap_or_default()
}

pub fn describe(workspace: &Workspace, path: &Path) -> Option<StudyFile> {
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let relative = workspace.relative(path)?;
    let modified_at = to_rfc3339(metadata.modified());
    let created = to_rfc3339(metadata.created());
    Some(StudyFile {
        id: relative.clone(),
        name: path.file_name()?.to_string_lossy().into_owned(),
        path: relative,
        file_type: FileType::from_path(path),
        size: metadata.len(),
        created_at: if created.is_empty() {
            modified_at.clone()
        } else {
            created
        },
        modified_at,
    })
}

pub fn list_dir(workspace: &Workspace, subdirectory: &str) -> Result<Vec<StudyFile>, String> {
    let dir = workspace.resolve(subdirectory)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("Failed to read {}: {e}", dir.display()))?;
    let mut files: Vec<StudyFile> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|entry| describe(workspace, &entry.path()))
        .filter(|file| file.file_type != FileType::Unknown)
        .collect();
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(files)
}

pub fn list_study_files(workspace: &Workspace) -> Result<Vec<StudyFile>, String> {
    let mut all = list_dir(workspace, DOCUMENTS_DIR)?;
    all.extend(list_dir(workspace, NOTES_DIR)?);
    all.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(all)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_extensions_to_types() {
        assert_eq!(FileType::from_extension("PDF"), FileType::Pdf);
        assert_eq!(FileType::from_extension("md"), FileType::Markdown);
        assert_eq!(FileType::from_extension("jpeg"), FileType::Image);
        assert_eq!(FileType::from_extension("docx"), FileType::Document);
        assert_eq!(FileType::from_extension("exe"), FileType::Unknown);
        assert_eq!(FileType::Markdown.default_dir(), NOTES_DIR);
        assert_eq!(FileType::Pdf.default_dir(), DOCUMENTS_DIR);
    }

    #[test]
    fn lists_files_with_relative_paths() {
        let root = std::env::temp_dir().join(format!("annotate-fs-{}", uuid::Uuid::new_v4()));
        let workspace = Workspace::new(root.clone());
        workspace.ensure().unwrap();
        std::fs::write(root.join("documents").join("a.pdf"), b"%PDF").unwrap();
        std::fs::write(root.join("notes").join("b.md"), b"# b").unwrap();
        std::fs::write(root.join("notes").join(".b.md.tmp"), b"x").unwrap();
        std::fs::write(root.join("documents").join("c.exe"), b"x").unwrap();
        let files = list_study_files(&workspace).unwrap();
        let mut paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
        paths.sort();
        assert_eq!(
            paths,
            vec!["documents/a.pdf".to_string(), "notes/b.md".to_string()]
        );
        assert!(files.iter().all(|f| f.id == f.path));
        std::fs::remove_dir_all(root).unwrap();
    }
}
