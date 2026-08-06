use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum FileType {
    Pdf,
    Markdown,
    StickyNote,
    Image,
    Unknown,
}

impl FileType {
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "pdf" => FileType::Pdf,
            "md" | "markdown" | "mdx" => FileType::Markdown,
            "txt" => FileType::StickyNote,
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => FileType::Image,
            _ => FileType::Unknown,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudyFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub file_type: FileType,
    pub created_at: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CanvasItem {
    pub id: String,
    pub file_id: Option<String>,
    pub item_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub content: Option<String>,
}

pub struct FileSystem {
    workspace_root: PathBuf,
}

impl FileSystem {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    pub fn ensure_workspace(&self) -> Result<(), std::io::Error> {
        let dirs = ["documents", "notes", "flashcards", "index", "canvas"];
        for dir in dirs {
            std::fs::create_dir_all(self.workspace_root.join(dir))?;
        }
        Ok(())
    }

    pub fn save_file(&self, content: &[u8], relative_path: &str) -> Result<PathBuf, std::io::Error> {
        let path = self.workspace_root.join(relative_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, content)?;
        Ok(path)
    }

    pub fn read_file(&self, relative_path: &str) -> Result<Vec<u8>, std::io::Error> {
        let path = self.workspace_root.join(relative_path);
        if !path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("File not found: {}", relative_path),
            ));
        }
        std::fs::read(path)
    }

    pub fn read_file_text(&self, relative_path: &str) -> Result<String, std::io::Error> {
        let bytes = self.read_file(relative_path)?;
        String::from_utf8(bytes).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    pub fn delete_file(&self, relative_path: &str) -> Result<(), std::io::Error> {
        let path = self.workspace_root.join(relative_path);
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    }

    pub fn list_files(&self, subdirectory: &str) -> Result<Vec<StudyFile>, std::io::Error> {
        let dir = self.workspace_root.join(subdirectory);
        let mut files = Vec::new();

        if !dir.exists() {
            return Ok(files);
        }

        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let path = entry.path();

            if path.is_dir() {
                continue;
            }

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");

            let file_type = FileType::from_extension(ext);
            if file_type == FileType::Unknown {
                continue;
            }

            let created_at = metadata
                .modified()
                .map(|t| {
                    let datetime: chrono::DateTime<chrono::Utc> = t.into();
                    datetime.to_rfc3339()
                })
                .unwrap_or_default();

            files.push(StudyFile {
                id: Uuid::new_v4().to_string(),
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                file_type,
                created_at,
                x: 0.0,
                y: 0.0,
            });
        }

        Ok(files)
    }

    pub fn list_all_files(&self) -> Result<Vec<StudyFile>, std::io::Error> {
        let mut all_files = Vec::new();
        for subdir in &["documents", "notes"] {
            all_files.extend(self.list_files(subdir)?);
        }
        Ok(all_files)
    }

    pub fn workspace_join(&self, relative: &str) -> PathBuf {
        self.workspace_root.join(relative)
    }
}
