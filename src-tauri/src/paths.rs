use std::path::{Component, Path, PathBuf};

pub const DOCUMENTS_DIR: &str = "documents";
pub const NOTES_DIR: &str = "notes";
const MAX_NAME_BYTES: usize = 180;
const MAX_EXTENSION_CHARS: usize = 12;

#[derive(Clone, Debug)]
pub struct Workspace {
    root: PathBuf,
}

impl Workspace {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn default_root() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("annotate-studio")
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn join(&self, relative: &str) -> PathBuf {
        self.root.join(relative)
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        for dir in [DOCUMENTS_DIR, NOTES_DIR, "canvas", "analytics", "backups"] {
            std::fs::create_dir_all(self.root.join(dir))?;
        }
        Ok(())
    }

    pub fn resolve(&self, input: &str) -> Result<PathBuf, String> {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return Err("Path is empty".into());
        }
        let candidate = Path::new(trimmed);
        let relative = if candidate.is_absolute() {
            candidate
                .strip_prefix(&self.root)
                .map_err(|_| format!("Path is outside the workspace: {trimmed}"))?
                .to_path_buf()
        } else {
            candidate.to_path_buf()
        };
        let mut clean = PathBuf::new();
        for component in relative.components() {
            match component {
                Component::Normal(part) => clean.push(part),
                Component::CurDir => {}
                _ => return Err(format!("Invalid path: {trimmed}")),
            }
        }
        if clean.as_os_str().is_empty() {
            return Err("Path is empty".into());
        }
        Ok(self.root.join(clean))
    }

    pub fn resolve_user_file(&self, input: &str) -> Result<PathBuf, String> {
        let full = self.resolve(input)?;
        let inside = full
            .strip_prefix(&self.root)
            .ok()
            .and_then(|relative| relative.components().next())
            .is_some_and(|first| {
                first.as_os_str() == DOCUMENTS_DIR || first.as_os_str() == NOTES_DIR
            });
        if !inside {
            return Err(format!(
                "Only files in the documents and notes folders can be used: {}",
                input.trim()
            ));
        }
        Ok(full)
    }

    pub fn relative(&self, path: &Path) -> Option<String> {
        let rel = path.strip_prefix(&self.root).ok()?;
        let parts: Vec<String> = rel
            .components()
            .filter_map(|component| match component {
                Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
                _ => None,
            })
            .collect();
        if parts.is_empty() {
            None
        } else {
            Some(parts.join("/"))
        }
    }
}

pub fn unique_in_dir(dir: &Path, name: &str) -> PathBuf {
    let (stem, ext) = split_name(name);
    let mut candidate = dir.join(name);
    let mut index = 1;
    while candidate.exists() {
        let next = match &ext {
            Some(ext) => format!("{stem} ({index}).{ext}"),
            None => format!("{stem} ({index})"),
        };
        candidate = dir.join(next);
        index += 1;
    }
    candidate
}

pub fn split_name(name: &str) -> (String, Option<String>) {
    match name.rfind('.') {
        Some(idx) if idx > 0 && idx + 1 < name.len() => {
            (name[..idx].to_string(), Some(name[idx + 1..].to_string()))
        }
        _ => (name.to_string(), None),
    }
}

fn truncate_bytes(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

fn clean_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    cleaned.trim().trim_matches('.').trim().to_string()
}

pub fn sanitize_stem(name: &str) -> String {
    let cleaned = clean_name(name);
    let stem = truncate_bytes(&cleaned, MAX_NAME_BYTES).trim();
    if stem.is_empty() {
        "untitled".into()
    } else {
        stem.to_string()
    }
}

pub fn sanitize_file_name(name: &str) -> String {
    let trimmed = clean_name(name);
    if trimmed.is_empty() {
        return "untitled".into();
    }
    match split_name(&trimmed) {
        (stem, Some(ext)) if ext.chars().count() <= MAX_EXTENSION_CHARS && !ext.contains(' ') => {
            format!("{}.{ext}", sanitize_stem(&stem))
        }
        _ => sanitize_stem(&trimmed),
    }
}

pub fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn workspace() -> Workspace {
        Workspace::new(PathBuf::from("/data/annotate-studio"))
    }

    #[test]
    fn resolves_relative_paths_inside_root() {
        let ws = workspace();
        assert_eq!(
            ws.resolve("documents/a.pdf").unwrap(),
            PathBuf::from("/data/annotate-studio/documents/a.pdf")
        );
        assert_eq!(
            ws.resolve("./notes/b.md").unwrap(),
            PathBuf::from("/data/annotate-studio/notes/b.md")
        );
    }

    #[test]
    fn accepts_absolute_paths_inside_root() {
        let ws = workspace();
        assert_eq!(
            ws.resolve("/data/annotate-studio/documents/a.pdf").unwrap(),
            PathBuf::from("/data/annotate-studio/documents/a.pdf")
        );
    }

    #[test]
    fn rejects_traversal_and_foreign_paths() {
        let ws = workspace();
        assert!(ws.resolve("../secret").is_err());
        assert!(ws.resolve("documents/../../secret").is_err());
        assert!(ws.resolve("/etc/passwd").is_err());
        assert!(ws.resolve("   ").is_err());
    }

    #[test]
    fn builds_relative_paths_with_forward_slashes() {
        let ws = workspace();
        let path = PathBuf::from("/data/annotate-studio/notes/sub/x.md");
        assert_eq!(ws.relative(&path).unwrap(), "notes/sub/x.md");
        assert!(ws.relative(Path::new("/tmp/x.md")).is_none());
    }

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(sanitize_file_name("a/b\\c.pdf"), "a_b_c.pdf");
        assert_eq!(sanitize_file_name("  ...  "), "untitled");
        assert_eq!(sanitize_file_name("جزوه فیزیک.md"), "جزوه فیزیک.md");
        assert_eq!(sanitize_file_name(".hidden"), "hidden");
        assert_eq!(
            sanitize_file_name("Chapter 1. Introduction to Cell Biology"),
            "Chapter 1. Introduction to Cell Biology"
        );
        assert_eq!(
            sanitize_stem("Lecture 3.2 Kinetics"),
            "Lecture 3.2 Kinetics"
        );
    }

    #[test]
    fn limits_names_by_bytes() {
        let persian = "ی".repeat(150);
        let name = sanitize_file_name(&format!("{persian}.md"));
        assert!(name.len() <= MAX_NAME_BYTES + 3);
        assert!(name.ends_with(".md"));
        assert_eq!(sanitize_stem(&persian).chars().count(), 90);
    }

    #[test]
    fn restricts_user_files_to_library_folders() {
        let ws = workspace();
        assert!(ws.resolve_user_file("documents/a.pdf").is_ok());
        assert!(ws.resolve_user_file("notes/sub/b.md").is_ok());
        assert!(ws.resolve_user_file("providers.json").is_err());
        assert!(ws.resolve_user_file("backups/x.anos").is_err());
    }

    #[test]
    fn splits_names_into_stem_and_extension() {
        assert_eq!(split_name("a.tar.gz"), ("a.tar".into(), Some("gz".into())));
        assert_eq!(split_name("README"), ("README".into(), None));
        assert_eq!(split_name(".env"), (".env".into(), None));
    }
}
